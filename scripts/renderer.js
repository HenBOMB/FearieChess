const AUDIO_MOVE = new Audio("/sounds/move-self.webm");
const AUDIO_CAPTURE = new Audio("/sounds/capture.webm");
const AUDIO_START = new Audio("/sounds/game-start.webm");
const AUDIO_END = new Audio("/sounds/game-end.webm");
const AUDIO_CASTLE = new Audio("/sounds/castle.webm");
const AUDIO_CHECK = new Audio("/sounds/move-check.webm");

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// const FEN = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';

var ENGINE, HIGHLIGHT1, HIGHLIGHT2, HIGHLIGHT3, HOVER_SQUARE, HINTS = [];
var EVAL_BAR_CAP = 12.5;

var game_over = false;
var origin_index = 0;
var moved_index = 0;
var legal_moves = [];
var clicked = false;
var selected;
var move;

let socket = new WebSocket(document.URL.replace('http', 'ws'));

socket.onmessage = message => {
    let stdout = message.data;
    // console.clear();

    if (stdout.startsWith("move"))
    {
        stdout = stdout.slice(4).split(',');

        let promo = 0;

        switch(parseInt(stdout[2]))
        {
            case 6:
                promo = ENGINE.PIECES_L2I['n'] + 1;
                break;
            case 7:
                promo = ENGINE.PIECES_L2I['b'] + 1;
                break;
            case 8:
                promo = ENGINE.PIECES_L2I['r'] + 1;
                break;
            case 9:
                promo = ENGINE.PIECES_L2I['q'] + 1;
                break;
        }

        _playMove(new Move(
            ENGINE.BOARD_POSITION_TABLE.indexOf(stdout[0]), 
            ENGINE.BOARD_POSITION_TABLE.indexOf(stdout[1]),
            parseInt(stdout[2]), 
            promo));

        console.clear();
        console.log(`${stdout[5]}: \nmove: ${stdout[0]} -> ${stdout[1]}\npgn: ${stdout[4]}\npgn: ${ENGINE.pgn}\nscore: ${stdout[3]}`)
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await fetch(`${document.URL}api/req_permission`, { headers:{ 'authentication':'secret' } });

    if(!HIGHLIGHT1) HIGHLIGHT1 = document.getElementById('highlight1');
    if(!HIGHLIGHT2) HIGHLIGHT2 = document.getElementById('highlight2');
    if(!HIGHLIGHT3) HIGHLIGHT3 = document.getElementById('highlight3');
    if(!HOVER_SQUARE) HOVER_SQUARE = document.getElementById('hover-square');
    HIGHLIGHT1.style.visibility = "hidden";
    HIGHLIGHT2.style.visibility = "hidden";
    HIGHLIGHT3.style.visibility = "hidden";
    HOVER_SQUARE.style.visibility = "hidden";
    loadFen();
    document.getElementById("board").onmousedown = rightClickClear;
    document.oncontextmenu = new Function("return false;");
});

//#region Loading

function loadBoard(fen)
{
    // clear the board
    const elements = document.querySelectorAll('.piece');
    elements.forEach(element => {
        element.remove();
    });

    // place the pieces
    const chars = fen.slice('');
    let board_index = 0;

    for (let i = 0; i < chars.length; i++)
    {
        let char = chars[i];

        if(char === ' ')
        {
            break;
        }

        if(char === '/')
        {
            continue;
        }

        const digit = parseInt(char);

        if(digit)
        {
            board_index += digit;
            continue;
        }

        // CUSTOM::FAERIE -> New character to parse in FEN
        if(char === '!') char = chars[++i]+chars[++i];

        loadPiece(char === char.toUpperCase(), char.toLowerCase(), board_index);
        board_index++;
    }
}

function loadPiece(white, piece, index)
{
    if(white === undefined)
        return;

    const rank = index%8;
    const file = Math.floor(index/8);
    const node = document.createElement('img');

    node.src = `/images/${white? 'w' : 'b'}${piece}.png`;
    node.classList.add('piece');
    node.style.transform = `translate(${rank*100}%,${file*100}%)`;
    node.id = 'p'+index;

    document.getElementById('board').appendChild(node);

    dragElement(node);
}

function loadFen(fen = FEN)
{
    ENGINE = new Engine(fen);

    ENGINE.initialize().then(async () => {
        loadBoard(fen);
        // AUDIO_START.play();

        const children = document.getElementById("promotion-window").children;

        for (let i = 0; i < children.length; i++)
        {
            children.item(i).addEventListener("click", promotePiece);
        }
    });
}

//#endregion

//#region Handlers

async function updateEvalBar(score = undefined)
{
    const element = document.getElementById('evaluation-bar-text');

    score = score || parseInt(await fetch(`${document.URL}api/evaluate?fen=${ENGINE.generateFen()}`, { headers:{ 'authentication':'secret' } }));

    if(score > 0)
    {
        element.textContent = score;
        element.classList.add('evaluation-bar-dark');
        element.classList.remove('evaluation-bar-light');
    }
    else if(score < 0)
    {
        element.textContent = score;
        element.classList.remove('evaluation-bar-dark');
        element.classList.add('evaluation-bar-light');
    }

    score = Math.max(-EVAL_BAR_CAP, Math.min(score, EVAL_BAR_CAP)) / EVAL_BAR_CAP;
    document.getElementById('evaluation-bar').style.transform = `translate3d(0px, ${-score * 50 + 50}%, 0px)`;
}

function rightClickClear(event)
{
    if(event.button !== 2) return;

    hideHints();
    document.getElementById('promotion-window').style.display = 'none';

    if(selected)
    {
        selected.style.cursor = 'grab';
        selected.style['z-index'] = 1;
        moveElementToIndex(selected, origin_index);
        selected = undefined;
        clicked = false;
    }
}

function dragElement(element)
{
    element.onmousedown = onMouseDown;

    async function onMouseDown(event)
    {
        event = event || window.event;
        if (event.stopPropagation) event.stopPropagation();
        if (event.preventDefault)  event.preventDefault();

        if(game_over) return;

        if(event.button !== 0)
        {
            rightClickClear(event);
            return;
        }

        document.getElementById('promotion-window').style.display = 'none';
        document.onmouseup = onMouseUp;
        document.onmousemove = onMouseDrag;

        selected = element;
        clicked = true;

        // If clicked on an enemy piece while still had a piece clicked
        if(legal_moves.length > 1)
        {
            const is_white = ENGINE.isWhite(parseInt(element.id.slice(1)));

            moved_index = getIndex(event);

            if(ENGINE.isWhite(legal_moves[0].getFrom()) !== is_white &&
                legal_moves.some(move => move.getTo() === moved_index))
            {
                onMouseUp(event);
                return;
            }
        }

        origin_index = parseInt(element.id.slice(1));
        
        // TODO: Maybe hide the grabbing for a piece if a clicked piece's legal move is a enemy piece.. piece piece piecepicuwu
        element.style.cursor = 'grabbing';
        element.style['z-index'] = 2;

        legal_moves = ENGINE.veryLegalMoves(origin_index);

        // if(!ENGINE.white2move) legal_moves = [];

        hideHints();
        onMouseDrag(event);
        moveElementToIndex(HIGHLIGHT1, origin_index);

        let prev;

        for (let i = 0; i < legal_moves.length; i++)
        {
            if(legal_moves[i].getPromotion())
            {
                if(prev === legal_moves[i].getTo()) continue;
                prev = legal_moves[i].getTo();
            }

            const node = document.createElement('div');

            if(legal_moves[i].getFlags() & 4 || legal_moves[i].getFlags() & 5)  node.classList.add('capture-hint');
            else node.classList.add('hint');

            moveElementToIndex(node, legal_moves[i].getTo());

            document.getElementById('board').appendChild(node);

            HINTS.push(node);
        }
    }

    function onMouseUp(event)
    {
        if(!clicked || event.button !== 0) return;

        element.style.cursor = 'grab';
        element.style['z-index'] = 1;

        moved_index = getIndex(event);

        const is_white = ENGINE.isWhite(origin_index);

        if(is_white !== ENGINE.white2move || !legal_moves.some(move => move.getTo() === moved_index))
        {
            moveElementToIndex(element, origin_index);
        }
        else
        {
            hideHints();

            if(ENGINE.getLabel(origin_index) === 'p' && ((Math.floor(moved_index / 8) === 0 && is_white) || (Math.floor(moved_index / 8) === 7 && !is_white)))
            {
                const win = document.getElementById('promotion-window');
                for (let i = 0; i < win.children.length; i++)
                {
                    win.children.item(i).src = win.children.item(i).src.slice(0,-6) + (is_white?'w':'b') + win.children.item(i).src.slice(-5);
                }

                const coords = getCoords(event);
                const rank = Math.floor(coords.x/100);

                win.style.display = null;
                win.style.transform = `translate(${rank*100}%)`;
                moveElementToIndex(element, origin_index);
            }
            else
            {
                playMove(origin_index, moved_index);
                legal_moves = [];
            }

            clicked = false;
        }
        
        document.move_index = document.onmousemove = null;
    }

    function onMouseDrag(event)
    {
        if(!clicked || event.button !== 0) return;

        const coords = getCoords(event, 50); // why 12.5 * 4? yes
        element.style.transform = `translate(${coords.x}%,${coords.y}%)`;

        moveElementToSquare(HOVER_SQUARE, event);
    }
}

//#endregion

//#region Playing

async function playMove(from, to, promo)
{
    _playMove(new Move(from, to, legal_moves.filter(move => move.getTo() === to)[0].getFlags(), promo));

    if(game_over) return;

    fetch(`${document.URL}api/best_move?fen=${ENGINE.generateFen()}&pgn=${ENGINE.pgn}&depth=6`, { headers:{ 'authentication':'secret' } });
}

function _playMove(move)
{
    let audio = 0;

    if(move.getFlags() === 4 || move.getFlags() === 5)
    {
        audio = 1;
    }
    else if(move.getFlags() === 2 || move.getFlags() === 3)
    {
        audio = 2;
    }

    ENGINE.makeMove(move);

    let check = ENGINE.isInCheck(2);

    if(check === 1)
    {
        audio = 3;
    }
    else if(check === 2 || ENGINE.isDraw() || ENGINE.isStalemate())
    {
        audio = 4;
        game_over = true;
    }

    HIGHLIGHT1.style.transform = `translate(${(move.getFrom()%8)*100}%,${(Math.floor(move.getFrom()/8))*100}%)`;
    HIGHLIGHT1.style.visibility = 'visible';
    HIGHLIGHT2.style.transform = `translate(${(move.getTo()%8)*100}%,${(Math.floor(move.getTo()/8))*100}%)`;
    HIGHLIGHT2.style.visibility = 'visible';

    playAudio(audio);
    loadBoard(ENGINE.generateFen());

    // updateEvaluation();
}

function playAudio(audio_index)
{
    AUDIO_CAPTURE.pause();
    AUDIO_CAPTURE.currentTime = 0;
    AUDIO_CASTLE.pause();
    AUDIO_CASTLE.currentTime = 0;
    AUDIO_CHECK.pause();
    AUDIO_CHECK.currentTime = 0;
    AUDIO_END.pause();
    AUDIO_END.currentTime = 0;
    AUDIO_MOVE.pause();
    AUDIO_MOVE.currentTime = 0;

    switch(audio_index)
    {
        case 1:
            AUDIO_CAPTURE.play();
            break;
        case 2:
            AUDIO_CASTLE.play();
            break;
        case 3:
            AUDIO_CHECK.play();
            break;
        case 4:
            AUDIO_END.play();
            break;
        default:
            AUDIO_MOVE.play();
            break;
    }
}

function promotePiece(event)
{
    const coords = getCoords(event);
    const file = Math.floor((coords.y/100)%8);
    const win = document.getElementById("promotion-window");

    for (let i = 0; i < win.children.length; i++)
    {
        if(win.children.item(i).style.order === file.toString())
        {
            document.getElementById('promotion-window').style.display = 'none';
            playMove(origin_index, moved_index, ENGINE.PIECES_L2I[win.children.item(i).src.slice(-5,-4)] + 1);
            break;
        }
    }
}

async function getHint(depth = 4)
{
    console.clear();
    const move = await fetch(`${document.URL}api/best_move?fen=${ENGINE.generateFen()}&white=true&depth=${depth}`, { headers:{ 'authentication':'secret' } })
    .then(res => res.json());
    console.log('Hint', `${move[2]>0?'+':''}${move[2]}`);
    for (let i = 0; i < move[1].length; i++) console.log(move[1][i]);
}

//#endregion

//#region Helpers

function hideHints()
{
    HOVER_SQUARE.style.visibility = 'hidden';
    HINTS.forEach(node => {
        node.remove();
    });
}

function getIndex(event)
{
    const coords = getCoords(event);
    const file = Math.floor((coords.y/100)%8);
    const rank = Math.floor(coords.x/100);
    return file*8+rank;
}

function moveElementToSquare(element, event)
{
    const coords = getCoords(event);
    element.style.transform = `translate(${Math.floor(coords.x/100)*100}%,${Math.floor(coords.y/100)*100}%)`;
    if(element.style.visibility) element.style.visibility = 'visible';
}

function moveElementToIndex(element, index)
{
    element.style.transform = `translate(${(index%8)*100}%,${(Math.floor(index/8))*100}%)`;
    if(element.style.visibility) element.style.visibility = 'visible';
}

function getCoords(event, offset = 0)
{
    // 37 padding!
    const minY = 32;
    const maxY = window.innerHeight - 32;
    const minX = window.innerWidth / 2 - (maxY - minY) / 2;
    const maxX = window.innerWidth / 2 + (maxY - minY) / 2;
    const x = ((Math.max(minX, Math.min(maxX, event.pageX)) - minX) / (maxX - minX)) * 800 - offset;
    const y = ((Math.max(minY, Math.min(maxY, event.pageY)) - minY) / (maxY - minY)) * 800 - offset;
    return {x:x,y:y};
}

//#endregion