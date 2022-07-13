const GAMEPHASE_INC = [0,0,1,1,1,2,2,2,4,4,0,0];

class Evaluator
{
    constructor(engine)
    {
        this.engine = engine;
    }

    evaluate(use_cache = false)
    {
        if(!use_cache)
        {
            this.engine.white2move = !this.engine.white2move;
            this.engine.generateMoves();
            this.engine.white2move = !this.engine.white2move;
        }

        let game_phase = 0;
        let score = 0, bishops = 0, mg_score = 0, eg_score = 0;

        for (let i = 0; i < 64; i++)
        {
            if(this.engine.bit_board[i] === 0) continue;

            const config = this.engine.PIECES_CONFIG[this.engine.getValue(i)];
            const is_white = this.engine.isWhite(i);

            // normal score
            score += config.score * (is_white? 1 : -1);
            game_phase += GAMEPHASE_INC[Math.floor(config.score)];

            // board score
            if(is_white)
            {
                mg_score += config.mg_table? config.mg_table[i] : 0;
                eg_score += config.eg_table? config.eg_table[i] : 0;
            }
            else
            {
                let j = (7-(i>>3))*8+(i%8);
                mg_score -= config.mg_table? config.mg_table[j] : 0;
                eg_score -= config.eg_table? config.eg_table[j] : 0;
            }

            // bishop pair score
            if(this.engine.getLabel(i) !== 'b') continue;
            if(is_white)
            {
                bishops++;
            }
            else
            {
                bishops--;
            }
        }

        // TODO: Dont include promotion moves

        // Sum the bishop pair (+1)
        score += Math.min(Math.max(bishops, -1), 1);

        // // Sum the board score from the piece tables
        // score += board_score / 100;

        // Store the legal moves and auto-update all the cache
        // let w_moves = this.engine.white2move? [] : this.engine.cache_generated_moves;
        // let b_moves = this.engine.white2move? this.engine.cache_generated_moves : [];
        // w_moves = this.engine.white2move? this.engine.generateMoves() : w_moves;
        // b_moves = this.engine.white2move? b_moves : this.engine.generateMoves();

        // // Sum the legal moves
        // score += 0.05 * (w_moves.length - b_moves.length);

        // // Sum the controlled squares
        // score += 0.1 * (this.engine.cache_white_protected.length - this.engine.cache_black_protected.length);

        // // Sum the non en pride squares

        // const w_pride = w_moves.filter(move => !this.engine.cache_black_protected.includes(move.getTo()));
        // const b_pride = b_moves.filter(move => !this.engine.cache_white_protected.includes(move.getTo()));

        // score += 0.1 * (w_pride.length - b_pride.length);

        // TODO: Ignore pawn controlled squares

        if (game_phase > 24) game_phase = 24; // In case of early promotion

        // score += ((mg_score * game_phase + eg_score * (24 - game_phase)) / 24) / 100;

        // Has to be like this cause of negamax
        return score * (this.engine.white2move? 1 : -1);
    }

    getIsolatedPawns()
    {
        const pattern = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];

        let w_count = 0;
        let b_count = 0;

        for (let i = 0; i < 64; i++)
        {
            if(this.engine.bit_board[i] === 0) continue;
            if(this.engine.getLabel(i) !== 'p') continue;

            if(this.engine.isWhite(i))
            {
                let isolated = true;
                for (let j = 0; j < 8; j++)
                {
                    const index = i + pattern[j][0] + 8 * pattern[j][1];
                    if(!this.engine.isValidMove(i, pattern[j])) continue;
                    if(this.engine.getLabel(index) !== 'p') continue;
                    if(!this.engine.isWhite(index)) continue;
    
                    isolated = false;
                    break;
                }

                if(isolated)
                {
                    w_count++;
                }
            }
            else
            {
                let isolated = true;
                for (let j = 0; j < 8; j++)
                {
                    const index = i + pattern[j][0] + 8 * pattern[j][1];
                    if(!this.engine.isValidMove(i, pattern[j])) continue;
                    if(this.engine.getLabel(index) !== 'p') continue;
                    if(this.engine.isWhite(index)) continue;
    
                    isolated = false;
                    break;
                }

                if(isolated)
                {
                    b_count++;
                }
            }
        }

        return [w_count, b_count];
    }

    alphaIsMate(alpha)
    {
        return alpha > 100 || alpha < -100;
    }
}