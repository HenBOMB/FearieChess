const http = require('http');
const WebSocket = require('ws');

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
http.get('http://localhost:5566/api/generate_moves?fen=' + fen, (res) => {
    let data = "";
    res.on('data', chunk => {
        data += chunk;
    });

    res.on('end', () => {
        console.log(JSON.parse(data));
    });

    console.log(res.statusCode);
});


// let socket = new WebSocket("ws://localhost:5566/");

// socket.on('open', () => {
//     console.log('connected');
//     socket.onmessage = message => {
//         console.log(message.data);
//     };

//     // http.get('http://localhost:5566/api/best_move', (res) => {
//     //     console.log(res.statusCode);
//     // });
// });

// socket.on('error', e => console.log(e));