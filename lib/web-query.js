// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

// web-server helper takes browser time range queries against
// ecologs or canlogs in record format and returns a table with header

// const dayjs = require('dayjs');
const NetLevel = require('@gridspace/net-level-client');
const consts = require('./consts');
const db = {};
const { ichigh, bbcin, kitscc, ldac, batt1, batt2, batt3, batt4 } = consts.secrets.ecoflow;

Object.entries(consts.db).forEach(async row => {
    const [ key, val ] = row;
    const { dbHost, dbPort, dbUser, dbPass, dbName, fmtime, ptime, fmo } = val;
    const dbdef = consts.db.default;
    const host = dbdef.dbHost || dbHost;
    const port = dbdef.dbPort || dbPort;
    const user = dbdef.dbUser || dbUser;
    const pass = dbdef.dbPass || dbPass;
    console.log({ dbName, host, port, user, pass });
    const nl = new NetLevel();
    try {
        await nl.open(host, port);
        await nl.auth(user, pass);
        await nl.use(dbName);
        db[key] = {
            nl,
            ft: fmtime,
            pt: ptime,
            fo: fmo
        };
    } catch (err) {
        console.log({ err, key, host, port, user, pass });
    }
});

const capture = {
    "tot_rem": `bmsTotal.totalRemainTime`,
    "tot_win": `bmsTotal.totalInWatts`,
    "tot_wot": `bmsTotal.totalOutWatts`,
    "tot_soc": `bmsTotal.totalSoc`,

    "bms_eio": `bmsTotal.totalChgDsgState`,
    "bms_win": `ichigh.${ichigh}.inWatts`,
    "bms_wot": `ichigh.${ichigh}.outWatts`,
    "bms_ch2": `ichigh.${ichigh}.ch2Watt`,

    "b1_win": `bp5000.${batt1}.inWatts`,
    "b1_wot": `bp5000.${batt1}.outWatts`,
    "b1_soc": `bp5000.${batt1}.soc`,
    "b1_tmp": `bp5000.${batt1}.temp`,
    "b1_chg": `bp5000.${batt1}.chgState`,
    "b1_hot": `bp5000.${batt1}.ptcHeatingFlag`,

    "b2_win": `bp5000.${batt2}.inWatts`,
    "b2_wot": `bp5000.${batt2}.outWatts`,
    "b2_soc": `bp5000.${batt2}.soc`,
    "b2_tmp": `bp5000.${batt2}.temp`,
    "b2_chg": `bp5000.${batt2}.chgState`,
    "b2_hot": `bp5000.${batt2}.ptcHeatingFlag`,

    "b3_win": `bp5000.${batt3}.inWatts`,
    "b3_wot": `bp5000.${batt3}.outWatts`,
    "b3_soc": `bp5000.${batt3}.soc`,
    "b3_tmp": `bp5000.${batt3}.temp`,
    "b3_chg": `bp5000.${batt3}.chgState`,
    "b3_hot": `bp5000.${batt3}.ptcHeatingFlag`,

    "b4_win": `bp5000.${batt4}.inWatts`,
    "b4_wot": `bp5000.${batt4}.outWatts`,
    "b4_soc": `bp5000.${batt4}.soc`,
    "b4_tmp": `bp5000.${batt4}.temp`,
    "b4_chg": `bp5000.${batt4}.chgState`,
    "b4_hot": `bp5000.${batt4}.ptcHeatingFlag`,

    "ac_c0w": `ldac.${ldac}.acChWatt[0]`,
    "ac_c1w": `ldac.${ldac}.acChWatt[1]`,
    "ac_c2w": `ldac.${ldac}.acChWatt[2]`,
    "ac_c3w": `ldac.${ldac}.acChWatt[3]`,
    "ac_c4w": `ldac.${ldac}.acChWatt[4]`,
    "ac_c5w": `ldac.${ldac}.acChWatt[5]`,

    "pv1_win": `kitscc.${kitscc}.pv1InWatts`,
    "pv1_vin": `kitscc.${kitscc}.pv1InVol`,
    "pv2_win": `kitscc.${kitscc}.pv2InWatts`,
    "pv2_vin": `kitscc.${kitscc}.pv2InVol`,

    "gen_win": `bbcin.${bbcin}.dcInWatts`
};

const head = Object.keys(capture);
const line = Object.values(capture);

// query net-level time range and flatten object records
// into a csv table with a header for the browser
async function query(from, to, src = 'ecolog') {
    const { nl, ft, pt, fo } = db[src];
    from = ft(from);
    to = ft(to || Date.now());
    const out = [];
    await nl.list({
        gte: from,
        lte: to,
    }, (key, val) => {
        // console.log({ key , val, head, line });
        // const [ pre, dev, time, on ] = key.split(':');
        // const date = dayjs(parseInt(time,36)).format('YYYY/MM/DD HH:mm');
        const date = pt(key).format('YYYY/MM/DD HH:mm');
        const valu = fo(val);
        if (out.length === 0) {
            out.push(['date', ...head].join(','));
        }
        out.push([date, ...line.map(key => valu[key] || 0)].join(','));
    });
    console.log({ from, to, out: out.length });
    return out;
}

async function init() { }

Object.assign(exports, { init, query });
