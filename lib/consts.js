const fs = require('fs');
const path = require('path');
const dayjs = require('dayjs');
const utils = require('./utils');
const { flatten, create_logger } = utils;
const { WATTZUP_SECRETS, WATTZUP_DBSETUP } = process.env;
const log = create_logger();

function loadJson(path) {
    log({ load_json: path });
    try {
        if (fs.existsSync(path)) {
            return JSON.parse(fs.readFileSync(path).toString());
        }
    } catch(err) {
        log({ load_config_error: err });
    }
    return {};
}

const secrets = loadJson(WATTZUP_SECRETS || "wattzup.secrets");
const dbsetup = loadJson(WATTZUP_DBSETUP || "wattzup.dbconf");

if (!secrets.ecoflow) {
    log("missing ecoflow secrets");
}

const config = {
    secrets,

    db: {
        default: {
            dbHost: "localhost",
            dbPort: 1336,
            dbUser: "user",
            dbPass: "pass",
        },
        ecolog: {
            dbName: "ecologs",
            fmtime(time) {
                return `log:${powerKit}:` + time.toString(36).padStart(9, 0)
            },
            ptime(key) {
                const [ pre, dev, time, on ] = key.split(':');
                return dayjs(parseInt(time,36));
            },
            fmo(val) {
                return flatten(val);
            }
        },
        canlog: {
            dbName: "canlog",
            fmtime(time) {
                return dayjs(time).format("YYMMDD.HHmm");
            },
            ptime(key) {
                return dayjs('20'+key.replace('.',' '), 'YYYYMMDD HHmm');
            },
            fmo(rec) {
                for (let [ key, val ] of Object.entries(rec)) {
                    rec[key] = val[2];
                }
                return rec;
            }
        },
        aralog: {
            dbName: "aralog",
            fmtime(time) {
                return dayjs(time).format("YYMMDD:HHmm");
            },
            ptime(key) {
                return dayjs('20'+key.replace(':',' '), 'YYYYMMDD HHmm');
            },
            fmo(rec) {
                for (let [ key, val ] of Object.entries(rec)) {
                    rec[key] = val[2];
                }
                return rec;
            }
        }
    }
}

Object.assign(exports, config);

if (dbsetup.default) {
    for (let key of Object.keys(config.db)) {
        Object.assign(config.db[key], dbsetup[key] || {});
        console.log({ key, data: config.db[key] });
    }
} else {
    log("missing dbsetup");
}
