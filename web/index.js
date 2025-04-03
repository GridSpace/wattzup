// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

function $(id) {
    return document.getElementById(id);
}

function c2f(c) {
    return c * 1.8 + 32;
}

function skip(rows, size) {
    if (size < 2) {
        return rows;
    }
    const nrows = [];
    for (let i = 0; i < rows.length; i++) {
        if (i % size === size - 1) {
            nrows.push(rows[i]);
        }
    }
    return nrows;
}

function avg(rows, size) {
    if (size < 2) {
        return rows;
    }
    const nrows = [];
    const tmp = [rows[0].slice()];
    const len = rows[0].length;
    for (let i = 0; i < rows.length; i++) {
        if (i % size === size - 1) {
            for (let j = 1; j < size; j++) {
                for (let k = 0; k < len; k++) {
                    tmp[0][k] += tmp[j][k];
                }
            }
            for (let k = 0; k < len; k++) {
                tmp[0][k] /= tmp.length;
            }
            nrows.push(tmp[0].slice());
            tmp.length = 0;
        }
        tmp.push(rows[i].slice());
    }
    return nrows;
}

function load_charts() {
    const merge = parseInt(localStorage.merge || 0) || 0;
    const def = {
        pointRadius: 0,
    };
    const def2 = {
        pointRadius: 0,
        borderWidth: 1.5
    };
    const def3 = {
        pointRadius: 0,
        borderWidth: 0
    };
    const plugins = {
        plugins: {
            zoom: {
                pan: {
                    enabled: true,
                    mode: 'x'
                },
                zoom: {
                    wheel: {
                        modifierKey: 'meta',
                        enabled: true,
                    },
                    pinch: {
                        enabled: true,
                    },
                    mode: 'x',
                },
            },
        }
    };

    const src = (location.search || '?canlog').substring(1);
    const from = localStorage.from;
    const to = localStorage.to;
    const q = from ? `?from=${from}&to=${to}&src=${src}` : '';

    fetch(`live.csv${q}`).then(r => r.text()).then(text => {
        const lines = text.split('\n')
            .filter(l => l)
            .map(l => l.trim())
            .map(l => l.split(','));

        const head = lines.shift();
        const labels = skip(lines.map(line => line[0].split(' ')[1]), merge);
        const data = avg(lines.map(l => l.map(c => parseFloat(c))), merge);

        const tot_rem = head.indexOf('tot_rem');
        const tot_win = head.indexOf('tot_win');
        const tot_wot = head.indexOf('tot_wot');
        const tot_soc = head.indexOf('tot_soc');

        const pv1_win = head.indexOf('pv1_win');
        const pv1_vin = head.indexOf('pv1_vin');
        const pv2_win = head.indexOf('pv2_win');
        const pv2_vin = head.indexOf('pv2_vin');
        const gen_win = head.indexOf('gen_win');

        const b1_soc = head.indexOf('b1_soc');
        const b2_soc = head.indexOf('b2_soc');
        const b3_soc = head.indexOf('b3_soc');
        const b4_soc = head.indexOf('b4_soc');

        const b1_tmp = head.indexOf('b1_tmp');
        const b2_tmp = head.indexOf('b2_tmp');
        const b3_tmp = head.indexOf('b3_tmp');
        const b4_tmp = head.indexOf('b4_tmp');

        const b1_wot = head.indexOf('b1_wot');
        const b2_wot = head.indexOf('b2_wot');
        const b3_wot = head.indexOf('b3_wot');
        const b4_wot = head.indexOf('b4_wot');

        const b1_chg = head.indexOf('b1_chg');
        const b2_chg = head.indexOf('b2_chg');
        const b3_chg = head.indexOf('b3_chg');
        const b4_chg = head.indexOf('b4_chg');

        const b1_hot = head.indexOf('b1_hot');
        const b2_hot = head.indexOf('b2_hot');
        const b3_hot = head.indexOf('b3_hot');
        const b4_hot = head.indexOf('b4_hot');

        const ac_c0w = head.indexOf('ac_c0w');
        const ac_c1w = head.indexOf('ac_c1w');
        const ac_c2w = head.indexOf('ac_c2w');
        const ac_c3w = head.indexOf('ac_c3w');
        const ac_c4w = head.indexOf('ac_c4w');
        const ac_c5w = head.indexOf('ac_c5w');

        const bms_eio = head.indexOf('bms_eio');
        const bms_win = head.indexOf('bms_win');
        const bms_wot = head.indexOf('bms_wot');
        const bms_ch2 = head.indexOf('bms_ch2');

        const maxpv = Math.max(...data.map(line => Math.max(line[pv1_win], line[pv2_win], line[pv1_vin] / 1000, line[pv2_vin] / 1000)));

        console.log(window.data = { head, labels, data, tot_rem });

        // total power in / out
        const cfg_io = {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "watts in",
                    data: data.map(line => line[tot_win]),
                    ...def
                },{
                    label: "watts out",
                    data: data.map(line => -line[tot_wot]),
                    ...def
                }]
            },
            options: {
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        beginAtZero: true,
                    },
                },
                aspectRatio: 4,
                ...plugins
            },
        };
        new Chart(document.getElementById('io'), cfg_io);

        // bms power in / out
        const cfg_bms = {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "bms watts out",
                    data: data.map(line => -line[bms_wot]),
                    stack: "stack",
                    ...def
                },{
                    label: "ch2 watts out",
                    data: data.map(line => -line[bms_ch2]),
                    stack: "stack",
                    ...def
                },{
                    // hidden: true,
                    type: "line",
                    label: "b1 watts out",
                    data: data.map(line => line[b1_wot]),
                    ...def2
                },{
                    // hidden: true,
                    type: "line",
                    label: "b2 watts out",
                    data: data.map(line => line[b2_wot]),
                    ...def2
                },{
                    // hidden: true,
                    type: "line",
                    label: "b3 watts out",
                    data: data.map(line => line[b3_wot]),
                    ...def2
                },{
                    // hidden: true,
                    type: "line",
                    label: "b4 watts out",
                    data: data.map(line => line[b4_wot]),
                    ...def2
                },{
                    type: "line",
                    label: "b* watts out",
                    data: data.map(line => - line[b1_wot] - line[b2_wot] - line[b3_wot]),
                    ...def2
                }]
            },
            options: {
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        beginAtZero: true,
                    },
                },
                aspectRatio: 3,
                ...plugins
            },
        };
        new Chart(document.getElementById('bms'), cfg_bms);

        // ac watts out by channel
        const cfg_ac = {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "ac0 watts",
                    type: "line",
                    data: data.map(line => -line[ac_c0w]),
                    ...def2
                },{
                    label: "ac1 watts",
                    type: "line",
                    data: data.map(line => -line[ac_c1w]),
                    ...def2
                },{
                    label: "ac2 watts",
                    type: "line",
                    data: data.map(line => -line[ac_c2w]),
                    ...def2
                },{
                    label: "ac3 watts",
                    type: "line",
                    data: data.map(line => -line[ac_c3w]),
                    ...def2
                },{
                    label: "ac4 watts",
                    type: "line",
                    data: data.map(line => -line[ac_c4w]),
                    ...def2
                },{
                    label: "ac5 watts",
                    type: "line",
                    data: data.map(line => -line[ac_c5w]),
                    ...def2
                }]
            },
            options: {
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        beginAtZero: true,
                    },
                },
                aspectRatio: 3,
                ...plugins
            },
        };
        new Chart(document.getElementById('ac'), cfg_ac);

        // pv and battery in / out
        const cfg_pv = {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "pv1",
                    type: "line",
                    data: data.map(line => line[pv1_win]),
                    ...def2
                },{
                    label: "pv2",
                    type: "line",
                    data: data.map(line => line[pv2_win]),
                    ...def2
                },{
                    label: "p1 vin",
                    data: data.map(line => line[pv1_vin] / 1000),
                    yAxisID: 'y-axis-vin',
                    stack: 'pv vin',
                    ...def3
                },{
                    label: "p2 vin",
                    data: data.map(line => line[pv2_vin] / 1000),
                    yAxisID: 'y-axis-vin',
                    stack: 'pv vin',
                    ...def3
                },{
                    label: "gen",
                    type: "line",
                    data: data.map(line => line[gen_win]),
                    ...def2
                },{
                    type: "line",
                    label: "bms watts in",
                    data: data.map(line => line[bms_win]),
                    ...def
                }]
            },
            options: {
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMax: 100,
                    },
                    'y-axis-vin': {
                        display: false,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'VIN',
                        },
                        beginAtZero: true,
                        suggestedMax: maxpv
                    },
                },
                aspectRatio: 3,
                ...plugins
            },
        };
        new Chart(document.getElementById('pv'), cfg_pv);

        const yellows = [
            'rgb(255, 205, 86)',
            'rgb(245, 190, 60)',
            'rgb(235, 175, 40)',
            'rgb(225, 160, 20)'
        ];
        const reds = [
            'rgb(255, 99, 132)',
            'rgb(235, 75, 110)',
            'rgb(215, 50, 90)',
            'rgb(190, 30, 70)',
        ];
        const greens = [
            'rgb(75, 192, 192)',
            'rgb(60, 180, 150)',
            'rgb(45, 160, 130)',
            'rgb(30, 140, 110)',
        ];
        const blues = [
            'rgb(75, 180, 255)',
            'rgb(54, 162, 235)',
            'rgb(36, 140, 215)',
            'rgb(20, 110, 190)',
        ];
        let palette = [ ...greens, ...reds ];
        // state of charge and temperatures
        const map = { 2:25, 1:-25, 0:0 };
        const cfg_chg = {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "b1 chg",
                    data: data.map(line => map[line[b1_chg]]),
                    stack: "stack",
                    ...def3
                },{
                    label: "b2 chg",
                    data: data.map(line => map[line[b2_chg]]),
                    stack: "stack",
                    ...def3
                },{
                    label: "b3 chg",
                    data: data.map(line => map[line[b3_chg]]),
                    stack: "stack",
                    ...def3
                },{
                    label: "b4 chg",
                    data: data.map(line => map[line[b4_chg]]),
                    stack: "stack",
                    ...def3
                },{
                    label: "b1 hot",
                    data: data.map(line => map[line[b1_hot]]),
                    stack: "stack",
                    ...def3
                },{
                    label: "b2 hot",
                    data: data.map(line => map[line[b2_hot]]),
                    stack: "stack",
                    ...def3
                },{
                    label: "b3 hot",
                    data: data.map(line => map[line[b3_hot]]),
                    stack: "stack",
                    ...def3
                },{
                    label: "b4 hot",
                    data: data.map(line => map[line[b4_hot]]),
                    stack: "stack",
                    ...def3
                }]
            },
            options: {
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        beginAtZero: true,
                    },
                },
                aspectRatio: 4,
                ...plugins
            },
        };
        cfg_chg.data.datasets.forEach((ds, i) => {
            ds.backgroundColor = palette[i % palette.length];
        });
        new Chart(document.getElementById('change'), cfg_chg);

        // state of charge and temperatures
        const cfg_tot = {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "soc",
                    type: "line",
                    data: data.map(line => line[tot_soc]),
                    // yAxisID: 'y-axis-soc',
                    ...def2
                },{
                    label: "b1 soc",
                    type: "line",
                    data: data.map(line => line[b1_soc]),
                    ...def2
                },{
                    label: "b2 soc",
                    type: "line",
                    data: data.map(line => line[b2_soc]),
                    ...def2
                },{
                    label: "b3 soc",
                    type: "line",
                    data: data.map(line => line[b3_soc]),
                    ...def2
                },{
                    label: "b4 soc",
                    type: "line",
                    data: data.map(line => line[b4_soc]),
                    ...def2
                },{
                    label: "b1 tmp",
                    type: "line",
                    data: data.map(line => (line[b1_tmp])),
                    ...def2
                },{
                    label: "b2 tmp",
                    type: "line",
                    data: data.map(line => (line[b2_tmp])),
                    ...def2
                },{
                    label: "b3 tmp",
                    type: "line",
                    data: data.map(line => (line[b3_tmp])),
                    ...def2
                },{
                    label: "b4 tmp",
                    type: "line",
                    data: data.map(line => (line[b4_tmp])),
                    ...def2
                }]
            },
            options: {
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        beginAtZero: true,
                        suggestedMin: 0,
                        suggestedMax: 100,
                    },
                },
                aspectRatio: 4,
                ...plugins
            },
        };
        palette = [ yellows[0], ...blues, ...reds ];
        cfg_tot.data.datasets.forEach((ds, i) => {
            ds.borderColor = palette[i % palette.length];
            ds.backgroundColor = palette[i % palette.length];
        });
        new Chart(document.getElementById('total'), cfg_tot);

        // total power in / out
        const io_data = data.map(line => (Math.min(line[tot_rem] / (24 * 60), 7)) * { 1: 1, 2: -1 }[line[bms_eio]]);
        const io_in = io_data.map(val => val > 0 ? val : 0);
        const io_out = io_data.map(val => val < 0 ? Math.max(-7, val * 24) : 0);

        const cfg_rem = {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "runtime days remaining",
                    data: io_in,
                    ...def
                },{
                    label: "charging hours remaining",
                    data: io_out,
                    ...def
                }]
            },
            options: {
                scales: {
                    x: {
                        stacked: true,
                    },
                    y: {
                        beginAtZero: true,
                    }
                },
                aspectRatio: 4,
                ...plugins
            },
        };
        new Chart(document.getElementById('rem'), cfg_rem);

    });
}

document.addEventListener('DOMContentLoaded', (ev) => {
    console.log({ loaded: ev });
    const { merge, save_from, save_to } = localStorage;
    update_settings(merge, save_from, save_to);
    load_charts();
    window.update_from_ui = update_from_ui;
    if (localStorage.save_from !== undefined) {
        $('set_start').value = parseInt(localStorage.save_from) / hour;
        $('set_end').value = parseInt(localStorage.save_to || 0) / hour;
        $('set_sample').value = parseInt(localStorage.merge);
    }
});

document.addEventListener('mousemove', function(event) {
    self.last_move = Date.now();
});

document.addEventListener('wheel', function(event) {
    self.last_move = Date.now();
});

self.update = function(merge, from, to) {
    update_settings(merge, from, to);
    location.reload();
};

let last_move = self.last_move = Date.now();
let hour = self.hour = 1000 * 60 * 60;
let day = self.day = hour * 24;

function update_from_ui() {
    update_settings(
        parseInt($('set_sample').value),
        parseInt($('set_start').value) * hour,
        parseInt($('set_end').value) * hour,
    );
    location.reload();
}

function update_settings(merge = 0, from = hour * 24, to) {
    const now = Date.now();
    localStorage.save_from = from || '';
    localStorage.save_to = to || '';
    localStorage.merge = merge || 0;
    localStorage.from = (now - (from || now));
    localStorage.to = to ? (now - to) : '';
};

let deferred = false;

// reload page after hidden causing skipped update
document.addEventListener("visibilitychange", function() {
    if (deferred) {
        const { merge, save_from, save_to } = localStorage;
        update_settings(merge, save_from, save_to);
        location.reload();
    }
});

setInterval(() => {
    // skip updates if tab is not visible
    if (document.visibilityState !== 'visible') {
        console.log('skipping update ... hidden');
        return deferred = true;
    }
    // skip updates if mouse is being moved on the screen
    if (Date.now() - self.last_move < 5000) {
        console.log('skipping update ... mousing');
        return deferred = true;
    }
    const { merge, save_from, save_to } = localStorage;
    update_settings(merge, save_from, save_to);
    location.reload();
}, 60000);
