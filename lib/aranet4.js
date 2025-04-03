// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

/**
 * parse aranet4 file record and push to net-level
 */

const { args } = require('./utils');
const consts = require('./consts');
const NetLevel = require('@gridspace/net-level-client');
const db = new NetLevel();
const fs = require('fs').promises;
const interval = parseFloat(args.interval || 0) * 60000;

async function start_db() {
    const { dbHost, dbPort, dbUser, dbPass, dbName } = consts.db.aralog;

    await db.open(dbHost, dbPort);
    await db.auth(dbUser, dbPass);
    await db.use(dbName);
}

async function parse(file) {
    let data = await fs.readFile(file);
    let lines = data
        .toString()
        .split('\n')
        .filter(l => l.indexOf(':') > 0)
        .map(l => l.split(':').map(t => t.trim()));
    let rec = {};
    lines.forEach(line => {
        [ key, val ] = line;
        rec[key] = val.split(' ');
    });
    return rec;
}

(async function run() {

    if (interval) {
        console.log(new Date(), 'processing new aranet4 data');
    }

    if (args.file) {
        parse(args.file).then(rec => console.log(rec));
    }

    let lastkey = '';
    if (args.store) {
        await start_db();
        lastkey = await db.list({ reverse: true, limit: 1, values: false });
    }

    if (args.dir) {
        let files = await fs.readdir(args.dir);
        let paths = files.map(file => `${args.dir}/${file}`);
        for (let path of paths) {
            let time = path.split('/').pop().split('.')[0].replace('-',':');
            // console.log({ time });
            let rec = await parse(path);
            if (args.store) {
                if (!lastkey || time > lastkey) {
                    await db.put(time, rec);
                    console.log('stored', time);
                }
            } else {
                console.log(time, rec);
            }
        }
    }

    if (interval) {
        setTimeout(run, interval);
    } else {
        process.exit();
    }

})();
