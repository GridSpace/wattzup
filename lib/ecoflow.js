// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

/**
 * pull data from ecoflow api and store in net-level db
 * to facilitiate time-series graphs and correlations with CAN bus data
 */

const dayjs = require('dayjs');
const util = require('util');
const utils = require('./utils');
const consts = require('./consts');
const NetLevel = require('@gridspace/net-level-client');
const context = {};

const { create_logger, osort, hmac_sha256, flatten, args } = utils;
const { ecoHost, accessKey, secretKey } = consts.secrets.ecoflow;

const GET_MQTT_CERTIFICATION_URL = ecoHost + "/iot-open/sign/certification";
const DEVICE_LIST_URL = ecoHost + "/iot-open/sign/device/list";
const SET_QUOTA_URL = ecoHost + "/iot-open/sign/device/quota";
const GET_QUOTA_URL = ecoHost + "/iot-open/sign/device/quota";
const GET_ALL_QUOTA_URL = ecoHost + "/iot-open/sign/device/quota/all";

const logger = create_logger({ breakLength: 120 });
const is_test = args.test;
const db = is_test ? null : new NetLevel();

async function request(url, params) {
    const timestamp = Date.now().toString();
    const nonce = Math.round(Math.random() * 0xffffff);
    const signit = Object.assign({}, { ...(params || {}), accessKey, nonce, timestamp });
    const sign = await hmac_sha256(new URLSearchParams(flatten(signit)).toString(), secretKey);
    if (params) {
        url = url + '?' + new URLSearchParams(flatten(params));
    }
    const headers = {
        accessKey,
        timestamp,
        nonce,
        sign
    };
    const res = await context.fetch(url, { headers });
    const json = await res.json();
    if (!json.data) {
        // logger({ url, no_data: json });
        return;
    }
    // console.log({ json });
    // decode object data output
    if (typeof(json.data) === 'object' && !Array.isArray(json.data)) {
        for (let [k,v] of Object.entries(json.data)) {
            // console.log({ k, v });
            let type = typeof v;
            if (type === 'string' && (v[0] === '{' || v[0] === '[')) {
                json.data[k] = JSON.parse(v);
            } else {
                json.data[k] = v;
            }
        }
    }
    return osort(json.data);
}

async function update_stats() {
    let date = dayjs(Date.now()).format('HH:mm:ss.SSS');
    console.log({ update: date });
    const devs = context.devs = await request(DEVICE_LIST_URL);
    for (let dev of (devs || [])) {
        if (db) {
            db.put(`dev:${dev.sn}`, dev);
        }
        if (dev.online) {
            const data = await request(GET_ALL_QUOTA_URL, { sn: dev.sn });
            if (!data) {
                logger([ dev.deviceName, 'online', 'NO DATA' ]);
                continue;
            }
            console.log([ dev.deviceName, 'online' ]);
            if (db) {
                db.put(`log:${dev.sn}:${Date.now().toString(36).padStart(9,0)}:${dev.online}`, data);
            } else {
                // logger(data);
                logger(flatten(data));
            }
        } else {
            console.log([ dev.deviceName, 'offline' ]);
        }
    }
}

async function start() {
    const { dbHost, dbPort, dbUser, dbPass, dbName } = consts.db.ecolog;

    await db.open(dbHost, dbPort);
    await db.auth(dbUser, dbPass);
    await db.use(dbName);

    const tick = 60000;
    const next = Math.ceil(Date.now() / tick) * tick;
    // delay start() to a minute boundary
    setTimeout(() => {
        update_stats();
        setInterval(update_stats, tick);
    }, next - Date.now());
}

import('node-fetch').then(async fetch => {
    context.fetch = fetch.default;
    if (is_test) {
        update_stats();
    } else {
        start();
    }
});
