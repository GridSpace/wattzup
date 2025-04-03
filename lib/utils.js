// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

const { env } = process;
const { argv } = process;
const crypto = require('crypto');
const util = require('util');
const toks = argv.slice(2);
const args = exports.args = { };
let tok;

while (tok = toks.shift()) {
    let key, val;
    while (tok.charAt(0) === '-') {
        tok = tok.substring(1);
        key = tok;
    }
    if (key && key.indexOf('=') > 0) {
        [key, val] = key.split("=");
    } else if (key && args[0] && toks[0].charAt(0) !== '-') {
        val = toks.shift();
    } else {
        key = tok;
        val = true;
    }
    if (key.charAt(0) === '_') {
        key = key.substring(1);
        val = !val;
    }
    const i32 = parseInt(val);
    const f64 = parseFloat(val);
    // convert string val to string number if it directly translates
    if (i32 == val) {
        args[`_${key}`] = i32;
    } else if (f64 == val) {
        args[`_${key}`] = f64;
    }
    args[key] = val;
    // console.log({ key, val, i32, f64 });
}

exports.env = function (key, defVal) {
    let val = env[key];
    if (val === undefined) {
        return defVal;
    }
    let ival = parseInt(val);
    if (ival == val) {
        return ival;
    }
    let fval = parseFloat(val);
    if (fval == val) {
        return val;
    }
    return val;
};

function create_logger(opts = {}) {
    opts = Object.assign({}, {
        depth: Infinity,
        colors: true,
        compact: true,
        maxArrayLength: Infinity,
        breakLength: Infinity
    }, opts);
    return function() {
        const args = [...arguments].map(a => typeof a === 'string' ? a : util.inspect(a, opts));
        return console.log(...args);
    }
}

// deep sort of object keys for better util output
function osort(o) {
    const tov = typeof(o);
    if (Array.isArray(o) || tov === 'string' || tov === 'number') {
        return o;
    }
    const e = Object.entries(o);
    e.sort((a,b) => a[0] > b[0] ? 1 : -1);
    const n = {};
    for (let [k,v] of e) {
        n[k] = osort(v);
    }
    return n;
}

async function hmac_sha256(text, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(text);
    return hmac.digest('hex');
}

// flatten nested objects into format ecoflow wants for url parameters
function flatten(map, path = [], kv = {}) {
    if (typeof map !== 'object') {
        kv[path.join('.')] = map;
        return;
    }
    for (let [k, v] of Object.entries(map)) {
        path.push(k);
        const type = Array.isArray(v) ? 'array' : typeof v;
        switch (type) {
            case 'object':
                flatten(v, path, kv);
                break;
            case 'string':
            case 'number':
                kv[path.join('.')] = v;
                break;
            case 'array':
                for (let i=0; i<v.length; i++) {
                    let ap = path.slice();
                    let ok = ap.pop();
                    ap.push(`${ok}[${i}]`);
                    flatten(v[i], ap, kv);
                }
                break;
        }
        path.pop();
    }
    return kv;
}

Object.assign(exports, {
    create_logger,
    osort,
    flatten,
    hmac_sha256
});
