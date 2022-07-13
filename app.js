const fs = require('fs');
const express = require('express');
const path = require('path');
const WebSocket = require('ws');
var exec = require('child_process').execFile;

console.clear();

const port = 5566;
const auth = "secret";
const app = express();
const users = { };

//#region Server

let ws;

const server = app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});

const wsServer = new WebSocket.Server({
    noServer: true,
    httpServer: server,
    autoAcceptConnections: false
});

server.on('upgrade', (req, socket, head) => {

    if(
        req.headers.origin === undefined ||
        req.headers['user-agent'] === undefined ||
        req.headers['accept-encoding'] === undefined)
    {
        socket.write('HTTP/1.1 404 Unknown\r\n\r\n');
        socket.destroy();
        return;
    }

    wsServer.handleUpgrade(req, socket, head, socket => {
        wsServer.emit('connection', socket, req);
    });

});

wsServer.on('connection', (socket, req) => {

    if(
        req.headers.origin === undefined ||
        req.headers['user-agent'] === undefined ||
        req.headers['accept-encoding'] === undefined)
    {
        socket.close();
        return;
    }

    ws = socket;
});

//#endregion

//#region API

const apiAuth = (req, res) => {
    return false;
    if(req.headers.connection !== 'keep-alive' || !req.headers['user-agent'] || req.headers.authentication !== auth)
    {
        res.writeHead(403, {"Content-Type": "text/plain"});
        res.end();
        return true;
    }
    return false;
};

app.use(express.static(path.join(__dirname, '')));

app.get('/api/req_permission', (req, res) => {
    if(apiAuth(req, res)) return;

    if(req.ip in users)
    {
        res.writeHead(200, {"Content-Type": "text/plain"});
        res.end();
        return;
    }

    users[req.ip] = {};
    // users[req.ip].engine = new Engine();
    // users[req.ip].evaluator = new Evaluator(users[req.ip].engine);

    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end();
});

app.get('/api/configs', (req, res) => {
    if(apiAuth(req, res)) return;

    const files = fs.readdirSync('./configs/');

    for (let i = 0; i < files.length; i++)
    {
        const name = files[i].slice(0,-2);
        files[i] = require('./configs/' + files[i]);
        files[i].name = name;
    }

    res.writeHead(200, {"Content-Type": "application/json"});
    res.write(JSON.stringify({'configs' : files}));
    res.end();
});

app.get('/api/best_move', async (req, res) => {
    if(apiAuth(req, res)) return;

    if(!(req.ip in users))
    {
        res.writeHead(403, {"Content-Type": "text/plain"});
        res.end();
        return;
    }

    if(!req.query.fen || !req.query.pgn || !req.query.depth)
    {
        res.writeHead(400, {"Content-Type": "text/plain"});
        res.end();
        return;
    }

    let pgn = "" || req.query.pgn;

    exec('../FearieChessV1/target/release/FearieChessV1.exe', [req.query.fen, pgn, req.query.depth], (error, stdout, stderr) =>
    {  
        ws.send("move" + stdout);
    }); 

    res.writeHead(200, {"Content-Type": "application/json"});
    res.end();
});

// app.get('/api/evaluate', async (req, res) => {
//     if(apiAuth(req, res)) return;

//     if(!(req.ip in users))
//     {
//         res.writeHead(403, {"Content-Type": "text/plain"});
//         res.end();
//         return;
//     }

//     if(!req.query.fen)
//     {
//         res.writeHead(400, {"Content-Type": "text/plain"});
//         res.end();
//         return;
//     }

//     res.writeHead(200, {"Content-Type": "application/json"});
//     res.write(Evaluator.evaluateFen(req.query.fen).toString());
//     res.end();
// });

app.get('/api/template', (req, res) => {
    if(apiAuth(req, res)) return;

    if(!(req.ip in users))
    {
        res.writeHead(403, {"Content-Type": "text/plain"});
        res.end();
        return;
    }

    res.writeHead(200, {"Content-Type": "application/"});
    res.end('Template');
});

app.get('*', (req, res) => {
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.end("Oops, this page doesn't exist!");
});

// #endregion

// https://stackoverflow.com/questions/8750780/encrypting-data-with-a-public-key-in-node-js
// var crypto = require("crypto");
// var encryptStringWithRsaPublicKey = function(toEncrypt, relativeOrAbsolutePathToPublicKey) {
//     var absolutePath = path.resolve(relativeOrAbsolutePathToPublicKey);
//     var publicKey = fs.readFileSync(absolutePath, "utf8");
//     var buffer = Buffer.from(toEncrypt);
//     var encrypted = crypto.publicEncrypt(publicKey, buffer);
//     return encrypted.toString("base64");
// };
// var decryptStringWithRsaPrivateKey = function(toDecrypt, relativeOrAbsolutePathtoPrivateKey) {
//     var absolutePath = path.resolve(relativeOrAbsolutePathtoPrivateKey);
//     var privateKey = fs.readFileSync(absolutePath, "utf8");
//     var buffer = Buffer.from(toDecrypt, "base64");
//     var decrypted = crypto.privateDecrypt(privateKey, buffer);
//     return decrypted.toString("utf8");
// };
// const encrypted = encryptStringWithRsaPublicKey('uwuwuwuuwuw','./public.key');
// console.log(encrypted);
// console.log(decryptStringWithRsaPrivateKey(encrypted,'./private.key'));