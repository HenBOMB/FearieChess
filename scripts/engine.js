//https://en.wikipedia.org/wiki/Forsyth–Edwards_Notation#:~:text=Forsyth–Edwards%20Notation%20(FEN),Scottish%20newspaper%20journalist%20David%20Forsyth
//https://www.chessprogramming.org/Move_Generation
//https://www.chessprogramming.org/Board_Representation

class Engine
{
    /*
    https://stackoverflow.com/questions/1110439/chess-optimizations
    https://chess.stackexchange.com/questions/18419/why-doesnt-my-transposition-table-improve-my-move-calculation-time/18423
    https://www.chessprogramming.org/Optimization
    https://www.chessprogramming.org/Avoiding_Branches
    https://www.chessprogramming.org/0x88
    https://www.chessprogramming.org/Alpha-Beta
    https://www.chessprogramming.org/Quiescence_Search
    https://www.chessprogramming.org/Move_Generation#Special_Generators
    https://www.chessprogramming.org/Delta_Pruning

    THIS!!!: https://stackoverflow.com/questions/17510606/quiscence-search-performance
    */

    //#region Initialization

    constructor(fen)
    {
        this.BOARD_POSITION_TABLE = [
            "a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8",
            "a7", "b7", "c7", "d7", "e7", "f7", "g7", "h7",
            "a6", "b6", "c6", "d6", "e6", "f6", "g6", "h6",
            "a5", "b5", "c5", "d5", "e5", "f5", "g5", "h5",
            "a4", "b4", "c4", "d4", "e4", "f4", "g4", "h4",
            "a3", "b3", "c3", "d3", "e3", "f3", "g3", "h3",
            "a2", "b2", "c2", "d2", "e2", "f2", "g2", "h2",
            "a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1"
        ];
        this.PIECES_CONFIG = [];
        this.PIECES_L2I = {}; // label to ?
        this.PIECES_I2L = {}; // ? to label
        this.FLAGS_KING_CASTLE = 2;
        this.FLAGS_QUEEN_CASTLE = 3;
        this.FLAGS_CAPTURE = 4;
        this.FLAGS_EP_CAPTURE = 5;

        this.fen = fen === undefined? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' : fen;
        this.player = 2; // (0-2) white, black, both
        this.bit_board = new Int16Array(64);
        this.white2move = true;
        this.w_king = 0;
        this.b_king = 0;
        this.castling = 0;
        this.en_passant = null;
        this.threefold_draw = [];
        this.halfmoves = 0; 
        this.fullmoves = 1; 
        this.piece_count = 0;
        this.moves_table = [];
        this.pgn = "";
    }
    
    initialize()
    {
        return new Promise(resolve => {
            fetch(`${document.URL}api/configs`, {headers:{'authentication':'secret'}})
            .then(res => res.json())
            .then(data => {
                let configs = data.configs;

                for (let i = 0; i < configs.length; i++)
                {
                    const config = configs[i];
                    config.name = config.name.slice(0,-3);
                    this.PIECES_CONFIG.push(config);
                    this.PIECES_L2I[config.initials] = i;
                    this.PIECES_I2L[i] = config.initials;
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
                    char_set = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'.split(' ');  
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

        let index = 0;

        for (let i = 0; i < char_set[0].length; i++)
        {
            let char = char_set[0][i];
            
            if(char === '/') 
            {
                continue;
            }

            const digit = parseInt(char);

            if(digit)
            {
                for (let j = 0; j < digit; j++) this.bit_board[++index] = 0;
                continue;
            }

            // CUSTOM::FAERIE -> New character to parse in FEN
            if(char === '!') char = char_set[0][++i]+char_set[0][++i];

            this.bit_board[index] = `${char===char.toUpperCase()?2:1}${this.PIECES_L2I[char.toLowerCase()]}`;
            this.piece_count++;

            if(char === 'k') this.b_king = index;
            else if(char === 'K') this.w_king = index;

            index++;
        }

        this.white2move = char_set[1] === 'w';
        if(char_set[2] !== '-')
        {
            this.castling ^= char_set[2].includes('K')?8:0;
            this.castling ^= char_set[2].includes('Q')?4:0;
            this.castling ^= char_set[2].includes('k')?2:0;
            this.castling ^= char_set[2].includes('q')?1:0;
        }

        this.en_passant = char_set[3] === '-'? null : this.BOARD_POSITION_TABLE.indexOf(char_set[3]);
        if(this.en_passant)
        {
            if(this.en_passant < 24) this.en_passant += 8;
            else this.en_passant -= 8;
        }
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
                // CUSTOM::FAERIE -> New character to generate FEN
                const piece = this.PIECES_I2L[this.getValue(i)];
                fen += `${piece.length>1?'!':''}${this.isWhite(i)? piece.toUpperCase() : piece}`;
                cnt = 0;
            }

            if((i+1)%8 == 0)
            {
                fen += '/';
                cnt = 0;
            }
        }

        fen += ` ${this.white2move? 'w' : 'b'}`;
        const castling = `${!!(this.castling&8)?'K':''}${!!(this.castling&4)?'Q':''}${!!(this.castling&2)?'k':''}${!!(this.castling&1)?'q':''}`;
        fen += ` ${castling===''?'-':castling}`;
        fen += ` ${this.en_passant?this.BOARD_POSITION_TABLE[this.en_passant+(this.isWhite(this.en_passant)?8:-8)]:'-'}`;
        fen += ` ${this.halfmoves} ${this.fullmoves}`;

        return fen;
    }

    //#endregion

    //#region Move Generation

    // In Pseudo-legal move generation pieces obey their normal rules of movement, but they're not checked beforehand to see if they'll leave the king in check. 
    // It is left up to the move-making function to test the move, or it is even possible to let the king remain in check and only test for the capture of the king on the next move.
    pseudoLegalMoves(index)
    {
        // CUSTOM::FAERIE -> Herald doesn't let pieces move
        if(this.isPieceAdjacent(index, 'h'))
        {
            return [];
        }

        const is_white = this.isWhite(index);

        // CUSTOM::FAERIE -> Inquisitor doesn't let enemy pieces move
        if(this.isEnemyPieceAdjacent(index, is_white, 'i'))
        {
            return [];
        }

        const moves = [];
        const value = this.getValue(index);
        const config = this.PIECES_CONFIG[value];
        const label = this.PIECES_I2L[value];

        // capture_mode = 0/1/2 -> 0: always capture, 1: just capture, 2: never capture
        const parsePattern = (pattern, repeat, capture_mode = 0, flags = 0) => {
            let _index = index;

            for (let _ = 0; _ < repeat; _++)
            {
                if(!this.isValidMove(_index, [pattern[0]*(is_white?1:-1), pattern[1]*(is_white?1:-1)]))
                {
                    break;
                }

                _index += (pattern[0] + pattern[1] * 8) * (is_white?1:-1);
               
                // CUSTOM::FAERIE -> Jester cannot be captured
                if(this.getLabel(_index) === 'j')
                {
                    break;
                }

                if(!this.bit_board[_index])
                {
                    if(capture_mode === 1)
                    {
                        break;
                    }

                    // CUSTOM::FAERIE -> Peasant promotion
                    // Promotion
                    if((label === 'p' || label === 'pe') && ((!is_white && (index>>3) === 6) || (is_white && (index>>3) === 1)))
                    {
                        for (let i = 0; i < this.PIECES_CONFIG.length; i++)
                        {
                            if(!this.PIECES_CONFIG[i].promotable) continue;
                            moves.push(new Move(index, _index, 0, i + 1));
                        }
                    }
                    else
                    {
                        moves.push(new Move(index, _index, flags));
                    }

                    continue;
                }

                if(this.isCapturable(_index, is_white) && capture_mode !== 2)
                {
                    // CUSTOM::FAERIE -> Thief, cannot capture piece if it cannot move behind that square afterwards.
                    if(label === 'th')
                    {
                        if(this.bit_board[_index - (pattern[0] / 3 + pattern[1] / 3 * 8) * (is_white?1:-1)] !== 0) break;
                        moves.push(new Move(index, _index, this.FLAGS_CAPTURE));
                    }
                    // CUSTOM::FAERIE -> Inquisitor, Herald and Jester cannot capture
                    else if(label === 'i' || label === 'h' || label === 'j')
                    {
                        break;
                    }
                    // CUSTOM::FAERIE -> Peasant promotion
                    // Promotion
                    else if((label === 'p' || label === 'pe') && ((!is_white && (index>>3) === 6) || (is_white && (index>>3) === 1)))
                    {
                        for (let i = 0; i < this.PIECES_CONFIG.length; i++)
                        {
                            if(!this.PIECES_CONFIG[i].promotable) continue;
                            moves.push(new Move(index, _index, this.FLAGS_CAPTURE, i + 1));
                        }
                    }
                    else
                    {
                        moves.push(new Move(index, _index, this.FLAGS_CAPTURE));
                    }
                }

                break;
            }
        };

        // CUSTOM::FAERIE -> Peasant equal to pawn
        // Pawn movement
        if(label === 'p' || label === 'pe')
        {
            // Capture pattern
            if(label === 'p' && this.en_passant !== null)
            {
                if((index + 1 === this.en_passant && this.isValidMove(index, [1,0])))
                {
                    moves.push(new Move(index, this.en_passant + (is_white?-8:8), this.FLAGS_EP_CAPTURE));
                }
                else if((index - 1 === this.en_passant && this.isValidMove(index, [-1,0])))
                {
                    moves.push(new Move(index, this.en_passant + (is_white?-8:8), this.FLAGS_EP_CAPTURE));
                }
            }   

            if(label === 'p')
            {
                parsePattern([1, -1], 1, 1);
                parsePattern([-1, -1], 1, 1);
            }
            else
            {
                parsePattern([0, 1], 1, 1);
            }

            // Move pattern
            if((is_white && (index>>3) === 6) || (!is_white && (index>>3) === 1))
            {
                if(label === 'p')
                {
                    parsePattern([0,-1], 2, 2);
                }
                else
                {
                    parsePattern([1, -1], 2, 2);
                    parsePattern([-1, -1], 2, 2);
                }
            }
            else
            {
                if(label === 'p')
                {
                    parsePattern([0,-1], 1, 2);
                }
                else
                {
                    parsePattern([1, -1], 1, 2);
                    parsePattern([-1, -1], 1, 2);
                }
            }
        }
        else
        {
            // Custom capture pattern
            if(config.capture_patterns)
            {
                for (let i = 0; i < config.capture_patterns.length; i++)
                {
                    for (let j = 0; j < config.capture_patterns[i].values.length; j++)
                    {
                        parsePattern(config.capture_patterns[i].values[j], config.capture_patterns[i].repeat, 1);
                    }
                }
            }

            // Move pattern
            for (let i = 0; i < config.patterns.length; i++)
            {
                for (let j = 0; j < config.patterns[i].values.length; j++)
                {
                    parsePattern(config.patterns[i].values[j], config.patterns[i].repeat, config.capture_patterns? 2 : 0);
                }
            }
        }

        if(label === 'k')
        {
            const protectedMoves = this.allProtectedSquares(!is_white);

            if(protectedMoves[1])
            {
                return moves.filter(move => !protectedMoves[0].includes(move.getTo()));
            }

            if(is_white)
            {
                if(!!(this.castling&8))// && this.bit_board[63] !== 0 && this.PIECES_I2L[this.getValue(63)] === 'r')
                {
                    if(this.bit_board[62] === 0 && this.bit_board[61] === 0 && !protectedMoves[0].includes(62) && !protectedMoves[0].includes(61))
                    {
                        parsePattern([2,0], 1, 0, this.FLAGS_KING_CASTLE);
                    }
                }

                if(!!(this.castling&4))// && this.bit_board[56] !== 0 && this.PIECES_I2L[this.getValue(56)] === 'r')
                {
                    if(this.bit_board[59] === 0 && this.bit_board[58] === 0 && this.bit_board[57] === 0 && !protectedMoves[0].includes(59) && !protectedMoves[0].includes(58))
                    {
                        parsePattern([-2,0], 1, 0, this.FLAGS_QUEEN_CASTLE);
                    }
                }
            }
            else
            {
                if(!!(this.castling&1))// && this.bit_board[0] !== 0 && this.PIECES_I2L[this.getValue(0)] === 'r')
                {
                    if(this.bit_board[1] === 0 && this.bit_board[2] === 0 && this.bit_board[3] === 0 && !protectedMoves[0].includes(2) && !protectedMoves[0].includes(3))
                    {
                        parsePattern([2,0], 1, 0, this.FLAGS_QUEEN_CASTLE);
                    }
                }

                if(!!(this.castling&2))// && this.bit_board[7] !== 0 && this.PIECES_I2L[this.getValue(7)] === 'r')
                {
                    if(this.bit_board[5] === 0 && this.bit_board[6] === 0 && !protectedMoves[0].includes(5) && !protectedMoves[0].includes(6))
                    {
                        parsePattern([-2,0], 1, 0, this.FLAGS_KING_CASTLE);
                    }
                }
            }

            return moves.filter(move => !protectedMoves[0].includes(move.getTo()));
        }

        return moves;
    }

    // NOTE: Used by the renderer
    veryLegalMoves(index)
    {
        if(this.bit_board[index] === 0) return [];

        const check_data = this.isInCheck();

        if(check_data[0] !== 0 && this.w_king !== index && this.b_king !== index)
        {
            const moves = check_data[3][index];
            return moves? moves : [];
        }

        return this.legalMoves(index);
    }

    legalMoves(index)
    {
        if(this.bit_board[index] === 0) return [];

        let pseudo_legal_moves = this.pseudoLegalMoves(index);
        
        if(index === this.w_king || index === this.b_king) return pseudo_legal_moves;

        const is_white = this.isWhite(index);

        for (let i = 0; i < 64; i++)
        {
            if(this.bit_board[i] === 0) continue;
            if(this.isWhite(i) === is_white) continue;
            
            // [traversed, [[pinner, pinned piece]], checking, [[illegal_moves]]]
            const ray_data = this.kingCast(i, is_white);
            
            if(ray_data.length === 0) continue;

            // Any illegal moves?
            if(ray_data[3].length > 0)
            {
                for (let j = 0; j < ray_data[3].length; j++)
                {
                    // The first index is a piece index, the second an illegal move 
                    if(ray_data[3][j][0] !== index) continue;
                    return pseudo_legal_moves.filter(move => move.getTo() === ray_data[3][j][1]);
                }
            }

            // stop pinned pieces from moving
            // if pinned by two pieces
            if(ray_data[1].length > 1)
            {
                pseudo_legal_moves = [];
                throw "no piece can be pinned by two pieces lol";
            }
            // if pinned by
            if(ray_data[1].length === 1 && ray_data[1][0].includes(index))
            {
                return pseudo_legal_moves.filter(move => 
                    // if it can move in the direction of the pin, allow
                    ray_data[0].includes(move.getTo()) ||
                    // if it can capture, allow
                    ray_data[1][0].includes(move.getTo()));
            }
        }

        return pseudo_legal_moves;
    }

    // Returns all the squares a piece can go to, regardless if legal / illegal, stops at collision, includes protected pieces
    // Also returns the checked king index (if any)
    // Returns an array [positions, piece indexes that check the enemy king]
    protectedSquares(index)
    {
        if(this.bit_board[index] === 0) return [];

        const positions = [];
        const value = this.getValue(index);
        const is_white = this.isWhite(index);
        const config = this.PIECES_CONFIG[value];

        const parsePattern = (pattern, repeat) => {
            let _index = index;

            for (let _ = 0; _ < repeat; _++)
            {
                if(!this.isValidMove(_index, [pattern[0]*(is_white?1:-1), pattern[1]*(is_white?1:-1)]))
                {
                    break;
                }

                _index += (pattern[0] + pattern[1] * 8) * (is_white?1:-1);

                if(this.bit_board[_index] === 0)
                {
                    positions.push(_index);
                    continue;
                }

                if(this.isCapturable(_index, is_white))
                {
                    if(_index === this.w_king || _index === this.b_king)
                    {
                        positions.push(_index);
                        continue;
                    }
                    break;
                }

                // If not capturable, then protect the ally piece
                positions.push(_index);
                break;
            }
        };

        const pattern = config.capture_patterns? config.capture_patterns : config.patterns;

        for (let i = 0; i < pattern.length; i++)
        {
            for (let j = 0; j < pattern[i].values.length; j++)
            {
                parsePattern(pattern[i].values[j], pattern[i].repeat);
            }
        }

        return positions;
    }

    allProtectedSquares(is_white)
    {
        const positions = [];
        let in_check = false;

        for (let i = 0; i < 64; i++)
        {
            if(this.bit_board[i] === 0) continue;
            if(is_white !== this.isWhite(i)) continue;

            const protected_moves = this.protectedSquares(i);

            protected_moves.forEach(move => {
                if(!positions.includes(move)) positions.push(move);
            });

            if(protected_moves.includes(is_white? this.b_king : this.w_king)) in_check = true;
        }

        return [positions, in_check];
    }

    // Casts a ray from an index to a king, using the piece's capture pattern or default movement
    // It returns the pinned pieces, what pieces are checking the king and the traversed squares
    // [traversed, [[pinner, pinned piece]], checking, [[illegal_moves]]]
    kingCast(index, is_white)
    {
        if(this.bit_board[index] === 0) return [];
        if(index === this.w_king || index === this.b_king) return [];

        // looping through all the enemy pieces and then ->
        // getting the direction of attack and seeing if the king is behind the first attacked piece
        // ps: maybe rewrite that

        const king_index = is_white? this.w_king : this.b_king;
        const config = this.PIECES_CONFIG[this.getValue(index)];
        
        const _ = config.patterns[0].values[0][0]**2 - config.patterns[0].values[0][1]**2;

        // knight type movement
        if(_ > 1 || _ < -1)
        {
            if(this.pseudoLegalMoves(index).some(move => move.getTo() === king_index))
            {
                return [[],[],index,[]];
            }
            else
            {
                return [];
            }
        }
        
        const dir_pattern = [(king_index%8)-(index%8),(king_index>>3)-(index>>3)];
        let repeat = null;
        dir_pattern[0] = dir_pattern[0] === 0? 0 : dir_pattern[0] < 0? -1 : 1;
        dir_pattern[1] = dir_pattern[1] === 0? 0 : dir_pattern[1] < 0? -1 : 1;

        // if the piece has a custom capture pattern and it doesn't match the direction pattern required, ignore
        // or if the repeat is 1
        // or if the default pattern is not part of the ray direction
        
        if(config.capture_patterns)
        {
            for (let i = 0; i < config.capture_patterns.length; i++)
            {
                const inverse = is_white? -1 : 1;
                
                const _filter = config.capture_patterns[i].values.filter(pattern => 
                    dir_pattern[0] === pattern[0] * inverse && 
                    dir_pattern[1] === pattern[1] * inverse);

                if(_filter.length === 0)
                {
                    continue;
                }
                else
                {
                    repeat = config.capture_patterns[i].repeat;
                    dir_pattern[0] = _filter[0][0] * inverse;
                    dir_pattern[1] = _filter[0][1] * inverse;
                    break;
                }
            }
        }
        else
        {
            for (let i = 0; i < config.patterns.length; i++)
            {
                if(config.patterns[i].values.some(pattern => pattern[0] === dir_pattern[0] && pattern[1] === dir_pattern[1]))
                {
                    repeat = config.patterns[i].repeat;
                }
            }
        }

        if(!repeat)
        {
            return [];
        }

        // if is diagonal attack, then the rank and file distance to the origin must be equal (must be a square between the two pieces)
        if(dir_pattern[0] !== 0 && dir_pattern[1] !== 0)
        {
            if(((index%8)-(king_index%8))**2 !== ((index>>3)-(king_index>>3))**2)
            {
                return [];
            }
        }
        
        const pins = [];
        const checking = [];
        const traversed_moves = [];
        const illegal_moves = [];
        let _index = index;
        let hit = false;
        let is_en_passant = false;
        let count_en_passant = 0;
        let en_passanter;
        let en_passanter_2;

        for (let _ = 0; _ < repeat; _++)
        {
            if(!this.isValidMove(_index, dir_pattern))
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
                en_passanter = 
                    (this.isValidMove(_index, [dir_pattern[0],0]) && 
                    this.isWhite(_index + dir_pattern[0]) !== is_white && 
                    this.PIECES_I2L[this.getValue(_index + dir_pattern[0])] === 'p')? _index + dir_pattern[0]: undefined;
                
                is_en_passant = en_passanter !== undefined;
                hit = false;

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

                    // console.log('Illegal en passant detected');
                    illegal_moves.push([en_passanter, en_passanter + (is_white? -8 : 8)]);
                }
                else
                {
                    checking.push(index);
                    traversed_moves.pop();
                }
                
                break;
            }

            if(_index === en_passanter || _index === en_passanter_2)
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
            
            if(_ !== repeat - 1) pins.push([index, _index]);
        }

        return [traversed_moves, pins, checking, illegal_moves];
    }

    // Uses less variables
    kingCastSimple(index, is_white)
    {
        if(this.bit_board[index] === 0) return [];
        if(index === this.w_king || index === this.b_king) return [];

        const king_index = is_white? this.w_king : this.b_king;
        const config = this.PIECES_CONFIG[this.getValue(index)];
        
        const _ = config.patterns[0].values[0][0]**2 - config.patterns[0].values[0][1]**2;

        if(_ > 1 || _ < -1)
        {
            if(this.pseudoLegalMoves(index).some(move => move.getTo() === king_index))
            {
                return [[],[],index,[]];
            }
            else
            {
                return [];
            }
        }
        
        const dir_pattern = [(king_index%8)-(index%8),(king_index>>3)-(index>>3)];
        let repeat = null;
        dir_pattern[0] = dir_pattern[0] === 0? 0 : dir_pattern[0] < 0? -1 : 1;
        dir_pattern[1] = dir_pattern[1] === 0? 0 : dir_pattern[1] < 0? -1 : 1;

        if(config.capture_patterns)
        {
            for (let i = 0; i < config.capture_patterns.length; i++)
            {
                const inverse = is_white? -1 : 1;
                
                const _filter = config.capture_patterns[i].values.filter(pattern => 
                    dir_pattern[0] === pattern[0] * inverse && 
                    dir_pattern[1] === pattern[1] * inverse);

                if(_filter.length === 0)
                {
                    continue;
                }
                else
                {
                    repeat = config.capture_patterns[i].repeat;
                    dir_pattern[0] = _filter[0][0] * inverse;
                    dir_pattern[1] = _filter[0][1] * inverse;
                    break;
                }
            }
        }
        else
        {
            for (let i = 0; i < config.patterns.length; i++)
            {
                if(config.patterns[i].values.some(pattern => pattern[0] === dir_pattern[0] && pattern[1] === dir_pattern[1]))
                {
                    repeat = config.patterns[i].repeat;
                }
            }
        }

        if(!repeat)
        {
            return [];
        }

        if(dir_pattern[0] !== 0 && dir_pattern[1] !== 0)
        {
            if(((index%8)-(king_index%8))**2 !== ((index>>3)-(king_index>>3))**2)
            {
                return [];
            }
        }
        
        const pins = [];
        const traversed_moves = [];
        const illegal_moves = [];
        let checking = false;
        let _index = index;
        let hit = false;

        for (let _ = 0; _ < repeat; _++)
        {
            if(!this.isValidMove(_index, dir_pattern))
            {
                break;
            }
                
            _index += dir_pattern[0] + dir_pattern[1] * 8;
            traversed_moves.push(_index);

            if(this.bit_board[_index] === 0)
            {
                continue;
            }

            if(this.isCapturable(_index, is_white))
            {
                if(hit)
                {
                    pins.pop();
                }

                break;
            }

            if(_index === this.getKing(is_white) && !hit)
            {
                checking = true;
                traversed_moves.pop();
                
                break;
            }

            if(hit)
            {
                if(_index !== this.getKing(is_white))
                {
                    pins.pop();
                }

                break;
            }

            hit = true;
            
            if(_ !== repeat - 1) pins.push([index, _index]);
        }

        return [traversed_moves, pins, checking, illegal_moves];
    }

    //#endregion

    //#region Move Making

    makeMove(move)
    {
        const from = move.getFrom();
        const to = move.getTo();
        const flags = move.getFlags();
        const undo = [move, this.castling, this.halfmoves, this.en_passant];
        
        this.white2move = !this.white2move;
        this.halfmoves++;
        this.threefold_draw.push(this.logMove(move));

        if(this.white2move)
        {
            this.fullmoves++;
        }

        switch(flags)
        {
            case this.FLAGS_CAPTURE:
                undo.push(this.bit_board[to]);
                this.piece_count--;

                if(this.getLabel(to) === 'r')
                {
                    if(to === 63 && this.castling & 8) this.castling ^= 8;
                    else if(to === 56 && this.castling & 4) this.castling ^= 4;
                    else if(!to && this.castling & 1) this.castling ^= 1;
                    else if(to === 7 && this.castling & 2) this.castling ^= 2;
                }

                break;

            case this.FLAGS_EP_CAPTURE:
                this.bit_board[this.en_passant] = 0;
                this.piece_count--;
                break;

            case this.FLAGS_KING_CASTLE:
                if(this.white2move)
                {
                    this.castling ^= 3; // 8 ^ 4
                    this.b_king = to;
    
                    this.bit_board[5] = this.bit_board[7];
                    this.bit_board[7] = 0;
                }
                else
                {
                    this.castling ^= 0xC; // 12 =  2 ^ 1
                    this.w_king = to;
    
                    this.bit_board[61] = this.bit_board[63];
                    this.bit_board[63] = 0;
                }
                break;

            case this.FLAGS_QUEEN_CASTLE:
                if(this.white2move)
                {
                    this.castling ^= 3; // 8 ^ 4
                    this.b_king = to;

                    this.bit_board[3] = this.bit_board[0];
                    this.bit_board[0] = 0;
                }
                else
                {
                    this.castling ^= 0xC; // 12 =  2 ^ 1
                    this.w_king = to;

                    this.bit_board[59] = this.bit_board[56];
                    this.bit_board[56] = 0;
                }
                break;
        }

        this.en_passant = null;
        const label = this.getLabel(from);

        if(label === 'p')
        {
            this.halfmoves = 0;

            if(flags === 0)
            {
                if(((from - to) / 8) ** 2 === 4 && 
                ((this.bit_board[to + 1] !== 0 && this.isWhite(to + 1) === this.white2move && this.isValidMove(to, [1, 0]) && this.getLabel(to + 1) === 'p') || 
                (this.bit_board[to - 1] !== 0 && this.isWhite(to - 1) === this.white2move && this.isValidMove(to, [-1, 0]) && this.getLabel(to - 1) === 'p')))
                {
                    if((this.bit_board[to + 1] !== 0 && this.isValidMove(to, [1,0])) || this.bit_board[to - 1] !== 0 && this.isValidMove(to, [-1,0]))
                    {
                        this.en_passant = to;
                    }
                }
            }
        }
        else if(label === 'k')
        {
            if(this.white2move)
            {
                this.b_king = to;
                if(this.castling & 2) this.castling ^= 2;
                if(this.castling & 1) this.castling ^= 1;
            }
            else
            {
                this.w_king = to;
                if(this.castling & 4) this.castling ^= 4;
                if(this.castling & 8) this.castling ^= 8;
            }
        }
        else if(label === 'r')
        {
            if(from === 63 && this.castling & 8) this.castling ^= 8;
            else if(from === 56 && this.castling & 4) this.castling ^= 4;
            else if(!from && this.castling & 1) this.castling ^= 1;
            else if(from === 7 && this.castling & 2) this.castling ^= 2;
        }

        // TODO:FINISH This pgn is missing specific piece capture
        // Doesn't support promotion and check

        this.pgn += `${!this.white2move? ` ${this.fullmoves}.` : ""} `;

        if(label === 'p')
        {
            if(flags == this.FLAGS_CAPTURE)
            {
                this.pgn += `${this.BOARD_POSITION_TABLE[from&7].slice(0,1)}x${this.BOARD_POSITION_TABLE[to]}`;
            }
            else
            {
                this.pgn += `${this.BOARD_POSITION_TABLE[to]}`;
            }
        }
        else
        {
            if (flags == this.FLAGS_CAPTURE || flags == this.FLAGS_EP_CAPTURE)
            {
                this.pgn += `${label.toUpperCase()}x${this.BOARD_POSITION_TABLE[to]}`;
            }
            else if(flags == this.FLAGS_KING_CASTLE)
            {
                this.pgn += `O-O`;
            }
            else if(flags == this.FLAGS_QUEEN_CASTLE)
            {
                this.pgn += `O-O-O`;
            }
            else
            {
                this.pgn += `${label.toUpperCase()}${this.BOARD_POSITION_TABLE[to]}`;
            }
        }

        this.pgn = this.pgn.trim();

        if(move.getPromotion())
        {
            undo.push(this.bit_board[from]);
            this.bit_board[to] = `${!this.white2move?2:1}${move.getPromotion()-1}`;
        }
        else
        {
            // CUSTOM::FAERIE -> Make sure the thief doesn't move to the square to capture
            if(label === 'th' && flags === this.FLAGS_CAPTURE)
            {
                this.bit_board[to] = 0;
                this.bit_board[to - (to - from) / 3] = this.bit_board[from];
            }
            else
            {
                this.bit_board[to] = this.bit_board[from];
            }
        }

        this.bit_board[from] = 0;

        return undo;
    }

    // undoMove(undo)
    // {
    //     const to = undo[0].getTo();
    //     const from = undo[0].getFrom();
    //     const flags = undo[0].getFlags();

    //     this.white2move = this.isWhite(to);

    //     if(!this.white2move)
    //     {
    //         this.fullmoves--;
    //     }

    //     this.threefold_draw.pop();
    //     this.castling = undo[1];
    //     this.halfmoves = undo[2];
    //     this.en_passant = undo[3];
    //     this.w_king = this.getLabel(to) === 'k' && this.white2move? from : this.w_king;
    //     this.b_king = this.getLabel(to) === 'k' && !this.white2move? from : this.b_king;

    //     this.bit_board[from] = this.bit_board[to];
    //     this.bit_board[to] = 0;

    //     if(flags === this.FLAGS_CAPTURE)
    //     {
    //         this.piece_count++;
    //         this.bit_board[to] = undo[4];

    //         // CUSTOM::FAERIE -> Undo the thief's capture
    //         if(this.getLabel(to) === 'th') this.bit_board[to - (to - from) / 3] = 0;
    //     }
    //     else if(flags === this.FLAGS_EP_CAPTURE)
    //     {
    //         this.piece_count++;
    //         this.bit_board[this.en_passant] = `${this.white2move?1:2}${this.PIECES_L2I.p}`;
    //     }

    //     if(undo[0].getPromotion())
    //     {
    //         this.bit_board[from] = undo[undo.length-1];
    //     }

    //     switch(flags)
    //     {
    //         case this.FLAGS_KING_CASTLE:
    //             if(this.white2move)
    //             {
    //                 this.bit_board[63] = this.bit_board[61];
    //                 this.bit_board[61] = 0;
    //             }
    //             else
    //             {
    //                 this.bit_board[7] = this.bit_board[5];
    //                 this.bit_board[5] = 0;
    //             }
    //             break;

    //         case this.FLAGS_QUEEN_CASTLE:
    //             if(this.white2move)
    //             {
    //                 this.bit_board[56] = this.bit_board[59];
    //                 this.bit_board[59] = 0;
    //             }
    //             else
    //             {
    //                 this.bit_board[0] = this.bit_board[3];
    //                 this.bit_board[3] = 0;
    //             }
    //             break;
    //     }
    // }

    //#endregion

    //#region Evaluators

    // Doesn't rely on 64 range loops, very fast
    isThreefoldDraw()
    {
        const len = this.threefold_draw.length;

        if(len > 1 && this.threefold_draw[len-1][0].toLowerCase() !== this.threefold_draw[len-2][0].toLowerCase())
        {
            this.threefold_draw = [];
        }
        else if(len > 10)
        {
            const found = [];
    
            for (let i = 0; i < len; i++)
            {
                const l = this.threefold_draw.filter(v => v === this.threefold_draw[i]).length;
                found.push(Math.min(l, 3));
            }
    
            const count_3 = found.filter(x => x === 3).length;
            const count_2 = found.filter(x => x === 2).length;

            if(count_2 === 2 && found.length === count_2 + count_3)
            {
                return true;
            }
        }

        return false;
    }

    isDraw(score = 0)
    {
        if(score > 30 || score < -30)
        {
            return false;
        }

        else if(this.halfmoves === 100)
        {
            return true;
        }
        // Both Sides have a bare King
        else if(this.piece_count === 2)
        {
            return true;
        }
        // If one side has a king and a minor piece against a bare king
        else if(this.piece_count === 3 && score > 3 && score < -3)
        {
            return true;
        }
        // Both Sides have a King and a Bishop, the Bishops being the same Color
        else if(this.piece_count === 4 && score < 5 && score > -5)
        {
            let bishop = -1;

            for (let i = 0; i < 64; i++)
            {
                if(this.bit_board[i] === 0) continue;
                if(this.w_king === i || this.b_king === i) continue;
                if(this.getLabel(i) !== 'b') break;

                if(bishop !== -1)
                {
                    if(this.isWhiteSquare(bishop) === this.isWhiteSquare(i))
                    {
                        return true;
                    }
                    else
                    {
                        break;
                    }
                }

                bishop = i;
            }
        }

        return this.isThreefoldDraw();
    }

    isStalemate()
    {
        for (let i = 0; i < 64; i++)
        {
            if(this.bit_board[i] === 0) continue;
            if(this.isWhite(i) !== this.white2move) continue;

            if(this.legalMoves(i).length > 0)
            {
                return false;
            }
        }

        return true;
    }

    // Returns: [0/1/2,[traversed],[checkers],{legal moves}]
    // return_type = 0: everything, 1: bool, 2: 0/1/2 
    isInCheck(return_type = 0)
    {
        /*
            0: isInCheck = 0/1, isMate = 2
            1: protected squares / traversed squares
            2: pieces that are checking
            3: illegal moves for specific pieces
        */
        const check_data = [0,[],[],{}];

        for (let i = 0; i < 64; i++)
        {
            if(this.bit_board[i] === 0) continue;
            if(this.isWhite(i) === this.white2move) continue;

            // ally color pieces

            const rayInfo = this.kingCastSimple(i, this.white2move);

            if(rayInfo.length === 0) continue;

            if(rayInfo[2])
            {
                if(return_type === 1) return true;

                rayInfo[0].forEach(move => {
                    if(!check_data[1].includes(move)) check_data[1].push(move);
                });

                if(!check_data[2].includes(i)) check_data[2].push(i);
            }
        }

        if(return_type === 1) return check_data[2].length === 1 || check_data[2].length > 1;

        // Check
        if(check_data[2].length === 1)
        {
            for (let i = 0; i < 64; i++)
            {
                if(this.bit_board[i] === 0) continue;
                if(this.isWhite(i) !== this.white2move) continue;

                const l_moves = this.legalMoves(i);

                if(i === this.b_king || i === this.w_king)
                {
                    check_data[3][i] = l_moves;
                }
                else
                {
                    check_data[3][i] = l_moves.filter(move => check_data[1].includes(move.getTo()) || move.getTo() === check_data[2][0]);
                }

                if(check_data[3][i].length === 0)
                {
                    delete check_data[3][i];
                }
            }

            check_data[0] = !Object.keys(check_data[3]).some(key => check_data[3][key] !== 0)? 2 : 1;
        }
        // Double check
        else if(check_data[2].length > 1)
        {
            const legal_moves = this.legalMoves(this.white2move? this.w_king : this.b_king);

            if(legal_moves.length === 0)
            {
                check_data[0] = 2;
            }
            else
            {
                check_data[3][this.white2move? this.w_king : this.b_king] = legal_moves;
                check_data[0] = 1;
            }
        }

        return return_type === 2? check_data[0] : check_data;
    }

    // Checks if the move to square is in bounds and doesn't teleport across the board
    isValidMove(origin, dir)
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
            return (origin>>3) === ((origin+dirX)>>3);
        }
        
        return false;
    }

    // Careful with this, it'll return false if index value is 0
    isCapturable(index, is_white)
    {
        if(this.bit_board[index] === 0) return false;
        return is_white !== this.isWhite(index);
    }

    isWhite(index)
    {
        return this.bit_board[index].toString()[0] === '2';
    }

    isWhiteSquare(index)
    {
        return !!((((index>>3)%2)+(index%2))^1);
    }

    isPieceAdjacent(index, ...label)
    {
        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
        for (let i = 0; i < dirs.length; i++)
        {
            if(!this.isValidMove(index, dirs[i])) continue;
            if(this.getLabel(index + dirs[i][0] + dirs[i][1] * 8) === label) return true;
        }
    }

    isEnemyPieceAdjacent(index, is_white, label)
    {
        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
        for (let i = 0; i < 8; i++)
        {
            if(!this.isValidMove(index, dirs[i])) continue;
            if(is_white === this.isWhite(index + dirs[i][0] + dirs[i][1] * 8)) continue;
            if(this.getLabel(index + dirs[i][0] + dirs[i][1] * 8) === label) return true;
        }

        return false;
    }

    getValue(index)
    {
        return this.bit_board[index] === 0? -1 : parseInt(this.bit_board[index].toString().slice(1));
    }

    getLabel(index)
    {
        const v = this.getValue(index);
        return v < 0? '' : this.PIECES_I2L[v];
    }

    getKing(is_white)
    {
        return is_white? this.w_king : this.b_king;
    }

    //#endregion
    
    //#region Beautifiers

    formatBoard()
    {
        let log = "\n┌ ─ ─ ─ ─ ─ ─ ─ ─ ┐\n| ";

        for (let i = 0; i < 64; i++)
        {
            if(!((i%8)^0) && i^0)
            {
                log += '|\n| ';
            }

            if(this.bit_board[i] === 0 || this.bit_board[i] === undefined)
            {
                log += '■ ';
                continue;
            }

            const value = this.getValue(i);
            log += this.isWhite(i)?this.PIECES_I2L[value].toUpperCase():this.PIECES_I2L[value];
            log += ' ';
        }

        log += '|\n└ ─ ─ ─ ─ ─ ─ ─ ─ ┘';

        return log;
    }

    logMove(move)
    {
        let label = this.getLabel(move.getFrom());
        label = label === 'p'? '' : label;
        
        let text = `${this.isWhite(move.getFrom())? label.toUpperCase() : label}${label === 'k'?'':this.BOARD_POSITION_TABLE[move.getFrom()]}`;
        text += this.bit_board[move.getTo()] !== 0? 'x' : ' -> ';

        if(move.getPromotion())
        {
            text += '+' + (this.isWhite(move.getFrom())? this.PIECES_I2L[move.getPromotion() - 1].toUpperCase() : this.PIECES_I2L[move.getPromotion() - 1]);
        }
        else
        {
            text += this.BOARD_POSITION_TABLE[move.getTo()];
        }
       
        return text;
    }

    //#endregion
}