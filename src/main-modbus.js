#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { connectToHost, globalShutdown, OUTPUT_DIR } from '../lib/modbus/collect.js';
import { analyzePacketBuffer } from '../lib/modbus/analyze.js';
// import mqtt from 'mqtt'; // Placeholder for MQTT integration

const args = minimist(process.argv.slice(2));

const command = args._[0];
const hosts = (args.hosts || '192.168.44.4').split(',');
const maxPackets = args['max-packets'] ? parseInt(args['max-packets'], 10) : null;
const timeoutSeconds = args.timeout ? parseInt(args.timeout, 10) : null;

function getFormattedTimestamp() {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function handlePacket(buffer, { host, packetCounter }) {
    const shouldAnalyze = args.analyze;
    const shouldMqtt = args.mqtt;

    if (shouldAnalyze) {
        try {
            const analysis = analyzePacketBuffer(buffer);
            console.log(JSON.stringify({ host, ...analysis }, null, 2));

            if (shouldMqtt) {
                // const client = mqtt.connect('mqtt://your_broker_address');
                // client.on('connect', () => {
                //     client.publish(`inverter/${analysis.inverterSerial}`, JSON.stringify(analysis.decodedValues));
                //     client.end();
                // });
                console.log('--- Would send to MQTT ---');
            }
        } catch (e) {
            console.error(`[${host}] Error analyzing packet:`, e.message);
        }
    } else {
        // Default behavior: save to file
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR);
        }
        const safeHost = host.replace(/\./g, '_');
        const timestamp = getFormattedTimestamp();
        const filename = `${timestamp}.${safeHost}.${packetCounter.toString().padStart(4, '0')}.bin`;
        const filepath = path.join(OUTPUT_DIR, filename);

        console.log(`[${host}] Saving packet to ${filepath} (${buffer.length} bytes)`);
        fs.writeFile(filepath, buffer, (err) => {
            if (err) console.error(`[${host}] Error writing file: ${err.message}`);
        });
    }
}

switch (command) {
    case 'collect':
        console.log(`Starting collector for hosts: ${hosts.join(', ')}`);
        hosts.forEach(host => {
            connectToHost(host, {
                maxPackets,
                onPacket: handlePacket
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
  collect                     Connect to inverters and stream data.
    --hosts=<h1,h2>           Comma-separated list of inverter IPs.
    --max-packets=<n>         Exit after collecting n packets.
    --timeout=<s>             Exit after s seconds.
    --analyze                 Decode packets and print to console instead of saving.
    --mqtt                    (Requires --analyze) Publish analyzed data to MQTT.

  analyze <filepath>          Analyze a single saved .bin packet file.
`.trim());
}

process.on('SIGINT', () => {
    console.log('Caught interrupt signal.');
    globalShutdown();
});
