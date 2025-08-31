#!/usr/bin/env node

import fs from 'fs';
import dotenv from 'dotenv';
import minimist from 'minimist';
import mqtt from 'mqtt';

import { connectToHost, globalShutdown } from '../lib/modbus/collect.mjs';
import { analyzePacketBuffer } from '../lib/modbus/analyze.mjs';

dotenv.config();

const args = minimist(process.argv.slice(2));
const { env } = process;
const { MQTT_HOST, MQTT_PORT, MQTT_TOPIC, MQTT_USER, MQTT_PASS } = env;
let mqtt_client;

const command = args._[0];
const hosts = (args.hosts || '192.168.44.4').split(',');
const maxPackets = args['max-packets'] ? parseInt(args['max-packets'], 10) : null;
const timeoutSeconds = args.timeout ? parseInt(args.timeout, 10) : null;

function handlePacket(buffer, { host, packetCounter }) {
    const shouldAnalyze = args.analyze;
    const shouldMqtt = mqtt_client && mqtt_client.connected;

    if (shouldAnalyze || shouldMqtt) {
        try {
            const analysis = analyzePacketBuffer(buffer);
            if (shouldAnalyze) {
                console.log(JSON.stringify({ host, ...analysis }, null, 2));
            }
            if (shouldMqtt) {
                client.publish(`${MQTT_TOPIC ?? 'modbus/data'}/${analysis.inverterSerial}`, JSON.stringify(analysis.decodedValues));
            }
        } catch (e) {
            console.error(`[${host}] Error analyzing packet:`, e.message);
        }
    }
}

switch (command) {
    case 'collect':
        if (args.mqtt) {
            mqtt_client = mqtt.connect({
                host: MQTT_HOST,
                port: parseInt(MQTT_PORT ?? 1883),
                username: MQTT_USER,
                password: MQTT_PASS
            }).on('connect', () => {
                console.error(`MQTT connected to ${MQTT_HOST}:${MQTT_PORT}`);
            }).on('error', (err) => {
                console.error(`MQTT connection error: ${err}`);
                process.exit(1);
            });
        }

        console.log(`Starting collector for hosts: ${hosts.join(', ')}`);
        hosts.forEach(host => {
            connectToHost(host, {
                maxPackets,
                onPacket: handlePacket,
                outputDir: args['output-dir'],
                storePacket: args.nosave ?? true
            });
        });

        if (timeoutSeconds) {
            console.log(`Script will time out after ${timeoutSeconds} seconds.`);
            setTimeout(globalShutdown, timeoutSeconds * 1000);
        }
        break;

    case 'analyze':
        const filepath = args._[1];
        if (!filepath || !fs.existsSync(filepath)) {
            console.error('Please provide a valid file path to analyze.');
            process.exit(1);
        }
        try {
            const buffer = fs.readFileSync(filepath);
            const analysis = analyzePacketBuffer(buffer);
            console.log(JSON.stringify(analysis, null, 2));
        } catch (e) {
            console.error('Error analyzing file:', e.message);
        }
        break;

    default:
        console.log(`
Usage: main.js <command> [options]

Commands:
  collect                     Connect to inverters and stream data
    --analyze                 Decode packets and print to console instead of saving
    --hosts=<h1,h2>           Comma-separated list of inverter IPs
    --max-packets=<n>         Exit after collecting n packets
    --mqtt (see env notes)    Publish analyzed data to MQTT
    --nosave                  Disable default packet file storage
    --output-dir=<dir>        Directory for packet file storage (default 'modbus-logs')
    --timeout=<s>             Exit after s seconds

  analyze <filepath>          Analyze a single saved .bin packet file

Environment Variables:
   MQTT_HOST                 MQTT broker host (default 'localhost')
   MQTT_PORT                 MQTT broker port (default 1883)
   MQTT_TOPIC                MQTT topic to publish data (default 'modbus/data')
   MQTT_USER                 MQTT username (optional)
   MQTT_PASS                 MQTT password (optional)
`.trim());
}

process.on('SIGINT', () => {
    console.log('Caught interrupt signal.');
    globalShutdown();
});
