const fs = require('fs');
const express = require('express');
const path = require('path');
const app = express();
const cors = require("cors");
const port = 6969;

app.use(express.static(path.join(__dirname, '')));
app.use(cors());

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


app.get('/', function(_req, res) {
    res.redirect('index.html');
});

app.listen(process.env.PORT || port, () => {
    console.log(`Server running at http://localhost:${port}/`);
    console.log(app.route)
    console.log(app.defaultConfiguration)
});