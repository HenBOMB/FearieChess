// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

const AUDIO_MOVE = new Audio("/sounds/move-self.webm");
const AUDIO_CAPTURE = new Audio("/sounds/capture.webm");
const AUDIO_START = new Audio("/sounds/game-start.webm");
const AUDIO_END = new Audio("/sounds/game-end.webm");
const AUDIO_CASTLE = new Audio("/sounds/castle.webm");
const AUDIO_CHECK = new Audio("/sounds/move-check.webm");

var ENGINE, HIGHLIGHT1, HIGHLIGHT2, HIGHLIGHT3, HOVER_SQUARE, HINTS;

var ended = false;
var origin_index;
var is_owner;
var legal_moves;
var clicked = false;
var selected;

///////////////////////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', (event) => {
    document.getElementById("btn_play").addEventListener("click", start);
});

function start()
{
    document.getElementById('btn_play').remove();

    if(!ENGINE) ENGINE = new Engine('8/2p5/3p4/KP5r/1R3p1k/8/4P1bQ/8 w - - 0 1');
    
    ENGINE.initialize().then(() => {
        if(!HIGHLIGHT1) HIGHLIGHT1 = document.getElementById('highlight1');
        if(!HIGHLIGHT2) HIGHLIGHT2 = document.getElementById('highlight2');
        if(!HIGHLIGHT3) HIGHLIGHT3 = document.getElementById('highlight3');
        if(!HOVER_SQUARE) HOVER_SQUARE = document.getElementById('hover-square');

        loadBoard(ENGINE.fen);
        AUDIO_START.play();
    });
}

function dragElement(element) 
{
    element.onmousedown = onMouseDown;
    
    const is_white = element.src.slice(-6,-5)==='w';

    function onMouseDown(event) 
    {
        if(event.button !== 0)
        {
            if(selected)
            {
                moveElementToIndex(selected, origin_index);
                selected = undefined;
            }
            return;
        }

        clicked = true;

        event = event || window.event;
        event.preventDefault();

        document.onmouseup = onMouseUp;
        document.onmousemove = onMouseDrag;

        is_owner = ENGINE.player === 2 || (is_white && ENGINE.player === 0) || (!is_white && ENGINE.player === 1);
        
        // origin_index = getIndex(event);
        origin_index = parseInt(element.id.slice(1));
        element.style.cursor = 'grabbing';

        selected = element;
        element.style['z-index'] = 2;
        dragPiece(event);
        moveElementToSquare(HIGHLIGHT1, event);

        // display legal move hints

        legal_moves = ended? [] : ENGINE.legalMoves(origin_index);
        
        if(HINTS)
        {
            HINTS.forEach(node => {
                node.remove();
            });
        }

        if(is_owner)
        {
            HINTS = [];
    
            for (let i = 0; i < legal_moves.length; i++)
            {
                const node = document.createElement('div');

                if(ENGINE.isCapturable(legal_moves[i], is_white))
                {
                    node.classList.add('capture-hint');
                }
                else
                {
                    node.classList.add('hint');
                }

                moveElementToIndex(node, legal_moves[i]);

                document.getElementById('board').appendChild(node);
    
                HINTS.push(node);
            }
        }
    }

    function onMouseDrag(event) 
    {
        if(!clicked) return;
        if(event.button !== 0) return;

        event = event || window.event;
        event.preventDefault();
        dragPiece(event);
        moveElementToSquare(HOVER_SQUARE, event);
    }

    function onMouseUp(event) 
    {
        if(event.button !== 0) return;
        if(!clicked) return;

        HOVER_SQUARE.style.visibility = 'hidden';
        element.style.cursor = 'grab';
        element.style['z-index'] = 1;

        const move_index = getIndex(event);

        if(!is_owner || !legal_moves.includes(move_index) || is_white !== ENGINE.turn_white)
        {
            moveElementToIndex(element, origin_index);
        }
        else if(is_owner)
        {
            moveElementToSquare(HIGHLIGHT2, event);

            HINTS.forEach(node => {
                node.remove();
            });

            if(document.getElementById('p'+move_index))
            {
                document.getElementById('p'+move_index).remove();
            }
                
            const out = ENGINE.playMove(origin_index, move_index);
        
            // out.audio_index = 0/1/2/3/4
            // 0: capture
            // 1: castle
            // 2: check
            // 3: end

            switch(out.audio_index)
            {
                case 0:
                    AUDIO_CAPTURE.pause();
                    AUDIO_CAPTURE.currentTime = 0;
                    AUDIO_CAPTURE.play();
                    break;
                case 1:
                    AUDIO_CASTLE.play();
                    break;
                case 2:
                    AUDIO_CHECK.play();
                    break;
                case 3:
                    ended = true;
                    AUDIO_END.play();
                    break;
                default:
                    AUDIO_MOVE.play();
                    break;
            }

            out.moves.forEach(move => {
                if(move.length === 1)
                {
                    document.getElementById('p'+move[0]).remove();
                    return;
                }
                
                const e = document.getElementById('p'+move[0]);
                e.id = 'p'+move[1];
                moveElementToIndex(e, move[1]);
            });
        }

        selected = undefined;
        clicked = false;
        legal_moves = [];
            
        document.move_index = document.onmousemove = null;
    }

    function getIndex(event)
    {
        console.log("This doesn't work lol fuck you hen");
        
        const coords = getCoords(event);
        
        const rank = Math.floor((event.pageX/window.innerWidth)*8);
        const file = Math.floor((event.pageY/window.innerWidth)*8);
        return file*8+rank;
    }

    function moveElementToSquare(element, event, rank, file)
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

    function dragPiece(event)
    {
        const coords = getCoords(event, 50); // why 12.5 * 4
        element.style.transform = `translate(${coords.x}%,${coords.y}%)`;
    }

    function getCoords(event, offset)
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
}

function loadBoard(fen)
{
    // clear the board
    document.getElementById('board').childNodes.forEach(child => {
        child.remove();
    });

    // place the pieces
    const chars = fen.slice('');
    let board_index = 0;

    for (let i = 0; i < chars.length; i++)
    {
        const char = chars[i];
        
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
            for (let i2 = 0; i2 < digit; i2++)
                board_index++;
            continue;
        }

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