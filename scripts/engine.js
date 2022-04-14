//https://en.wikipedia.org/wiki/Forsyth–Edwards_Notation#:~:text=Forsyth–Edwards%20Notation%20(FEN),Scottish%20newspaper%20journalist%20David%20Forsyth
//https://www.chessprogramming.org/Move_Generation
//https://www.chessprogramming.org/Board_Representation

class Engine
{
    constructor(fen)
    {
        this.FEN_DEFAULT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        this.PIECES_VALUES = [];
        this.PIECES_PATTERNS = [];
        this.PIECES_INITIALS = [];
        this.PIECES_FORMATTED = [];
        this.PIECES_I2V = {}; // initial to value
        this.PIECES_V2I = {}; // value to initial

        this.BOARD_POSITION_TABLE = 
        {
            7 : 'a',
            6 : 'b',
            5 : 'c',
            4 : 'd',
            3 : 'e',
            2 : 'f',
            1 : 'g',
            0 : 'h',
        };

        if(fen === undefined)
            this.fen = this.FEN_DEFAULT;
        else
            this.fen = fen;

        this.player = 2; // (0-2) white, black, both
        // this.piece_list = new Uint16Array(32); // byte? returns index (00), color (white=1), type
        // this.piece_sets = new Uint8Array(64); // bit, returns an index of piece_list
        this.bit_board = new Uint16Array(64);
        this.turn_white = true;
        this.w_king = 0;
        this.b_king = 0;
        this.rooks = [false,false,false,false]; //w kingside, w queenside, b kingside, b queenside
        this.check_data = [false,[],[],{}]; // [true/false, [traversed], [checking pieces], {legal moves cache}]
        this.en_passant = undefined;
        this.moves_3_draw = [];
        this.halfmoves = 0; 
        this.fullmoves = 1; 
    }
    
    initialize()
    {
        return new Promise(resolve => {
            fetch('http://localhost:6969/configs')
            .then(response => response.json())
            .then(data => {
                let configs = data.configs;

                for (let i = 0; i < configs.length; i++)
                {
                    const config = configs[i];

                    this.PIECES_VALUES.push(i);
                    this.PIECES_PATTERNS.push(
                        {
                            v:config.value,
                            p:config.pattern,
                            c:config.pattern_capture,
                            r:(config.repeat||8),
                            rc:(config.pattern_capture?(config.repeat_capture||(config.repeat||9)):undefined)
                        });
                    this.PIECES_INITIALS.push(config.initials);
                    this.PIECES_FORMATTED.push(config.name.slice(0,-3));
                    this.PIECES_I2V[config.initials] = i;
                    this.PIECES_V2I[i] = config.initials;
                }

                this.generateBitBoard();
                resolve();
            }).catch(e => { throw "An error occurred whilst contacting the server: "+e; });
        });
    }

    generateBitBoard()
    {
        let char_set = this.fen.split(' ');
        if(char_set.length < 3)
        {
            switch(char_set.length)
            {
                case 0:
                    char_set = this.FEN_DEFAULT.split(' ');  
                    console.warn("Invalid fen string, using starting position.\n"+this.fen);
                    break;
                case 1:
                    char_set = [char_set[0],'w','-','0','1'];
                    break;
                case 2:
                    char_set.push('-', '0', '1');
                    break;
            }
        }

        let rank = 0;
        let file = 0;
        let _i = 0;
        let board_index = 0;

        for (let i = 0; i < char_set[0].length; i++)
        {
            const char = char_set[0][i];
            
            if(char === '/') 
            {
                file++;
                rank = 0;
                continue;
            }

            const digit = parseInt(char);

            if(digit)
            {
                rank += digit;

                for (let i2 = 0; i2 < digit; i2++)
                {
                    board_index++;
                    this.bit_board[board_index] = 0;
                }

                continue;
            }

            rank++;

            // 10 is offset to not have a 0 at the beggning of the uuid
            this.bit_board[board_index] = `${file*8+rank+10}${char===char.toUpperCase()?1:0}${this.PIECES_I2V[char.toLowerCase()]}`;
            
            if(char === 'k')
            {
                this.b_king = board_index;
            }
            else if(char === 'K')
            {
                this.w_king = board_index;
            }

            _i++;
            board_index++;
        }

        //w KQkq - 0 1
        //w kq - 0 1
        //w Kkq - 0 1
        //w - - 0 1

        this.turn_white = char_set[1] === 'w';
        if(char_set[2] !== '-')
        {
            this.rooks[0] = char_set[2].includes('K');
            this.rooks[1] = char_set[2].includes('Q');
            this.rooks[2] = char_set[2].includes('k');
            this.rooks[3] = char_set[2].includes('q');
        }

        //TODO: parse en passant
        // this.en_passant = char_set[3]==='-'? undefined : ???;
        this.halfmoves = parseInt(char_set[4]===undefined?0:char_set[4]);
        this.fullmoves = parseInt(char_set[5]===undefined?1:char_set[5]);
    }
    
    generateFen()
    {
        let cnt = 0;
        let fen = "";
    
        for (let i = 0; i < 64; i++)
        {
            const uuid = this.bit_board[i];

            if(uuid === 0)
            {
                cnt += 1;
                if(cnt > 1) fen = fen.slice(0,-1) + cnt;
                else fen += cnt;
            }
            else
            {
                const piece = this.PIECES_V2I[this.getValue(i)];
                fen += `${this.isWhite(i)? piece.toUpperCase() : piece}`;
                cnt = 0;
            }

            if((i+1)%8 == 0)
            {
                fen += '/';
                cnt = 0;
            }
        }

        fen += ` ${this.turn_white? 'w' : 'b'}`;
        const castling = `${this.rooks[0] === true?'K':''}${this.rooks[1] === true?'Q':''}${this.rooks[2] === true?'k':''}${this.rooks[3] === true?'q':''}`;
        fen += ` ${castling===''?'-':castling}`;
        fen += ` ${this.en_passant?this.formatMove(this.en_passant+(this.isWhite(this.en_passant)?8:-8)):'-'}`;
        fen += ` ${this.halfmoves} ${this.fullmoves}`;

        return fen;
    }

    generateRandomMove()
    {
        throw "Unfinished";
        // const randomInt = max => Math.floor(Math.random() * max);

        // const index = this.bit_board[randomInt(this.bit_board.length)];

        // return moves.length === 0? undefined : moves[randomInt(moves.length)];
    }

    playMove(from, to)
    {
        const out = {moves:[]};
        const label = this.PIECES_V2I[this.getValue(from)];

        this.turn_white = !this.turn_white;
        this.halfmoves++;

        const drawGame = () => {
            out.audio_index = 3;

            this.bit_board[to] = this.bit_board[from];
            this.bit_board[from] = 0;
            out.moves.push([from, to]);
        };
        
        if(label === 'p')
        {
            this.halfmoves = 0;
        }

        if(this.halfmoves === 50)
        {
            drawGame();
            return out;
        }
        
        if(this.turn_white)
        {
            this.fullmoves++;
        }

        // Audio queue
        if(this.bit_board[to] !== 0)
        {
            out.audio_index = 0;
        }

        //#region Looking for draw by repetition ->

        const formatted_move = this.formatMove(from, to);

        this.moves_3_draw.push(this.formatMove(from, to));
        if(this.moves_3_draw.length > 1 && formatted_move[0].toLowerCase() !== this.moves_3_draw[this.moves_3_draw.length-2][0].toLowerCase())
        {
            this.moves_3_draw = [];
        }
        else if(this.moves_3_draw.length > 10)
        {
            const found = [];
    
            for (let i = 0; i < this.moves_3_draw.length; i++)
            {
                const l = this.moves_3_draw.filter(v => v === this.moves_3_draw[i]).length;
                found.push(Math.min(l, 3));
            }
    
            const count_3 = found.filter(x => x === 3).length;
            const count_2 = found.filter(x => x === 2).length;

            console.clear();
            console.log(found);

            if(count_2 === 2 && found.length === count_2 + count_3)
            {
                console.log('Draw by repetition');
                drawGame();
                return out;
            }
        }

        //#endregion

        //#region Looking for en passant ->

        if(label === 'p')
        {
            if(this.en_passant === to + (this.turn_white?-8:8))
            {
                this.bit_board[this.en_passant] = 0;
                out.moves.push([this.en_passant]);
                this.en_passant = undefined;
                out.audio_index = 0;
            }
            else if(((from - to) / 8) ** 2 === 4 && 
            ((this.bit_board[to + 1] !== 0 && this.isWhite(to + 1) === this.turn_white && this.moveExists(to, [1, 0]) && this.PIECES_V2I[this.getValue(to + 1)] === 'p') || 
            (this.bit_board[to - 1] !== 0 && this.isWhite(to - 1) === this.turn_white && this.moveExists(to, [-1, 0]) && this.PIECES_V2I[this.getValue(to - 1)] === 'p')))
            {
                if((this.bit_board[to + 1] !== 0 && this.moveExists(to, [1,0])) ||
                    this.bit_board[to - 1] !== 0 && this.moveExists(to, [-1,0]))
                {
                    console.log('New en passant available: ' + to);
                    this.en_passant = to;
                }
            }
            else
            {
                this.en_passant = undefined;
            }
        }
        else
        {
            this.en_passant = undefined;
        }

        //#endregion

        //#region Looking for castling ->

        if(this.w_king === from)
        {
            if(to - from === 2)
            {
                this.bit_board[61] = this.bit_board[63];
                this.bit_board[63] = 0;
                out.moves.push([63, 61]);
                out.audio_index = 1;
            }
            else if(to - from === -2)
            {
                this.bit_board[59] = this.bit_board[56];
                this.bit_board[56] = 0;
                out.moves.push([56, 59]);
                out.audio_index = 1;
            }

            this.w_king = to;
            this.rooks[0] = false;
            this.rooks[1] = false;
        }
        else if(this.b_king === from)
        {
            if(to - from === 2)
            {
                this.bit_board[5] = this.bit_board[7];
                this.bit_board[7] = 0;
                out.moves.push([7, 5]);
                out.audio_index = 1;
            }
            else if(to - from === -2)
            {
                this.bit_board[3] = this.bit_board[0];
                this.bit_board[0] = 0;
                out.moves.push([0, 3]);
                out.audio_index = 1;
            }

            this.b_king = to;
            this.rooks[2] = false;
            this.rooks[3] = false;
        }
        else if(label === 'r')
        {
            if(this.isWhite(from))
            {
                if(from === 56)
                {
                    this.rooks[1] = false;
                }
                else if(from === 63)
                {
                    this.rooks[0] = false;
                }
            }
            else
            {
                if(from === 7)
                {
                    this.rooks[2] = false;
                }
                else if(from === 0)
                {
                    this.rooks[3] = false;
                }
            }
        }

        //#endregion

        //#region Updating the board ->

        this.bit_board[to] = this.bit_board[from];
        this.bit_board[from] = 0;
        out.moves.push([from, to]);

        //#endregion

        //#region Looking for any checks ->

        this.check_data = [false,[],[],{}];

        for (let i = 0; i < 63; i++)
        {
            if(this.bit_board[i] === 0) continue;
            if(this.isWhite(i) === this.turn_white) continue;

            // ally color pieces

            const rayInfo = this.kingCast(i, this.turn_white);
            
            if(rayInfo.length === 0) continue;

            if(rayInfo[2].length > 0)
            {
                rayInfo[0].forEach(move => {
                    if(!this.check_data[1].includes(move)) this.check_data[1].push(move);
                });

                rayInfo[2].forEach(move => {
                    if(!this.check_data[2].includes(move)) this.check_data[2].push(move);
                });
            }
        }

        // Check
        if(this.check_data[2].length === 1)
        {
            out.audio_index = 2;

            for (let i = 0; i < 63; i++)
            {
                if(this.bit_board[i] === 0) continue;
                if(this.isWhite(i) !== this.turn_white) continue;

                if(i === this.b_king || i === this.w_king)
                {
                    this.check_data[3][i] = this.legalMoves(i);
                }
                else
                {
                    this.check_data[3][i] = this.legalMoves(i).filter(move => this.check_data[1].includes(move) || move === this.check_data[2][0]);
                }

                if(this.check_data[3][i].length === 0)
                {
                    delete this.check_data[3][i];
                }
            }

            const check_mate = !Object.keys(this.check_data[3]).some(key => this.check_data[3][key] !== 0);

            if(check_mate)
            {
                console.log(`Check mate, ${this.turn_white?"Black":"White"} won!`);
                out.audio_index = 3;
            }

            this.check_data[0] = true;
        }
        // Double check
        else if(this.check_data[2].length > 1)
        {
            const legal_moves = this.legalMoves(this.turn_white? this.w_king : this.b_king);

            if(legal_moves.length === 0)
            {
                console.log(`Check mate, ${this.turn_white?"Black":"White"} won!`);
                out.audio_index = 3;
            }
            else
            {
                this.check_data[3][this.turn_white? this.w_king : this.b_king] = legal_moves;
                out.audio_index = 2;
            }

            this.check_data[0] = true;
        }
        else
        {
            let stalemate = true;

            for (let i = 0; i < 63; i++)
            {
                if(this.bit_board[i] === 0) continue;
                if(this.isWhite(i) !== this.turn_white) continue;

                if(this.legalMoves(i).length > 0)
                {
                    stalemate = false;
                    break;
                }
            }

            if(stalemate)
            {
                out.audio_index = 3;
                console.log(`Stalemate!`);
            }

            this.check_data = [false,[],[],{}];
        }
        
        //#endregion

        return out;
    }

    // ENGINE

    // In Pseudo-legal move generation pieces obey their normal rules of movement, but they're not checked beforehand to see if they'll leave the king in check. 
    // It is left up to the move-making function to test the move, or it is even possible to let the king remain in check and only test for the capture of the king on the next move.
    pseudoLegalMoves(index)
    {
        const positions = [];
        const value = this.getValue(index);
        const is_white = this.isWhite(index);
        const patterns = this.PIECES_PATTERNS[value];

        // capture_mode = 0/1/2 -> 0: always capture, 1: just capture, 2: never capture
        const parsePattern = (pattern, repeat, capture_mode = 0) => {
            let _index = index;

            for (let _ = 0; _ < repeat; _++)
            {
                if(!this.moveExists(_index, [pattern[0]*(is_white?1:-1),[pattern[1]*(is_white?1:-1)]]))
                {
                    break;
                }

                _index += (pattern[0] + pattern[1] * 8) * (is_white? 1 : -1);
               
                if(this.bit_board[_index] === 0)
                {
                    if(capture_mode === 1)
                    {
                        break;
                    }
                    
                    positions.push(_index);
                    continue;
                }

                if(this.isCapturable(_index, is_white) && capture_mode !== 2)
                {
                    positions.push(_index);
                }

                break;
            }
        };

        for (let i = 0; i < patterns.p.length; i++)
        {
            parsePattern(patterns.p[i], patterns.r, patterns.c? 2 : 0);
        }

        // Custom capture pattern
        if(patterns.c)
        {
            for (let i = 0; i < patterns.c.length; i++)
            {
                parsePattern(patterns.c[i], patterns.rc, 1);
            }
        }

        // Pawn movement
        if(this.PIECES_V2I[value] === 'p')
        {
            if(is_white && Math.floor(index/8) === 6)
            {
                parsePattern([0, -1], 2, 2);
            }
            else if(!is_white && Math.floor(index/8) === 1)
            {
                parsePattern([0, -1], 2, 2);
            }

            if(this.en_passant)
            {
                if((index + 1 === this.en_passant && this.moveExists(index, [1,0])) ||
                    (index - 1 === this.en_passant && this.moveExists(index, [-1,0])))
                {
                    positions.push(this.en_passant + (is_white?-8:8));
                }
            }
        }

        // WARNINGS::TODO
        // > pieces (rook & king) can just return to their square

        // Castling
        if(this.PIECES_V2I[value] === 'k')
        {
            if(is_white)
            {
                if(this.rooks[0] && this.bit_board[63] !== 0 && this.PIECES_V2I[this.getValue(63)] === 'r')
                {
                    if(this.bit_board[62] === 0 && this.bit_board[61] === 0)
                    {
                        parsePattern([2,0], 1);
                    }
                }

                if(this.rooks[1] && this.bit_board[56] !== 0 && this.PIECES_V2I[this.getValue(56)] === 'r')
                {
                    if(this.bit_board[59] === 0 && this.bit_board[58] === 0 && this.bit_board[57] === 0)
                    {
                        parsePattern([-2,0], 1);
                    }
                }
            }
            else
            {
                if(this.rooks[3] && this.bit_board[0] !== 0 && this.PIECES_V2I[this.getValue(0)] === 'r')
                {
                    if(this.bit_board[1] === 0 && this.bit_board[2] === 0 && this.bit_board[3] === 0)
                    {
                        parsePattern([2,0], 1);
                    }
                }

                if(this.rooks[2] && this.bit_board[7] !== 0 && this.PIECES_V2I[this.getValue(7)] === 'r')
                {
                    if(this.bit_board[5] === 0 && this.bit_board[6] === 0)
                    {
                        parsePattern([-2,0], 1);
                    }
                }
            }
        }

        return positions;
    }

    // Chess pieces worth: https://www.chess.com/forum/view/general/whats-a-chess-piece-worth
    // TODO: Handle promotion
    // TODO: Random move generation
    // TODO: Board evaluation

    legalMoves(index, force = false)
    {
        if(this.bit_board[index] === 0) return [];

        if(this.check_data[0] && !force)
        {
            const moves = this.check_data[3][index];
            return moves? moves : [];
        }

        const is_white = this.isWhite(index);

        let pseudo_legal_moves = this.pseudoLegalMoves(index);

        if(this.PIECES_V2I[this.getValue(index)] === 'k')
        {
            // TODO:NOTE: This doesn't use the second array
            const protectedMoves = this.allProtectedMoves(!is_white)[0];
            pseudo_legal_moves = pseudo_legal_moves.filter(move => !protectedMoves.includes(move));
        }
        else
        {
            for (let i = 0; i < 63; i++)
            {
                if(this.bit_board[i] === 0) continue;
                if(this.isWhite(i) === is_white) continue;
                
                const rayInfo = this.kingCast(i, is_white);

                if(rayInfo.length === 0) continue;
                
                // Any illegal moves?
                if(rayInfo[3].length > 0)
                {
                    for (let i2 = 0; i2 < rayInfo[3].length; i2++)
                    {
                        // The first index, a piece index, the second, an illegal move 
                        if(rayInfo[3][i2][0] === index)
                        {
                            pseudo_legal_moves = pseudo_legal_moves.filter(move => move === rayInfo[3][i2][1]);
                        }
                    }
                }

                if(rayInfo[1].length > 0 && rayInfo[1][0].includes(index))
                {
                    pseudo_legal_moves = pseudo_legal_moves.filter(move => rayInfo[1][0].includes(move));
                }
            }
        }

        return pseudo_legal_moves;
    }

    // Returns all the squares a piece can go to, regardless if legal / illegal, stops at collision, includes protected pieces
    // Also returns the checked king index (if any)
    // Returns an array [positions, piece indexes that check the enemy king]
    protectedMoves(index)
    {
        if(this.bit_board[index] === 0) return [];

        const positions = [];
        const value = this.getValue(index);
        const is_white = this.isWhite(index);
        const patterns = this.PIECES_PATTERNS[value];
        const checkers = [];

        const parsePattern = (pattern, repeat) => {
            let _index = index;

            for (let _ = 0; _ < repeat; _++)
            {
                if(!this.moveExists(_index, [pattern[0]*(is_white?1:-1),[pattern[1]*(is_white?1:-1)]]))
                {
                    break;
                }

                _index += (pattern[0] + pattern[1] * 8) * (is_white? 1 : -1);

                if(this.bit_board[_index] === 0)
                {
                    positions.push(_index);
                    continue;
                }

                if(this.isCapturable(_index, is_white))
                {
                    if(_index === this.w_king || _index === this.b_king)
                    {
                        checkers.push(index);
                        // positions.push(_index);
                        continue;
                    }
                    break;
                }

                // If not capturable, then protect the ally piece
                positions.push(_index);
                break;
            }
        };

        for (let i = 0; i < patterns.p.length; i++)
        {
            if(patterns.c) continue;
            parsePattern(patterns.p[i], patterns.r);
        }

        // Custom piece captures
        if(patterns.c)
        {
            for (let i = 0; i < patterns.c.length; i++)
            {
                parsePattern(patterns.c[i], patterns.rc);
            }
        }

        return [positions, checkers];
    }

    allProtectedMoves(is_white)
    {
        const positions = [];
        const checkers = [];

        for (let i = 0; i < this.bit_board.length; i++)
        {
            // TODO: just use this.isWhite(i) !== is_white??
            if(this.bit_board[i] === 0) continue;
            if(this.isWhite(i) && !is_white) continue;
            if(!this.isWhite(i) && is_white) continue;

            const protected_moves = this.protectedMoves(i);

            protected_moves[0].forEach(move => {
                if(!positions.includes(move)) positions.push(move);
            });

            protected_moves[1].forEach(move => {
                if(!checkers.includes(move)) checkers.push(move);
            });
        }

        return [positions, checkers];
    }

    // Casts a ray from an index to a king, using the piece's capture pattern or default movement
    // It returns the pinned pieces, what pieces are checking the king and the traversed squares
    // TODO:DOING: Pins pieces with possible en passant captures , adds the illegal moves to -> this.cache_illegal_moves
    // Maybe add discovered attacks to further shorten down the loop usage:
    // basically: just mark when an ally piece was hit, then if the next hit piece is the king and the before hit piece is not pinned, discovered check
    // nvm it doesn't work
    // [traversed, [[pinner, pinned piece]], checking, [[illegal_moves]]]
    kingCast(index, is_white)
    {
        if(this.bit_board[index] === 0) return [];
        if(index === this.w_king || index === this.b_king) return [];

        // looping through all the enemy pieces and then ->
        // getting the direction of attack and seeing if the king is behind the first attacked piece
        // ps: maybe rewrite that

        const king_index = is_white? this.w_king : this.b_king;
        const piece_pattern = this.PIECES_PATTERNS[this.getValue(index)];
        
        const _ = piece_pattern.p[0][0]**2 - piece_pattern.p[0][1]**2;

        if(_ > 1 || _ < -1)
        {
            return [[],[],this.protectedMoves(index)[1]];
        }
        
        const dir_pattern = [(king_index%8)-(index%8),Math.floor(king_index/8)-Math.floor(index/8)];

        dir_pattern[0] = dir_pattern[0] === 0? 0 : dir_pattern[0] < 0? -1 : 1;
        dir_pattern[1] = dir_pattern[1] === 0? 0 : dir_pattern[1] < 0? -1 : 1;

        // if the piece has a custom capture pattern and it doesn't match the direction pattern required, ignore
        // or if the repeat is 1
        // or if the default pattern is not part of the ray direction
        
        if(piece_pattern.c)
        {
            const inverse = is_white? -1 : 1;
            
            const filter = piece_pattern.c.filter(pattern => 
                dir_pattern[0] === pattern[0] * inverse && 
                dir_pattern[1] === pattern[1] * inverse);

            if(filter.length === 0)
            {
                return [];
            }
            else
            {
                dir_pattern[0] = filter[0][0] * inverse;
                dir_pattern[1] = filter[0][1] * inverse;
            }
        }
        else if(!piece_pattern.p.some(r => r[0]===dir_pattern[0] && r[1]===dir_pattern[1]))
        {
            return [];
        }

        // if is diagonal attack, then the rank and file distance to the origin must be equal (must be a square between the two pieces)
        if(dir_pattern[0] !== 0 && dir_pattern[1] !== 0)
        {
            if(((index%8)-(king_index%8))**2 !== (Math.floor(index/8)-Math.floor(king_index/8))**2)
            {
                return [];
            }
        }
        
        const repeat = piece_pattern.rc || piece_pattern.r || 8;
        const pins = [];
        const checking = [];
        const traversed_moves = [];
        const illegal_moves = [];
        let _index = index;
        let hit = false;
        let is_en_passant = false;
        let count_en_passant = 0;
        let en_passanter_1;
        let en_passanter_2;

        // const repeat = attacker_pattern.rc || attacker_pattern.r;
        // An array containing all moves that the ray traversed

        for (let _ = 0; _ < repeat; _++)
        {
            if(!this.moveExists(_index, dir_pattern))
            {
                if(is_en_passant)
                {
                    for (let _ = 0; _ < count_en_passant; _++)
                    {
                        traversed_moves.pop();
                    }
                }
                break;
            }
                
            if(is_en_passant) count_en_passant++;
            _index += dir_pattern[0] + dir_pattern[1] * 8;
            traversed_moves.push(_index);

            // If nothing was hit, skip checking this square
            if(this.bit_board[_index] === 0)
            {
                continue;
            }

            // If we hit an en passant piece
            if(this.en_passant === _index && !is_en_passant)
            {
                en_passanter_1 = 
                    (this.moveExists(_index, [dir_pattern[0],0]) && 
                    this.isWhite(_index + dir_pattern[0]) !== this.isWhite && 
                    this.PIECES_V2I[this.getValue(_index + dir_pattern[0])] === 'p')? _index + dir_pattern[0]: undefined;
                
                is_en_passant = en_passanter_1 !== undefined;
                
                if(is_en_passant)
                {
                    continue;
                }
            }

            // If we hit an ally piece
            if(this.isCapturable(_index, is_white))
            {
                if(is_en_passant)
                {
                    is_en_passant = false;
                }

                if(hit)
                {
                    pins.pop();
                }

                break;
            }

            // If not, then it's an enemy piece
                
            // This is check, cause it's the first hit piece, except when en passanting
            if(_index === this.getKing(is_white) && !hit)
            {
                if(is_en_passant)
                {
                    for (let _ = 0; _ < count_en_passant; _++)
                    {
                        traversed_moves.pop();
                    }

                    console.log('Illegal en passant detected');
                    illegal_moves.push([en_passanter_1, en_passanter_1 + (this.isWhite? -8 : 8)]);
                }
                else
                {
                    checking.push(index);
                    traversed_moves.pop();
                }
                
                break;
            }

            if(_index === en_passanter_1 || _index === en_passanter_2)
            {
                continue;
            }

            if(hit)
            {
                if(_index !== this.getKing(is_white))
                {
                    pins.pop();
                }

                break;
            }

            // mark something as hit
            hit = true;
            
            pins.push([index, _index]);
        }
    
        return [traversed_moves, pins, checking, illegal_moves];
    }

    // Checks if the move to square is in bounds and doesn't teleport across the board
    moveExists(origin, dir)
    {
        const dirX = dir[0];
        const dirY = dir[1];
        const to = origin + dirX + dirY * 8;
        
        if(to < 0 || to > 63) return false;

        if(dirX !== 0 && dirY !== 0)
        {
            // simple, check if the offset rank matches the origin's plus the directions, aka where it fucking should me
            return to%8 === (origin%8) + dirX;
        }

        // if only vertical movement ends up in a different rank, not valid
        else if(dirY !== 0)
        {
            return origin%8 === (origin+dirY*8)%8;
        }

        // if only horizontal movement ends up in a different file, not valid
        else if(dirX !== 0)
        {
            return Math.floor(origin/8) === Math.floor((origin+dirX)/8);
        }
        
        return false;
    }

    // Careful with this, it'll return false if index is 0
    isCapturable(index, is_white)
    {
        if(this.bit_board[index] === 0) return false;
        return is_white !== this.isWhite(index);
    }

    isWhite(index)
    {
        return this.bit_board[index].toString().slice(2,3) === '1';
    }
    
    getValue(index)
    {
        const uuid = this.bit_board[index].toString();
        if(uuid.length < 4) return 0;
        return uuid.slice(-(Math.ceil(uuid.length/2)-1));
    }

    getKing(is_white)
    {
        return is_white? this.w_king : this.b_king;
    }
    
    // BEAUTIFIERS

    formatBoard()
    {
        let log = "\n┌ ─ ─ ─ ─ ─ ─ ─ ─ ┐\n| ";

        for (let i = 0; i < this.bit_board.length; i++)
        {
            if(i%8===0 && i !== 0)
            {
                log += '|\n| ';
            }

            const uuid = this.bit_board[i].toString();
            if(uuid !== '0')
            {
                const value = uuid.slice(-(Math.ceil(uuid.length/2)-1));
                log += this.isWhite(i)?this.PIECES_V2I[value].toUpperCase():this.PIECES_V2I[value];
                log += ' ';
            }
            else
            {
                log += '■ ';
            }
        }

        log += '|\n└ ─ ─ ─ ─ ─ ─ ─ ─ ┘';

        return log;
    }

    formatPiece(index)
    {
        const uuid = this.bit_board[index].toString();
        const rank = index%8;
        const file = Math.floor(index/8);
        const color = uuid.slice(-2, -1) === '0'? 'b' : 'w';

        return `${this.BOARD_POSITION_TABLE[7-rank]}${8-file} ${color} ${this.PIECES_FORMATTED[uuid.slice(-1)]}`;
    }

    // TODO: This needs to be finished, it isn't compatible with other games, cause it always specifies a piece (not pawn)
    formatMove(from, to)
    {
        let out = "";
        const label = this.bit_board[from] === 0? undefined : this.PIECES_V2I[this.getValue(from)];
        const from_rank = from%8;
        const from_file = Math.floor(from/8);
        const to_rank = to?to%8:from_rank;
        const to_file = to?Math.floor(to/8):from_file;

        if(label === undefined || label === 'p')
        {
            if(to && this.bit_board[to] !== 0)
            {
                out += `${this.BOARD_POSITION_TABLE[7-from_rank]}x${this.BOARD_POSITION_TABLE[7-to_rank]}${8-to_file}`;
            }
            else
            {
                out += `${this.BOARD_POSITION_TABLE[7-to_rank]}${8-to_file}`;
            }
        }
        else
        {
            const is_white = this.isWhite(from);

            if(to && this.bit_board[to] !== 0)
            {
                out += `${is_white?label.toUpperCase():label}${this.BOARD_POSITION_TABLE[7-from_rank]}${8-from_file}x${this.BOARD_POSITION_TABLE[7-to_rank]}${8-to_file}`;
            }
            else
            {
                out += `${is_white?label.toUpperCase():label}${this.BOARD_POSITION_TABLE[7-to_rank]}${8-to_file}`;
            }
        }

        return out;
    }
}

// module.exports = Board;