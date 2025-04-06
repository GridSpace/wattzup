// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

const NetLevel = require('@gridspace/net-level-client');
const readline = require('readline');
const dayjs = require('dayjs');
const util = require('util');
const fs = require('fs');
const fsp = require('node:fs/promises');
const { args } = require('../lib/utils');
const { crc16 } = require('../lib/crc16.js');
const { color, MOD, FG, BG } = require('./colors');

// maintains current record formats if file changes
const fmt = {
    file: "lib/structs.json",
    last: 0,
    map: {},
    load() {
        clearTimeout(fmt.timer);
        fmt.timer = setTimeout(fmt.load, 1000);
        const mod = fs.statSync(fmt.file).mtimeMs;
        if (mod !== fmt.last) {
            if (fmt.last) log('re-loaded record formats');
            fmt.map = JSON.parse(fs.readFileSync(fmt.file));
            fmt.last = mod;
        }
    }
};

const logopt = {
    maxArrayLength: null,
    breakLength: Infinity,
    colors: true,
    compact: true,
    sorted: false,
    depth: null
};

const count = {};
const file = process.argv[2];
const join = args.tab ? '\t' : ' ';

if (!file) {
    return console.log('usage: can [file | -] <args>');
}

function inspect(v, opt) {
    return typeof v === 'string' ? v : util.inspect(v, opt || logopt);
}

function log() {
    console.log( [...arguments].map(v => inspect(v, logopt)).join(join) );
}

function incr(dom, key) {
    const dmap = (count[dom] = (count[dom] || {}));
    const pre = (dmap[key] || 0);
    dmap[key] = pre + 1;
    return pre;
}

function set4(map, key) {
    return map[key] || (map[key] = new Set());
}

function group(arr, len = 4) {
    const ret = [];
    for (let i=0; i<arr.length; i+=len) {
        ret.push(arr.slice(i,i+len));
    }
    return ret;
}

function b2c(bytes) {
    return bytes.map(b => b > 31 && b < 127 ? String.fromCharCode(b) : '.').join('');
}

function bv2(msg, start) {
    const lo = msg.slice(start, start + 2);
    const hi = msg.slice(start + 2, start + 4);
    return hi + lo;
}

function le16(msg, start) {
    return parseInt(bv2(msg, start), 16);
}

/**
 * extracts named regions of a message payload into a map
 * can be printed and/or accumulated into per/minute EF API style records
 *
 * message channels "A" and "C" use [key prefixes] while "B" does not
 * this is a legacy condition because "B" channel was the original code base
 *
 * @param {String} dat hex/string version of binary `buf`
 * @param {ArrayBuffer} buf binary message
 * @param {Object} format record definition from `structs.json`
 * @param {boolean} report accumulate coverage % for record bytes to payload
 * @returns decoded record
 */
function decode(dat, buf, format, report) {
    let rec = {};
    let lpos;
    let used = 0;
    for (let [key, fmt] of Object.entries(format)) {
        if (!Array.isArray(fmt)) {
            continue;
        }
        const [ pos, type, desc ] = fmt;
        if (type === 's16') {
            rec[key] = dat.slice(pos, pos + 16).map(v => String.fromCharCode(v)).join('');
            used += 16;
        } else if (type === 's4') {
            rec[key] = dat.slice(pos, pos + 4).map(v => String.fromCharCode(v)).join('');
            used += 4;
        } else if (type === 's20') {
            rec[key] = dat.slice(pos, pos + 20).map(v => String.fromCharCode(v)).join('');
            used += 20;
        } else if (type === 'str') {
            const len = rec[key] = buf.readUint8(pos);
            rec[key] = dat.slice(pos + 1, pos + len + 1).map(v => String.fromCharCode(v)).join('');
            lpos = pos + len + 1;
            used += len + 2;
        } else if (type === 'dq') {
            rec[key] = dat.slice(pos, pos + 4).map(v => v.toString()).join('.');
            used += 4;
        } else if (type === 'dqr') {
            const k1 = dat.slice(pos + 0, pos + 2).map(v => v.toString()).reverse().join('.');
            const k2 = dat.slice(pos + 2, pos + 4).map(v => v.toString()).reverse().join('.');
            rec[key] = [k2, k1].join('.');
            used += 4;
        } else if (type === 'i16') {
            rec[key] = buf.readInt16LE(pos);
            used += 2;
        } else if (type === 'u16') {
            rec[key] = buf.readUint16LE(pos)
            used += 2;
        } else if (type === 'f32') {
            rec[key] = buf.readFloatLE(pos)
            used += 4;
        } else if (type === 'i32') {
            rec[key] = buf.readInt32LE(pos)
            used += 4;
        } else if (type === 'u32') {
            rec[key] = buf.readUint32LE(pos)
            used += 4;
        } else if (type === 'u8') {
            rec[key] = buf.readUint8(pos);
            used++;
        } else {
            throw `unknown decode type: ${type}`;
        }
    }
    if (report) {
        rec.used = [ used, buf.length ];
    }
    return rec;
}

// create readable stream from either file or stdin
function readStream(file) {
    if (file === '-') {
        return readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
            crlfDelay: Infinity
        });
    } else {
        return readline.createInterface({
            input: fs.createReadStream(file),
            crlfDelay: Infinity
        });
    }
}

async function openBase() {
    if (!(args.pmm && typeof(args.pmm) === 'string')) {
        return undefined;
    }
    const [ base, host, port, user, pass ] = args.pmm.split(',');
    const db = new NetLevel();
    await db.open(host || 'localhost', port || 3001);
    if (user) await db.auth(user, pass || '');
    await db.use(base || 'canlog');
    return db;
}

async function load() {
    const base = await openBase();
    const lines = readStream(file);
    fmt.load();

    let ldup;
    let lseq;
    let lout;
    let lhex;
    let recs = 0;
    let dups = 0;
    let dupadd = 0;
    let dupdel = 0;
    let dropped = 0;
    let duplist = [];
    let regenfd;
    let regenlf;
    let lasttime = 0;

    const duptime = parseInt(args.duptime || 5000);
    const tfact = parseInt(args.tf || 1) * 1000;
    const meta = {};
    const mcache = {};
    const mkeystr = {};
    const mstrpath = {};
    const samples = {};
    const pivot = [];
    const stat = {};
    const sern = {};
    const scan = {};
    const msgs = {}; // key = nid | accumulated ascii hex for message
    const bufs = {}; // key = nid | accumulated byte buffer for message
    const flag = {}; // key = nid | flags for message
    const regen = {};
    const pv_time = parseInt(args.pivot) || 4;
    const scanv = (args.scan || '0:0').split(':').map(v => parseInt(v));
    const scanf = (args.scanf || '0:0').split(':').map(v => parseFloat(v));
    const saved = args.excl ? JSON.parse(fs.readFileSync('cl-counts.save')) : undefined;
    const regenfn = !args.regen ? undefined :
        args.regen === true ? 'regen.out/YY/MMDD/HHmm' :
        args.regen;
    const regenli = regenfn ? regenfn.lastIndexOf('/') : -1;
    const regenpo = regenfn ? (regenli > 0 ? regenli : regenfn.length) : 0;
    const used = args.rec && args.rec === 'used';
    const xrty = args.xrty?.split(',');
    const typs = args.typs?.split(',');
    const nods = args.nodes?.split(',');
    const rrfs = args.rrfs?.split(',');
    const dv4s = args.dv4s?.split(',');
    const tinc = parseInt(args.tinc || 0);

    if (scanv[1] === undefined) {
        scanv.push(scanv[0]);
    }
    if (scanf[1] === undefined) {
        scanv.push(scanf[0]);
    }
    const scan8 = scanv[0] >= -256 && scanv[0] <= 255 && scanv[1] >= -256 && scanv[1] <= 255;

    // --regen emit can log correlated grouped canbus lines
    function write_group(group) {
        if (!(group && group.length) || args.pick) {
            return;
        }
        const mark = group[0][1];
        const time = Math.round(parseFloat(mark.slice(1, mark.length - 1) * tfact));
        const fnout = dayjs(time).format(regenfn);
        if (fnout !== regenlf) {
            if (regenfd) regenfd.end();
            fs.mkdirSync(fnout.slice(0, regenpo), { recursive: true });
            regenfd = fs.createWriteStream(`${fnout}.can`, { flags: 'a' });
            regenlf = fnout;
            // check for a change in sampling
            if (fs.existsSync('sample.on') && !args.sample) {
                args.sample = true;
                log('enabling sampling');
            } else if (fs.existsSync('sample.off') && args.sample) {
                args.sample = false;
                log('disabling sampling');
            }
        }
        for (let line of group) {
            const [ node, stamp, data ] = line;
            regenfd.write(`${stamp} canX ${node}#${data}\n`);
        }
    }

    // --regen culling, check if record is dup within in a time window
    function isdup(chtime, chstr) {
        let cull = 0;
        let found = false;
        for (let i=0; i<duplist.length; i++) {
            const [ time, str ] = duplist[i];
            if (chtime - time > duptime) {
                duplist[i] = null;
                dupdel++;
                cull++;
            }
            if (chstr.length === str.length && chstr === str) {
                found = true;
                dups++;
                break;
            }
        }
        if (!found || cull > 0) {
            duplist = duplist.filter(v => v);
        }
        if (!found) {
            dupadd++;
            duplist.push([ chtime, chstr ]);
        }
        return found;
    }

    // add matching scan record for later reporting
    function addscan(act, pos, len) {
        const arec = (scan[act] = (scan[act] || {}));
        const pkey = len + "_" + pos.toString().padStart(3,0);
        (arec[pkey] = (arec[pkey] || 0) + 1);
    }

    // look for a 1,2,4 length byte sequence that matches
    // a value range, accumulate and count the offset position
    // for identifying likely field positions.
    function matchscan(str, dat, scanv, addscan) {
        let match = false;
        const [ lo, hi ] = scanv;
        const bufr = Buffer.from(dat);
        if (scan8) {
            for (let i=0; i<dat.length; i++) {
                const val = args.signed ? bufr.readInt8(i) : bufr.readUint8(i);
                if (val >= lo && val <= hi) {
                    addscan(str, i, 1);
                    match = true;
                }
            }
        }
        for (let i=0; i<dat.length-1; i++) {
            const val = args.signed ? bufr.readInt16LE(i) : bufr.readUint16LE(i);
            if (val >= lo && val <= hi) {
                addscan(str, i, 2);
                match = true;
            }
        }
        for (let i=0; i<dat.length-3; i++) {
            let val = args.signed ? bufr.readInt32LE(i) : bufr.readUint32LE(i);
            if (val >= lo && val <= hi) {
                addscan(str, i, 4);
                match = true;
            }
            val = bufr.readFloatLE(i);
            if (val >= lo && val <= hi) {
                addscan(str, i, '4f');
                match = true;
            }
            val = Math.floor(val);
            if (val >= lo && val <= hi) {
                addscan(str, i, '4f');
                match = true;
            }
            val = bufr.readFloatBE(i);
            if (val >= lo && val <= hi) {
                addscan(str, i, '4F');
                match = true;
            }
        }
        return match;
    }

    const warn = new Set();

    // compare ef-api record key/values for this time with record data
    // blob from this stream and find correlations
    function metascan(mark, str, dat, offmin) {
        const path = mark.format('YY/MMDD/HHmm');
        const fp = offmin ? mark.add(offmin, 'minute').format('YY/MMDD/HHmm') : path;
        let rec = mcache[fp];
        if (!rec) {
            try {
                const dir = args.meta !== true ? args.meta : 'db-export';
                const json = fs.readFileSync(`${dir}/${fp}.json`);
                rec = mcache[fp] = Object.entries(JSON.parse(json));
            } catch (e) {
                const wstr = `no meta source: ${fp}`;
                if (!warn.has(wstr)) {
                    // throw `no meta source: ${fp}`;
                    console.log(wstr);
                    warn.add(wstr);
                }
                return;
            }
        }
        ( mstrpath[str] || (mstrpath[str] = new Set()) ).add(path);
        incr('min', path);
        for (let [ key, value ] of rec) {
            if (typeof(value) !== 'number' || value === 0) {// || value === 1 || value === 2) {
                continue;
            }
            set4(mkeystr, `${key}-${str}`).add(path);
            const off = value / 50;
            const rng = [ Math.floor(value - off), Math.ceil(value + off) ];
            matchscan(str, dat, rng, (s, idx, size) => {
                // api object key record
                const mrec = meta[key] || (meta[key] = {});
                // under key, stream record
                const srec = mrec[str] || (mrec[str] = {});
                // under stream, index => path set
                const pset = srec[idx] || (srec[idx] = new Set());
                pset.add(path);
            });
        }
    }

    // increment pivot record given a time mark and key
    function addpivot_time(mark, k2) {
        let k1 = mark.format('HHmmssSSS').substring(0, pv_time);
        addpivot(k1, k2);
    }

    // increment pivot record given two keys
    function addpivot(k1, k2) {
        let found = false;
        for (let row of pivot) {
            let [ v1, v2 ] = row;
            if (v1 === k1 && v2 === k2) {
                row[2] = row[2] + 1;
                found = true;
                break;
            }
        }
        if (!found) {
            pivot.push([ k1, k2, 1 ]);
        }
    }

    // diff to hex string arrays and color highlight the differences
    function diff(lhex, chex) {
        if (!lhex || lhex.length !== chex.length) {
            return color(chex.map(v => v.join('')).join(join), FG.magenta);
        }
        const pre = lhex.map(v => v.join(''));
        const post = chex.map(v => v.join(''));
        const out = [];
        for (let i=0; i<pre.length; i++) {
            if (pre[i] !== post[i]) {
                out.push(color(post[i], FG.red));
            } else {
                out.push(color(post[i], FG.blue));
            }
        }
        return out.join(join);
    }

    // return or set a serial name for a module
    function ser(mod, name) {
        const onam = sern[mod];
        if (!onam && name) {
            return sern[mod] = name;;
        } else if (name && onam !== name) {
            if (args.err) console.log({ SER_MISMATCH: onam, name, mod });
            if (args.abort) throw "serial number mismatch";
        }
        const ret = onam || name || ''.padStart(16,'_');
        // replace unprintable for undecoded lines debugging
        const fix = ret.split('').map(v => {
            const cca = v.charCodeAt(v);
            return cca < 32 || cca > 125 ? '_' : v
        }).join('');
        return fix;
    }

    let minPromises = [];
    let minuteMap = {};
    let lastYDHM;
    // accumulate per-minute, per-stat band (low,avg,high) records
    function min_data(ydhm, rec, fmt, sno) {
        if (lastYDHM !== ydhm) {
            if (lastYDHM) {
                for (let [key, rec] of Object.entries(minuteMap)) {
                    minuteMap[key] = [ rec[0], rec[1], Math.round(rec[2] / rec[3]) ];
                }
                if (base) {
                    minPromises.push(base.put(lastYDHM, osort(minuteMap)));
                } else {
                    console.log(lastYDHM, osort(minuteMap));
                }
            }
            minuteMap = {};
            lastYDHM = ydhm;
        }
        if (!rec) {
            return;
        }
        if (sno[0] === '_') {
            sno = undefined;
        }
        for (let [key, val] of Object.entries(rec)) {
            let fdef = fmt[key];
            let fkey = fdef[2];
            if (!fkey) {
                continue;
            }
            if (fkey.indexOf('[x]') > 0) {
                // skip module records for now (fixed and unknown index mapping)
                continue;
            }
            const hasSer = fkey.indexOf('_serial_') > 0;
            if (hasSer && sno) {
                fkey = fkey.replace('_serial_', sno);
            } else if (hasSer) {
                // skip output if requires sno and we don't have it yet
                continue;
            }
            if (typeof(val) === 'string') {
                minuteMap[fkey] = val;
            } else {
                const mmv = minuteMap[fkey];
                if (mmv) {
                    mmv[0] = Math.min(mmv[0], val);
                    mmv[1] = Math.max(mmv[1], val);
                    mmv[2] += val;
                    mmv[3]++;
                } else {
                    // min, max, sum, count
                    minuteMap[fkey] = [ val, val, val, 1 ];
                }
            }
            // console.log('--', fkey, val);
        }
    }

    // iterate over incoming can log lines and apply cmd line options
    for await (let line of lines) {
        if (args.csv) {
            let tok = line.split(',');
            let nod = tok[1];
            let len = parseInt(tok[5]);
            let byt = tok.slice(6,6 + len);
            line = `(1709845200.032995) canX ${nod}#${byt.join('')}`;
            // log({ nod, len, byt, line });
        }
        const [ stamp, can, node, data ] = line
            .replace('#', ' ')
            .split(' ');

        if (!(node && data)) {
            continue;
        }

        const bytes = [];
        const recms = tinc ? lasttime + tinc : parseFloat(stamp.substring(1,stamp.length-2) * tfact);
        const mark = dayjs(recms);
        const time = mark.format('YYMMDD.HHmmss.SSS');
        const ydhm =  mark.format('YYMMDD.HHmm');

        // optionally synthesize timestamps when missing
        lasttime = recms;

        incr('scan', ydhm);

        // convert hex to byte array
        for (let i = 0; i < data.length; i += 2) {
            bytes.push(parseInt(data.slice(i, i + 2), 16));
        }

        // split out command and node id from prefix
        const cmd = node.slice(0,3);
        const nid = node.slice(3);

        if (nods && nods.indexOf(nid) < 0) {
            continue;
        }
        if (args.node && nid !== args.node) {
            continue;
        }
        if (args.cmd && cmd !== args.cmd) {
            continue;
        }

        incr('cmd', cmd);
        incr('nid', nid);

        if (args.debug) {
            log({ nid, cmd, data });
        }

        let chan;
        if (cmd[0] === '0') chan = 'A';
        else if (cmd === '106') chan = 'D';
        else if (cmd === '10A') chan = 'E';
        else if (['100','101','102'].indexOf(cmd) >= 0) chan = 'B';
        else if (['120','121','122'].indexOf(cmd) >= 0) chan = 'C';
        let stream = chan ? `${chan}${nid}` : nid;

        // stop now if channel type know and not matching
        if (args.chan && chan && args.chan !== chan) {
            continue;
        }

        incr('chan', chan || cmd);

        // stream base types 004 and 005 -- channel type "A"
        if (cmd[0] === '0') {
            if (args.regen) {
                regen[stream].push([ node, stamp, data ]);
            }
            // remove length byte for packing
            let pln = bytes.shift(); // remove length byte for packing
            if (cmd === '004' || cmd === '005') {
                msgs[stream] = [ data.slice(2) ];
                bufs[stream] = bytes;
                flag[stream] = cmd;
                continue;
            }
            if (!msgs[stream]) {
                if (args.err) {
                    log({ NO_STREAM: stream, cmd, pln, msg:msgs[stream] });
                }
                dropped++;
                continue;
            }
            if (bytes.length > pln) {
                // some messages are 00 padded at the end
                // log({ correct: bytes.length, to: pln });
                bufs[stream].push(...bytes.slice(0,pln));
                msgs[stream].push(data.slice(2, pln * 2 + 2));
            } else {
                bufs[stream].push(...bytes);
                msgs[stream].push(data.slice(2));
            }
            if (pln === 7) {
                continue;
            }
            recs++;
            let flg = flag[stream];
            delete msgs[stream];
            delete flag[stream];

            if (args.flg && args.flg !== true && flg !== args.flg) {
                continue;
            }

            recs++;
            const buf = bufs[stream];
            const len = buf.length;
            const msg = buf.map(v => v.toString(16).padStart(2,0)).join('').toUpperCase();
            const pre = msg.slice(0,4);     // 2 byte = 0xAA02 (0x02aa)
            delete msgs[stream];
            // check for dups within a sliding time window
            if (args.reduce && isdup(recms, node + msg.slice(0,12) + msg.slice(18,32))) {
                continue;
            }
            if (args.regen) {
                write_group(regen[stream]);
                delete regen[stream];
            }
            if (args.pre && pre !== args.pre) {
                continue;
            }
            const rln = bv2(msg, 4);        // 2 byte = record length
            const rty = msg.slice(8,10);    // 1 byte = record type
            const typ = rty;                // todo find sub record type in this format
            const rrf = msg.slice(10,12);   // 1 byte = record ext type or message type
            const slo = msg.slice(12,14);   // 1 byte = seq lo (xor data with)
            const xor = parseInt(slo, 16);
            const shi = msg.slice(14,16);   // 1 byte = seq hi
            const sh2 = msg.slice(16,18);   // 1 byte = seq vhi (incr when shi rolls over)
            const seq = shi + slo + sh2;    // 3 byte = sequence id
            const unk = msg.slice(18,32);   // 7 byte = unknown header
            const mlv = parseInt(rln,16);   // int length from hex
            const dat = buf                 // payload defined by length
                .slice(16,16 + mlv)         // then xor decoded using slo
                .map(v => v ^ xor);
            const hex = group(dat.map(v => v.toString(16).padStart(2,0)), 2);
            const CRC = le16(msg,msg.length-4);
            const crc = crc16(buf.slice(0,buf.length-2));
            if (crc !== CRC) {
                if (args.err) log({ CRC_MISMATCH: CRC, crc, len, rln, msg });
                dropped++;
                continue;
            }

            if (args.rty && rty !== args.rty) {
                continue;
            }

            // const typ = [ rty, mrt ].join(':');

            if (args.typ && typ !== args.typ) {
                continue;
            }
            if (typs && typs.indexOf(typ) < 0) {
                continue;
            }

            if (args.scan && !matchscan(`A-${nid}-${typ}`, dat, scanv, addscan)) {
                continue;
            }
            if (args.scanf && !matchscan(`A-${nid}-${typ}`, dat, scanf, addscan)) {
                continue;
            }

            const str = "...........";      // unknown stream id at this time
            const ser = "................"; // unknown serial so pad to align
            const fmp = fmt.map[`[A] ${typ}`] || fmt.map[`[A] ${rty}`];
            const rec = fmp ? decode(dat, Buffer.from(dat), fmp, used) : undefined;
            // if (rec && rec.serial) {
            //     ser(str, rec.serial);
            // }

            incr('rln', len.toString().padStart(3,' '));
            incr('pre', pre);
            incr('rty', rty);
            incr('typ', typ);
            incr('seq', seq);
            incr('unk', unk);

            if (args.pivot) {
                addpivot_time(mark, typ);
            }

            const out = [
                args.flg ? color(flg, FG.cyan) : '',
                args.csv ? '' : color(time, FG.cyan),
                color(chan, FG.RED),
                args.str ? color(str, FG.magenta) : '',
                args.ser ? color(ser, FG.RED) : '',
                color(nid, FG.YELLOW),
                color(pre, FG.green),
                color(rln, FG.blue),
                color(rty, FG.BLUE),
                color(rrf, FG.green),
                color(seq, FG.GREEN),
                color(group(unk,2), FG.green),
                args.hex ? color(hex, FG.BLUE) : '',
                args.crc ? color(CRC.toString(16).padStart(4,0), FG.red) : '',
                args.crc ? color(crc.toString(16).padStart(4,0), FG.RED) : '',
                args.chr ? color(b2c(dat), FG.RED) : '',
                args.rec && rec ? rec : '',
                args.msg ? msg : ''
            ].filter(v => v);
            if (!args.quiet) log(...out);

            const tok = msg.slice(0,32).match(/.{1,2}/g);
            tok.forEach((t,i) => {
                (i<6 || i>7) && incr(`[${i.toString().padStart(2,0)}]`, ' '+t);
            });

            continue;
        }

        /**
         * multi-part messages: begin, middle repeating, end
         * channel type "B" -- 100, 101, 102 multi-part
         * channel type "C" -- 120, 121, 122 multi-part
         * channel type "D" -- 106
         * channel type "E" -- 10A
         */
        switch (cmd) {
            case '100':
            case '120':
                // beginning of message
                msgs[stream] = [ data ];
                bufs[stream] = bytes;
                if (args.regen) regen[stream] = [ [ node, stamp, data ] ];
                break;
            case '101':
            case '121':
                // repeating middle section of message
                if (msgs[stream]) {
                    msgs[stream].push(data);
                    bufs[stream].push(...bytes);
                    if (args.regen) regen[stream].push([ node, stamp, data ]);
                }
                break;
            case '102':
                // end of message, emit completed and checksummed or drop if corrupt
                if (msgs[stream]) {
                    recs++;
                    msgs[stream].push(data);
                    bufs[stream].push(...bytes);
                    if (args.regen) {
                        regen[stream].push([ node, stamp, data ]);
                    }
                    const msg = msgs[stream].join('');
                    delete msgs[stream];
                    // check for dups within a sliding time window
                    if (args.reduce && isdup(recms, node + msg.slice(0,12) + msg.slice(18,36))) {
                        continue;
                    }
                    const buf = bufs[stream];
                    const len = buf.length;
                    incr('rln', len.toString().padStart(3,' '));
                    const pre = msg.slice(0,4);     // 2 byte = 0xAA03 (0x03aa)
                    const rln = bv2(msg, 4);        // 2 byte = record length
                    const rty = msg.slice(8,10);    // 1 byte = record type (format)
                    const rrf = msg.slice(10,12);   // 1 byte = request/response format (plain/xor)
                    const slo = msg.slice(12,14);   // 1 byte = seq lo (incr time = xor data byte)
                    const xor = args.nox ? 0 : (args.fxo || (parseInt(rrf,16) & 0x20) ? parseInt(slo, 16) : 0);
                    const shi = msg.slice(14,16);   // 1 byte = seq hi (incr 1 per msg)
                    const sh2 = msg.slice(16,18);   // 1 byte = seq vhi (incr when shi rolls over)
                    const seq = shi + slo + sh2;    // 3 byte = sequence id (ncludes xor)
                    const dv1 = msg.slice(18,20);   // 1 byte = device id 1 (or another seq id)
                    const mde = msg.slice(20,22);   // 1 byte = module detail
                    const mty = msg.slice(22,24);   // 1 byte = module type (3C or 00)
                    const mad = msg.slice(24,26);   // 1 byte = module address
                    const mrt = msg.slice(26,28);   // 1 byte = module record type
                    const mda = msg.slice(28,30);   // 1 byte = module "D" address
                    const tar = msg.slice(30,32);   // 1 byte = request target (status msgs)
                    const dv4 = msg.slice(32,36);   // 2 byte = unknown
                    const mlv = parseInt(rln,16);   // int length from hex
                    const dat = buf                 // payload defined by length
                        .slice(18,18 + mlv)         // then xor decoded
                        .map(v => v ^ xor);
                    const bin = Buffer.from(dat);
                    const hex = group(dat.map(v => v.toString(16).padStart(2,0)), 1);
                    const val = !args.val ? undefined : hex
                        .map(a => a.slice().reverse().join(''))
                        .map(v => parseInt(v, 16))
                        .map(v => v.toString().padStart(5,' '))
                        .join(join);
                    // message length + header (20) must match buffer size
                    // allow messages padded with 0000.... to handle csv data
                    if (len - mlv < 20) {
                        if (args.err) log({ time, nid, mad, mda, dv1, LEN_MISMATCH: len, rln: parseInt(rln,16), diff: len - mlv - 20, msg });
                        dropped++;
                        continue;
                    }
                    // calculate crc for packet minus 2 crc bytes at end and validate
                    const CRC = le16(msg,msg.length-4);
                    const crc = crc16(buf.slice(0,buf.length-2));
                    if (crc !== CRC) {
                        if (args.err) log({ time, nid, mad, mda, dv1, CRC_MISMATCH: CRC, crc, msg });
                        dropped++;
                        continue;
                    }
                    // synth device from node id and module location
                    const dev = [ nid, mad, mda ].join('-');
                    const tok = msg.slice(0,msg.length-4).match(/.{1,2}/g);
                    // header token histogram
                    if (args.hist) tok.forEach((t,i) => {
                        (i<6 || i>8) && incr(`[${i.toString().padStart(2,0)}]`, ' '+t);
                    });
                    // 18 byte header (as printable 2 char hex tokens)
                    const hdr = tok.slice(0,18);
                    // synth stream from [ rec type, mod rec type, mod addr, mod D addr ]
                    const str = [ mad, mda, dv1 ].join('-');
                    // message target (stream root?)
                    const smo = [ mad, mda ].join('-');
                    // "type" = compound of record + module types
                    const typ = [ rty, mrt ].join(':');
                    const ty2 = [ rty, mrt, mad ].join(':');
                    const fmp = fmt.map[str] || fmt.map[typ] || fmt.map[rty];
                    const rec = fmp ? decode(dat, bin, fmp, used) : undefined;
                    if (rec && rec.serial) {
                        ser(str, rec.serial);
                    }
                    const sno = ser(str);
                    if (args.pmm && rec) {
                        min_data(ydhm, rec, fmp, sno);
                    }
                    if (args.stat) {
                        let srec = stat[str];
                        if (!srec) {
                            srec = stat[str] = {
                                chan,
                                nid,
                                ser: sno,
                                freq: 0,
                                len: len - 20,
                                used: rec && rec.used ? rec.used[0] : 0,
                                xor: parseInt(rrf,16) & 0x20 ? 'Y' : 'N',
                                time,
                                head: hdr.join(''),
                                data: hex.map(v => v.join('')).join(' '),
                            };
                            if (rec && rec.used && rec.used[1] + 20 !== len) {
                                throw "length mismatch";
                            }
                        }
                        srec.freq++;
                    }
                    if (args.len && len != args.len) {
                        continue;
                    }
                    if (args.pre && pre !== args.pre) {
                        continue;
                    }
                    if (args.hexhas && hex.flat().join(join).indexOf(args.hexhas) < 0) {
                        continue;
                    }
                    if (args.str && typeof args.str === 'string' && str !== args.str) {
                        continue;
                    }
                    if (args.smo && typeof args.smo === 'string' && smo !== args.smo) {
                        continue;
                    }
                    // used a previously saved 'count' json record
                    // to filter out from a baseline of streams. good
                    // for identifying user set events which are not part
                    // of the normal larger data streams
                    if (args.excl === 'str' && saved.strs[str]) {
                        continue;
                    }
                    if (args.ty2 && ty2 !== args.ty2) {
                        continue;
                    }
                    if (args.typ && typ !== args.typ) {
                        continue;
                    }
                    if (typs && typs.indexOf(typ) < 0) {
                        continue;
                    }
                    if (args.rty && rty !== args.rty) {
                        continue;
                    }
                    if (xrty && xrty.indexOf(rty) >= 0) {
                        continue;
                    }
                    if (rrfs && rrfs.indexOf(rrf) < 0) {
                        continue;
                    }
                    if (args.rrf && rrf !== args.rrf) {
                        continue;
                    }
                    if (args.mty && mty !== args.mty) {
                        continue;
                    }
                    if (args.dev && dev !== args.dev) {
                        continue;
                    }
                    if (args.mad && mad !== args.mad) {
                        continue;
                    }
                    if (args.mde && mde !== args.mde) {
                        continue;
                    }
                    if (args.mrt && mrt !== args.mrt) {
                        continue;
                    }
                    if (args.mda && mda !== args.mda) {
                        continue;
                    }
                    if (args.sh2 && sh2 !== args.sh2) {
                        continue;
                    }
                    if (args.dv1 && dv1 !== args.dv1) {
                        continue;
                    }
                    if (dv4s && dv4s.indexOf(dv4) < 0) {
                        continue;
                    }
                    if (args.dv4 && dv4 !== args.dv4) {
                        continue;
                    }
                    if (args.hdrhas && hdr.indexOf(args.hdrhas) < 0) {
                        continue;
                    }
                    if (args.dhas && hdr.lastIndexOf(args.dhas) < 9) {
                        continue;
                    }
                    if (args.pivot) {
                        addpivot_time(mark, ty2);
                    }
                    if (args.scan && !matchscan(typ, dat, scanv, addscan)) {
                        continue;
                    }
                    if (args.scanf && !matchscan(typ, dat, scanf, addscan)) {
                        continue;
                    }
                    if (args.meta) {
                        metascan(mark, str, dat, -1);
                        metascan(mark, str, dat);
                        metascan(mark, str, dat, 1);
                    }
                    if (args.sample && fmp && fmp.sample) {
                        // filter by stream count for this record type
                        // emit on sample threshold (or on data change when == 1)
                        let key = [ typ, str ].join('_');
                        let rec = samples[key];
                        let dat = hex.join(',');
                        if (rec && rec.ydhm === ydhm) {
                            if (fmp.sample === 1 && rec.data === dat) {
                                dropped++;
                                continue;
                            }
                            if (rec.count++ < fmp.sample) {
                                dropped++;
                                continue;
                            }
                        }
                        samples[key] = { ydhm, count: 1, data: dat };
                    }
                    if (args.regen) {
                        if (args.pick && (args.pick === true || time === args.pick)) {
                            console.log(regen[stream].map(l => {
                                return `${l[1]} can1 ${l[0]}#${l[2]}`
                            }).join('\n'));
                        }
                        write_group(regen[stream]);
                        delete regen[stream];
                    }
                    incr('pre', pre);
                    incr('rty', rty);
                    incr('rrf', rrf);
                    const dup =
                    incr('seq', seq);
                    incr('dv1', dv1);
                    incr('mty', mty);
                    incr('mad', mad);
                    incr('mrt', mrt);
                    incr('mda', mda);
                    incr('tar', tar);
                    incr('dv4', dv4);
                    incr('dev', dev);
                    incr('str', str);
                    incr('smo', smo);
                    incr('typ', typ);
                    const sqd = parseInt(seq,16) - parseInt(lseq || seq,16);
                    const hexout = args.hex === 'diff' ?
                        diff(lhex, hex) : args.hex ?
                        color(hex.map(v => v.join('')).join(join), FG.BLUE) :
                        '';
                    const out = [
                        args.csv ? '' : color(time, FG.cyan),
                        args.str ? color(str, FG.magenta) : '',
                        args.smo ? color(smo, FG.magenta) : '',
                        // args.typ || args.typs ? color(typ, FG.magenta) : '',
                        args.ser ? color(sno, FG.RED) : '',
                        color(chan, FG.RED),
                        color(nid, FG.YELLOW),
                        args.hdr ? color(hdr.join(''), FG.green, MOD.bold) : '',
                        color(pre, FG.green),
                        color(rln, FG.blue),
                        color(rty, FG.BLUE),
                        color(rrf, FG.green),
                        color(seq, FG.GREEN),
                        color(dv1, FG.green),
                        color(mde, FG.red),
                        color(mty, FG.RED),
                        color(mad, FG.yellow),
                        color(mrt, FG.BLUE),
                        color(mda, FG.yellow),
                        color(tar, FG.green),
                        color(dv4, FG.GREEN),
                        args.crc ? color(CRC.toString(16).padStart(4,0), FG.red) : '',
                        args.crc ? color(crc.toString(16).padStart(4,0), FG.RED) : '',
                        hexout,
                        args.val ? color(val, FG.BLUE) : '',
                        args.chr ? color(b2c(dat), FG.RED) : '',
                        args.rec && rec ? rec : '',
                        args.msg ? color(msg, FG.magenta) : '',
                        args.seq ? color(sqd, FG.RED) : '',
                        args.dup ? dup : '',
                        args.field && rec && rec[args.field] ? color(rec[args.field], FG.WHITE) : '',
                    ].filter(v => v);
                    if (args.dup && dup && ldup === 0 && lout && lseq === seq) log(...lout, '*');
                    if (!args.quiet || (args.dup && dup)) log(...out);
                    ldup = dup;
                    lseq = seq;
                    lout = out;
                    lhex = hex;
                }
                break;
            case '122':
                if (msgs[stream]) {
                    recs++;
                    msgs[stream].push(data);
                    bufs[stream].push(...bytes);
                    if (args.regen) {
                        regen[stream].push([ node, stamp, data ]);
                    }
                    const buf = bufs[stream];
                    const len = buf.length;
                    const msg = msgs[stream].join('');
                    const pairs = msg.match(/.{1,2}/g).join(join);
                    delete msgs[stream];

                    if (args.len && len != args.len) {
                        continue;
                    }

                    const pre = msg.slice(0,4);     // 2 byte = 0xAA03 (0x03aa)
                    const rln = bv2(msg, 4);        // 2 byte = record length
                    const rty = msg.slice(8,10);    // 1 byte = record type (format)
                    const rrf = msg.slice(10,12);   // 1 byte = request/response format (plain/xor)
                    const xor = buf[6];             // 1 byte = xor data byte
                    const mrt = msg.slice(30,32);   // 1 byte = module record type
                    // "type" = compound of record + module types
                    const typ = [ rty, mrt ].join(':');
                    const fmp = fmt.map[`[C] ${typ}`] || fmt.map[`[C] ${rty}`];
                    const mln = parseInt(rln,16)    // convert rln to int
                    // 18 byte header (as printable 2 char hex tokens)
                    const tok = msg.slice(0,msg.length-4).match(/.{1,2}/g);
                    const hdr = tok.slice(0,18);
                    const dat = buf                 // payload defined by length
                        .slice(18, 18 + mln)        // then xor decoded using slo
                        .map(v => v ^ xor)
                        ;
                    const hex = group(dat.map(v => v.toString(16).padStart(2,0)), 1);
                    const CRC = le16(msg,msg.length-4);
                    const crc = crc16(buf.slice(0,buf.length-2));
                    if (crc !== CRC) {
                        if (args.err) console.log({ CRC_MISMATCH: CRC, crc, msg });
                        dropped++;
                        continue;
                    }

                    if (args.rty && rty !== args.rty) {
                        continue;
                    }
                    if (args.mrt && mrt !== args.mrt) {
                        continue;
                    }
                    if (args.typ && typ !== args.typ) {
                        continue;
                    }

                    if (args.pivot) {
                        addpivot_time(mark, typ);
                    }

                    if (args.scan && !matchscan(`C-${nid}-${typ}`, dat, scanv, addscan)) {
                        continue;
                    }
                    if (args.scanf && !matchscan(`C-${nid}-${typ}`, dat, scanf, addscan)) {
                        continue;
                    }

                    if (args.sample && fmp && fmp.sample) {
                        // filter by stream count for this record type
                        // emit on sample threshold (or on data change with flag?)
                        let key = [ "C", typ ].join('_');
                        let rec = samples[key];
                        let dat = hex.join(',');
                        if (rec && rec.ydhm === ydhm) {
                            if (fmp.sample === 1 && rec.data === dat) {
                                dropped++;
                                continue;
                            }
                            if (rec.count++ < fmp.sample) {
                                dropped++;
                                continue;
                            }
                        }
                        samples[key] = { ydhm, count: 1, data: dat };
                    }
                    if (args.regen) {
                        write_group(regen[stream]);
                        delete regen[stream];
                    }

                    incr('pre', pre);
                    incr('rty', rty);
                    incr('mrt', mrt);
                    incr('typ', typ);

                    const out = [
                        args.csv ? '' : color(time, FG.cyan),
                        color(chan, FG.RED),
                        color(nid, FG.YELLOW),
                        args.hdr ? color(hdr.join(''), FG.green, MOD.bold) : '',
                        color(pre, FG.green),
                        color(rln, FG.blue),
                        color(rty, FG.BLUE),
                        color(rrf, FG.green),
                        color(mrt, FG.BLUE),
                        args.pairs ? color(pairs, FG.green) : '',
                        color(hex.join(' '), FG.yellow),
                        args.chr ? color(b2c(dat), FG.red) : '',
                    ].filter(v => v);
                    if (!args.quiet) log(...out);

                }
                break;
            case '10A':
                recs++;
                if (args.reduce && isdup(recms, node + data)) {
                    continue;
                }
                if (args.regen) {
                    write_group([ [ node, stamp, data ] ]);
                }
                // only output by console (34F96)
                // logs/old/candump-2024-02-22_115503.log.bz2
                if (args['10A']) log(
                    args.csv ? '' : color(time, FG.cyan),
                    color(chan, FG.RED),
                    color(nid, FG.YELLOW),
                    color(cmd, FG.MAGENTA),
                    color(data.match(/.{1,2}/g).join(join), FG.green),
                    color(b2c(bytes), FG.red),
                );
                break;
            case '106':
                if (args.sample) {
                    let fmp = fmt.map['cmd:106'];
                    let key = [ nid, cmd ].join(':');
                    let rec = samples[key];
                    if (rec && rec.ydhm === ydhm) {
                        if (fmp.sample === 1 && rec.data === data) {
                            dropped++;
                            continue;
                        }
                        if (rec.count++ < fmp.sample) {
                            dropped++;
                            continue;
                        }
                    }
                    samples[key] = { ydhm, count: 1, data };
                }
                recs++;
                // output by 02001, 03001, 03002, 03003, 34001, 54001, 50001
                // (2 of 3) batteries announce last 8 bytes of serial #
                // unclear what the other records (same length) are
                // M101Z3B4xxxxxxxx => xxxxxxxx
                incr('106', [ nid, data ].join('-'));
                if (args['106']) log(
                    args.csv ? '' : color(time, FG.cyan),
                    color(chan, FG.RED),
                    color(nid, FG.YELLOW),
                    color(cmd, FG.MAGENTA),
                    color(data.match(/.{1,2}/g).join(join), FG.green),
                    color(b2c(bytes), FG.red),
                );
                if (args.reduce && isdup(recms, node + data)) {
                    continue;
                }
                if (args.regen) {
                    write_group([ [ node, stamp, data ] ]);
                }
                break;
            // case '10E': // todo decode
            //     if (!args['10E']) break;
            default:
                if (args.unk) log(
                    args.csv ? '' : color(time, FG.cyan),
                    color(nid, FG.GREEN),
                    color(cmd, FG.RED),
                    // data.length.toString().padStart(2,0),
                    data.match(/.{1,2}/g).join(join),
                    color(b2c(bytes), FG.red),
                );
                if (args.reduce && isdup(recms, node + data)) {
                    continue;
                }
                if (args.regen) {
                    write_group([ [ node, stamp, data ] ]);
                }
                break;
        }
    }

    if (args.regen && regenfd) {
        regenfd.end();
    }

    if (args.count) {
        const cout = {
            chan: count.chan,
            nid: count.nid,
            // cmd: count.cmd,
            dev: count.dev,
            rrf: count.rrf,
            rty: count.rty,
            typ: count.typ,
            ser: sern,
            str: count.str,
            smo: count.smo,
        };
        if (args.count === 'save') {
            fs.writeFileSync('cl-counts.save', JSON.stringify(cout,null,4));
        } else {
            console.log(util.inspect(cout, { sorted: true, colors: true }));
        }
        console.log({ samples });
    }

    if (args.sum) console.log({
        chan: Object.keys(count.chan||[]).length,
        dev: Object.keys(count.dev||[]).length,
        rty: Object.keys(count.rty||[]).length,
        typ: Object.keys(count.typ||[]).length,
        seq: Object.keys(count.seq||[]).length,
        ser: Object.keys(sern||[]).length,
        str: Object.keys(count.str||[]).length,
        smo: Object.keys(count.smo||[]).length,
        scan: Object.keys(count.scan).length,
        dropped,
        lines: lines.length,
        recs,
        dup: {
            list: duplist.length,
            add: dupadd,
            del: dupdel,
            dup: dups
        }
    });

    if (args.hist)
    for (let i=0; i<18; i++) {
        const key = `[${i.toString().padStart(2,0)}]`;
        log(
            key,
            Object.keys(count[key]||{}).length.toString().padStart(3,' '),
            count[key]
        );
    }

    if (args.pivot) {
        pivot.sort((a,b) => {
            if (a[0] === b[0]) {
                return a[1] < b[1] ? -1 : 1
            } else {
                return (a[0] < b[0]) ? -1 : 1;
            }
        });
        pivot.splice(0,0,[ "date", "typ", "count"]);
        fs.writeFileSync(
            'cl-pivot.tsv',
            pivot.map(row => row.map((v,i) => i < 2 ? `'${v}` : v).join('\t')).join('\n')
        );
    }

    if (args.scan || args.scanf) {
        console.log({ scan });
    }

    if (args.stat) {
        const stats = Object.values(stat);
        stats.forEach(rec => {
            rec.freq = parseFloat(((rec.freq / recs) * 100).toFixed(2))
            if (rec.freq >= 0.1) rec.time = '';
        });
        fs.writeFileSync(
            'cl-streams.tsv',
            Object.keys(stat).map(key => [key, ...Object.values(stat[key])].join('\t')).join('\n')
        );
    }

    function osort(obj) {
        return Object.keys(obj).sort().reduce((accumulator, key) => {
            accumulator[key] = obj[key];
            return accumulator;
        }, {});
    }

    if (args.meta) {
        for (let key of Object.keys(mstrpath)) {
            mstrpath[key] = mstrpath[key].size;
        }
        const inter = {};
        for (let key of Object.keys(meta)) {
            const root = key.split('.'); root.pop();
            const rkey = root.join('.');
            const rec = meta[key];
            // compute intersection of streams for a key base (root)
            const sreckeyset = new Set(Object.keys(rec));
            let rint = inter[rkey];
            if (!rint) {
                inter[rkey] = sreckeyset;
            } else {
                for (let k of rint) {
                    if (!sreckeyset.has(k)) rint.delete(k);
                }
            }
            // iterate over stream records for a path/key
            for (let str of Object.keys(rec)) {
                const mcnt = mkeystr[`${key}-${str}`].size;
                const srec = rec[str];
                for (let pos of Object.keys(srec)) {
                    // replace path set with set size
                    srec[pos] = srec[pos].size;
                    // drop records that don't match 99% of minutes
                    if (srec[pos] < mcnt * 0.99) {
                        delete srec[pos];
                    }
                }
                rec[str] = Object.keys(rec[str]).map(v => parseInt(v)).sort();
                // cull empty stream records
                if (Object.keys(srec).length === 0) {
                    delete rec[str];
                }
            }
            meta[key] = osort(meta[key]);
        }
        // turn sets into arrays
        for (let key of Object.keys(inter)) {
            inter[key] = [...inter[key]];
        }
        const opts = {
            maxArrayLength: null,
            compact: true,
            colors: true,
            sorted: true,
            depth: null
        };
        fs.writeFileSync('cl-meta.json', inspect(meta, opts));
        fs.writeFileSync('cl-mint.json', inspect(inter, opts));
        fs.writeFileSync('cl-mstr.json', inspect(mstrpath, opts));
        console.log(
            'meta analysis complete for',
            Object.keys(mstrpath).length,
            'streams over',
            Object.keys(count.min).length,
            'minutes'
        );
    }

    // allow process to exit by tidying up outstanding async/timers
    clearTimeout(fmt.timer);

    // force emit accumulated data
    if (args.pmm) {
        min_data();
    }

    if (base) {
        Promise.all(minPromises).then(() => {
            base.close();
        })
    }
}

load();