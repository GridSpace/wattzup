// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Stewart Allen <sa@grid.space>

const { args, env } = require('./utils');
const consts = require('./consts');
const serve = require('serve-static');
const http = require('http');
const url = require('url');
const app = require('express')();
const web = http.createServer(app).listen(args.port || 3001);
const def = consts?.db?.default ?? {};

// console.log('[consts]', consts);
console.log(`[ecoflow web]`, [def.dbHost, def.dbPort], [def.dbUser, def.dbName]);

const netdb = require('./web-query');
netdb.init();

app
    .use((req, res, next) => {
        const query = url.parse(`http://abc${req.url}`, true).query;
        if (req.url.startsWith('/live.csv')) {
            if (query.from) {
                const from = parseInt(query.from);
                const to = parseInt(query.to || Date.now());
                const src = query.src;
                netdb.query(from, to, src).then(data => {
                    for (let line of data) {
                        res.write(line + "\n");
                    }
                    res.end();
                });
            } else {
                res.end();
            }
        } else {
            next();
        }
    })
    .use(serve(`web`, { index: [ "index.html" ]}))
    .use((req, res) => {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('404 Not Found');
    })
    ;
