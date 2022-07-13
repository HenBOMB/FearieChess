
import { Engine } from "./engine/engine";
import { Move } from "./engine/move";

export class Evaluator
{
    private engine: Engine;
    private async_counter: number = 0;
    private ply: number = 0;
    private line: Move[] = [];

    constructor(engine: Engine)
    {
        this.engine = engine;
    }

    evaluate()
    {
        let game_phase = 0;
        let score = 0, bishops = 0, mg_score = 0, eg_score = 0;

        for (let i = 0; i < 64; i++)
        {
            if(this.engine.bit_board[i] === 0) continue;

            const config = this.engine.PIECES_CONFIG[this.engine.getValue(i)];
            const is_white = this.engine.isWhite(i);

            // normal score
            score += config.score * (is_white? 1 : -1);
            game_phase += [0,0,1,1,1,2,2,2,4,4,0,0][Math.floor(config.score)];

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

        score += ((mg_score * game_phase + eg_score * (24 - game_phase)) / 24) / 100;

        // Has to be like this cause of negamax
        return score * (this.engine.white2move? 1 : -1);
    }

    static evaluateFen(fen: string)
    {
        const engine = new Engine();
        engine.loadFen(fen);

        // This is doing everything!!
        engine.white2move = !engine.white2move;
        engine.generateMoves();
        engine.white2move = !engine.white2move;

        let game_phase = 0;
        let score = 0, bishops = 0, mg_score = 0, eg_score = 0;

        for (let i = 0; i < 64; i++)
        {
            if(engine.bit_board[i] === 0) continue;

            const config = engine.PIECES_CONFIG[engine.getValue(i)];
            const is_white = engine.isWhite(i);

            score += config.score * (is_white? 1 : -1);
            game_phase += [0,0,1,1,1,2,2,2,4,4,0,0][Math.floor(config.score)];

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

            if(engine.getLabel(i) !== 'b') continue;
            if(is_white)
            {
                bishops++;
            }
            else
            {
                bishops--;
            }
        }

        score += Math.min(Math.max(bishops, -1), 1);

        if (game_phase > 24) game_phase = 24;

        score += ((mg_score * game_phase + eg_score * (24 - game_phase)) / 24) / 100;

        return score * (engine.white2move? 1 : -1);
    }

    // getIsolatedPawns()
    // {
    //     const pattern = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];

    //     let w_count = 0;
    //     let b_count = 0;

    //     for (let i = 0; i < 64; i++)
    //     {
    //         if(this.engine.bit_board[i] === 0) continue;
    //         if(this.engine.getLabel(i) !== 'p') continue;

    //         if(this.engine.isWhite(i))
    //         {
    //             let isolated = true;
    //             for (let j = 0; j < 8; j++)
    //             {
    //                 const index = i + pattern[j][0] + 8 * pattern[j][1];
    //                 if(!this.engine.isValidMove(i, pattern[j])) continue;
    //                 if(this.engine.getLabel(index) !== 'p') continue;
    //                 if(!this.engine.isWhite(index)) continue;
    
    //                 isolated = false;
    //                 break;
    //             }

    //             if(isolated)
    //             {
    //                 w_count++;
    //             }
    //         }
    //         else
    //         {
    //             let isolated = true;
    //             for (let j = 0; j < 8; j++)
    //             {
    //                 const index = i + pattern[j][0] + 8 * pattern[j][1];
    //                 if(!this.engine.isValidMove(i, pattern[j])) continue;
    //                 if(this.engine.getLabel(index) !== 'p') continue;
    //                 if(this.engine.isWhite(index)) continue;
    
    //                 isolated = false;
    //                 break;
    //             }

    //             if(isolated)
    //             {
    //                 b_count++;
    //             }
    //         }
    //     }

    //     return [w_count, b_count];
    // }
    
    async bestMove(depth = 4, ws = null)
    {      
        console.time(`depth ${depth}`);

        return new Promise(async resolve => {
            const moves = this.engine.generateMoves();
            const l = moves.length;
            
            if(l === 0)
            {
                console.timeEnd(`depth ${depth}`);
                resolve("error");
            }

            this.async_counter = 0;
            let alpha = -999, beta = 999;
            let best_move: Move;
            let worst_move: Move;
            let best_line: Move[];

            for (let i = 0; i < l; i++)
            {
                setTimeout(() => { 
                    this.ply = 0;
                    this.line = [];

                    const undo = this.engine.makeMove(moves[i]);
                    const negamax = this.negamax(depth - 1, -beta, -alpha);
                    const val = -negamax[0];

                    this.async_counter++;
                    this.engine.undoMove(undo);
        
                    if(val > alpha)
                    {
                        alpha = val;
                        best_move = moves[i];
                        best_line = negamax[1];

                        if(ws) ws.send(JSON.stringify([moves[i], best_line]));
                    }

                    if(val < alpha)
                    {
                        worst_move = moves[i];
                    }

                    // This should go before "if (val > alpha)"
                    // Found an identical move with best value
                    // 50% chance to pick, add some variation :>
                    // if(val === alpha && Math.random() > 0.5)
                    // {
                    //     best_move = moves[i];
                    //     best_line = negamax[1];
                    // }

                    if(this.async_counter === l)
                    {
                        if(!best_move)
                        {
                            best_move = worst_move;
                            best_line = [];
                        }

                        const formatted = [];

                        if(this.isScoreMate(alpha))
                        {
                            formatted.push(`${this.engine.logMove(best_move)} M${Math.ceil(best_line.length/2)}`);
                        }
                        else
                        {
                            formatted.push(this.engine.logMove(best_move));
                        }

                        for (let j = best_line.length - 1; j > 0; j--)
                        {
                            if(best_line[j] === null)
                            {
                                formatted.push(`${this.engine.logMove(best_line[j-1])}#`);
                                j--;
                                continue;
                            }

                            formatted.push(`${this.engine.logMove(best_line[j])}`);
                        }

                        console.timeEnd(`depth ${depth}`);

                        resolve([best_move, formatted, Math.round(val * 100) / 100]);
                    }
                }, 0);
            }
        });
    }

    negamax(depth: number, alpha: number, beta: number): any | number[]
    {
        if (depth == 0) return [this.evaluate(), []];

        if(this.engine.isThreefoldDraw()) return [9999, []];

        const moves = this.engine.generateMoves();
        
        // Stalemate
        // Will only try to avoid drawing if there are more than 6 pieces
        if (this.engine.piece_count > 5 && 
            moves.length === 0 && 
            this.engine.cache_eval_check_status === 0) return [9999 + this.ply, []];

        // Mate
        if (moves.length === 0 && 
            this.engine.cache_eval_check_status !== 0) return [-9999 - this.ply, []];

        let line: Move[] = [];
        const l = moves.length;

        for (let i = 0; i < l; i++)
        {
            const undo = this.engine.makeMove(moves[i]);

        	const negamax = this.negamax(depth - 1, -beta, -alpha);
            let score = -negamax[0];
            
            this.engine.undoMove(undo);

            if (score > alpha)
            {
                alpha = score;
                this.line = negamax[1];

                if(this.engine.cache_eval_check_status !== 0)
                {
                    this.line.push(moves[i]);
                    this.line.push(null);
                }
                else
                {
                    this.line.push(moves[i]);
                }

                // // if it's a really really good move but, is not mate, punish to get the shortest line with the highest score
                // if(!this.isScoreMate(alpha) && (alpha > 11 || alpha < -11))
                // {
                //     alpha += this.engine.white2move? 0.1 : -0.1;
                // }
            } 

            if (alpha >= beta) break;
        }

        this.ply--;
        return [alpha, this.line];
    }

    // quiesce(alpha: number, beta: number)
    // {
    //     const score = this.evaluate();
    //     if (score >= beta) return score;
    //     for (each capturing move m) {
    //         make move m;
    //         score = -quiesce(-beta,-alpha);
    //         unmake move m;
    //         if (score >= alpha) {
    //             alpha = score;
    //             if (score >= beta) break;
    //         }
    //     }
    //     return score;
    // }

    isScoreMate(alpha: number)
    {
        return alpha > 100 || alpha < -100;
    }
}