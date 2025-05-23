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
    last,
    track,
    profile
};

const { flatten } = utils;
const { dbHost, dbPort, dbUser, dbPass, dbName } = consts.db.ecolog;
const { powerKit } = consts.secrets.ecoflow;

async function full(time) {
    const rec = await db.list({ gte: `log:${powerKit}:${time}`, limit: 1 });
    rec && console.log(flatten(rec[0].value));
}

// for a given time range (HH:mm HH:mm) dump EF API formatted
// records for each minute into their own file
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
// for a given time range, output two tables:
// 1) unchanged fieilds and their values
// 2) changing fields with value: variability % , volatility % , min , avg , max
// varibility % is a measure of the average change delta / range of values
// volatility % is a measure of how often a value changes between records / # records
async function profile(k1, k2) {
    const recs = await db.list({
        gte: `log:${powerKit}:${k1}`,
        lte: `log:${powerKit}:${k2}`,
    });
    const start = Date.now();
    // console.log('profile', { k1, k2, recs: recs.map(r => flatten(r.value)) });
    const data = {};
    let total = 0;
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
                if (total > 0 && track[3] !== value) {
                    // total # of mismatched records
                    track[4]++;
                    // sum of differences
                    track[5] += Math.abs(track[3] - value);
                }
                track[3] = value;
                total++;
            } else {
                // min, avg, max, last, diff
                data[key] = [ value, value, value, value, 0, 0 ];
            }
        }
    }
    const stat = [];
    const dyn = [];
    for (let [ key, rec ] of Object.entries(data)) {
        // compute average
        rec[1] = Math.round(rec[1] / recs.length);
        // compute volatility (# changes / # records)
        rec[4] = Math.round((rec[4] / recs.length) * 100);
        // compute % variability (sum of changes / # records) / (max - min)
        rec[5] = Math.round( (rec[5] / recs.length) / (rec[2] - rec[0]) * 100 );
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
            let out = [ rec[5], rec[4], rec[0], rec[1], rec[2] ].map((v,i) => {
                const str = v.toString().padStart(12, ' ');
                if (i < 2) {
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

// for two time stamps (HH:mm HH:mm) compute a difference
// between the two records and output only the fields that changed
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

// for a given time range (HH:mm HH:mm) output a single value per minute
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

// return latest db entry
async function last() {
    const rec = await db.list({ gte: `log:${powerKit}`, reverse: true, limit: 1 });
    rec && console.log(new Date(parseInt(rec[0].key.split(':')[2], 36)), flatten(rec[0].value));
}

// convert HH:mm[:mo:da] param to milliseconds for db ranges
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

// decode time arguments into milliseconds and execute chosen command
async function run(args) {
    const [ cmd, from, to, op ] = args;
    const log = utils.create_logger({ breakLength: 120 });

    await db.open(dbHost, dbPort);
    await db.auth(dbUser, dbPass);
    await db.use(dbName);

    if (!from) {
        await fns[cmd]();
    } else {
        const t1 = time(from);
        const k1 = (Math.round(t1/60000)*60000).toString(36).padStart(9,0);
        const t2 = time(to||'');
        const k2 = (Math.round(t2/60000)*60000).toString(36).padStart(9,0);
        // console.log({ from: t1, date: dayjs(t1).format('YYMMDD HHmmss ZZ') });
        await fns[cmd](k1, k2, op);
    }

    process.exit(0);
}

// grab two data log records and diff them with optional % delta threshold
// begin/end time arguments can be in the format:
// HH:mm (hour:minute)
// HH:mm:Mo (hour:minute:month)
// HH:mm:Mo:Da (hour:minute:month:day-of-month)
if (require.main === module) {
    const argv = process.argv.slice(2);
    if (argv.length < 1) {
        console.log('usage: cmd <...>');
        return;
    }
    run(argv);
}
