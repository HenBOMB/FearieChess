const fs = require('fs');
const express = require('express');
const path = require('path');
const app = express();
const port = 6969;

app.use(express.static(path.join(__dirname, '')));

app.get('/configs', (_req, res) => {
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

// app.options('/', function(req, res, next){
//     res.header('Access-Control-Allow-Origin', "*");
//     res.header('Access-Control-Allow-Methods', 'POST');
//     res.header("Access-Control-Allow-Headers", "accept, content-type");
//     res.header("Access-Control-Max-Age", "1728000");
//     return res.sendStatus(200);
//  });

app.get('/', function(_req, res) {
    res.redirect('index.html');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});