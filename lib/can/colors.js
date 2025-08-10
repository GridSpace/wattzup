// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

// https://en.m.wikipedia.org/wiki/ANSI_escape_code#Colors

const { args } = require('../lib/utils');

const MOD = {
    reset:   0,
    bold:    1,
    faint:   2,
    invert:  7,
}

const FG = {
    black:   30,
    red:     31,
    green:   32,
    yellow:  33,
    blue:    34,
    magenta: 35,
    cyan:    36,
    white:   37,
    BLACK:   90,
    RED:     91,
    GREEN:   92,
    YELLOW:  93,
    BLUE:    94,
    MAGENTA: 95,
    CYAN:    96,
    WHITE:   97
};

const BG = {
    black:   40,
    red:     41,
    green:   42,
    yellow:  43,
    blue:    44,
    magenta: 45,
    cyan:    46,
    white:   47,
    BLACK:   100,
    RED:     101,
    GREEN:   102,
    YELLOW:  103,
    BLUE:    104,
    MAGENTA: 105,
    CYAN:    106,
    WHITE:   107
};

function color(v) {
    if (args.plain) return v;
    const colors = [ ...arguments ].slice(1) || MOD.reset;
    return `\x1b[${colors.join(';')}m${v.toString()}\x1b[0m`;
}

Object.assign(exports, {
   MOD,
   FG,
   BG,
   color 
});