// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

// command-line query ecoflow logs from net-level

const fs = require('fs');
const dayjs = require('dayjs');
const utils = require('./utils');
const consts = require('./consts');
const { color, MOD, FG, BG } = require('./colors');

const NetLevel = require('@gridspace/net-level-client');
const log = utils.create_logger();
const db = new NetLevel();

const fns = {
    diff,
    dump,
    full,
    track,
    profile
};

const { flatten } = utils;
const { dbHost, dbPort, dbUser, dbPass, dbName } = consts.db.default;
const { powerKit } = consts.secrets.ecoflow;

async function full(time) {
    const rec = await db.list({ gte: `log:${powerKit}:${time}`, limit: 1 });
    rec && console.log(flatten(rec[0].value));
}

async function dump(k1, k2, dir = "db-export") {
    const q = await db.list({
        gte: `log:${powerKit}:${k1}`,
        lte: `log:${powerKit}:${k2}`,
    });
    for (let rec of q) {
        const { key, value } = rec;
        const time = key.split(':')[2];
        const day = dayjs(parseInt(time,36));
        const ymd = `${dir}/${day.format('YY/MMDD')}`;
        const hhm = day.format('HHmm');
        console.log(ymd, hhm);
        fs.mkdirSync(ymd, { recursive: true });
        fs.writeFileSync(`${ymd}/${hhm}.json`, JSON.stringify(flatten(value),null,4));
    }
}

// todo: implement top values to find most frequent value
async function profile(k1, k2) {
    const recs = await db.list({
        gte: `log:${powerKit}:${k1}`,
        lte: `log:${powerKit}:${k2}`,
    });
    const start = Date.now();
    // console.log('profile', { k1, k2, recs: recs.map(r => flatten(r.value)) });
    const data = {};
    for (let rec of recs.map(r => flatten(r.value))) {
        for (let [ key, value ] of Object.entries(rec)) {
            if (typeof(value) !== 'number') {
                continue;
            }
            const track = data[key];
            if (track) {
                track[0] = Math.min(track[0], value);
                track[1] += value;
                track[2] = Math.max(track[2], value);
                if (track[3] !== value) track[4]++;
                track[3] = value;
            } else {
                // min, avg, max, last, diff
                data[key] = [ value, value, value, value, 0 ];
            }
        }
    }
    const stat = [];
    const dyn = [];
    for (let [ key, rec ] of Object.entries(data)) {
        rec[1] = Math.round(rec[1] / recs.length);
        rec[4] = Math.round((rec[4] / recs.length) * 100);
        key = color(key, FG.yellow);
        if (rec[0] === rec[2]) {
            let out = rec[0].toString().padStart(12,' ');
            out = [
                color(out, rec[0] < 0 ? FG.RED : FG.green),
                ' ',
                key
            ].join(' ');
            stat.push(out);
        } else {
            let out = [ rec[4], rec[0], rec[1], rec[2] ].map((v,i) => {
                const str = v.toString().padStart(12, ' ');
                if (i === 0) {
                    return color(v, v < 5 ? FG.GREEN :
                        (v < 50 ? FG.YELLOW : FG. RED)
                    );
                } else {
                    return color(str, v < 0 ? FG.RED : FG.green)
                }
            });
            out = [
                ...out.map(v => v.toString().padStart(12,' ')),
                ' ',
                key
            ].join(' ');
            dyn.push(out);
        }
    }
    const rps = parseFloat(((recs.length * 1000) / (Date.now() - start)).toFixed(2));
    console.log('\n');
    console.log(stat.join('\n'));
    console.log('\n');
    console.log(dyn.join('\n'));
    console.log('\n');
    console.log({
        rps,
        recs: recs.length,
        static: Object.keys(stat).length,
        dynamic: Object.keys(dyn).length
    });
}

async function diff(k1, k2, delta) {
    if (!(k1 && k2)) {
        console.log('usage: diff hh:mm hh:mm <delta=0..1>');
        return;
    }

    delta = parseFloat(delta || 0);

    console.log({ k1, k2, delta });

    const r1 = await db.list({ gte: `log:${powerKit}:${k1}`, limit: 1 });
    const r2 = await db.list({ gte: `log:${powerKit}:${k2}`, limit: 1 });
    const v1 = flatten(r1[0].value);
    const v2 = flatten(r2[0].value);

    for (let [ key, val1 ] of Object.entries(v1)) {
        const val2 = v2[key];
        const maxx = Math.max(...[ val1, val2 ].map(v => Math.abs(v)));
        if (typeof val1 === 'number') {
            const diff = val2 - val1;
            if (diff && Math.abs(diff/maxx) > delta) {
                log(key.padEnd(40,' '), { diff, val1, val2 });
            }
        } else if (val1 !== val2) {
            log(key.padEnd(40, ' '), { val1, val2 });
        }
    }
}

async function track(k1, k2, field) {
    if (!(k1 && k2 && field)) {
        console.log('usage: track hh:mm hh:mm field');
        return;
    }

    const recs = await db.list({ gte: `log:${powerKit}:${k1}`, lte: `log:${powerKit}:${k2}` });

    console.log({ k1, k2, field });
    let min = Infinity;
    let max = -Infinity;

    for (let rec of recs) {
        let { key, value } = rec;
        const map = flatten(value);
        const time = dayjs(parseInt(key.split(':')[2], 36)).format('HH:mm');
        const val = map[field];
        min = Math.min(min, val);
        max = Math.max(max, val);
        log(time, val);
    }

    log({ min, max });
}

function time(str) {
    let tm = dayjs().second(0).millisecond(0);
    const [ hr, mn, mo, da ] = str.split(':').map(v => parseInt(v || -1));
    // console.log({ hr, mn, mo, da });
    if (hr >= 0) tm = tm.hour(hr);
    if (mn >= 0) tm = tm.minute(mn);
    if (mo >= 1) tm = tm.month(mo - 1);
    if (da >= 1) tm = tm.date(da);
    return tm.valueOf();
}

async function run(args) {
    const [ cmd, from, to, op ] = args;
    const log = utils.create_logger({ breakLength: 120 });

    await db.open(dbHost, dbPort);
    await db.auth(dbUser, dbPass);
    await db.use(dbName);

    const t1 = time(from);
    const k1 = (Math.round(t1/60000)*60000).toString(36).padStart(9,0);

    const t2 = time(to||'');
    const k2 = (Math.round(t2/60000)*60000).toString(36).padStart(9,0);

    // console.log({ from: t1, date: dayjs(t1).format('YYMMDD HHmmss ZZ') });
    await fns[cmd](k1, k2, op);

    process.exit(0);
}

// grab two data log records and diff them with optional % delta threshold
if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.length < 1) {
        console.log('usage: cmd <...>');
        return;
    }
    run(argv);
}
