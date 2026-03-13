import { spawn } from 'child_process';
import { join } from 'path';

const UCI_ELO_MIN = 1320;
const UCI_ELO_MAX = 3190;
const MOVETIME_MS = 1500;

/** ELO to Skill Level for elo < 1320. Plan: 230→0, 400→2, 600→4, 800→6, 1000→8, 1200→10 */
function eloToSkillLevel(elo: number): number {
  const level = Math.round((elo - 200) / 100);
  return Math.max(0, Math.min(20, level));
}

/**
 * Get best move from Stockfish for the given FEN position.
 * Uses UCI_Elo (1320–3190) or Skill Level (<1320).
 */
export async function getBestMove(fen: string, elo: number = 1600): Promise<string | null> {
  const clampedElo = Math.max(230, Math.min(3500, elo));
  const useUciElo = clampedElo >= UCI_ELO_MIN;
  const uciElo = Math.min(UCI_ELO_MAX, Math.max(UCI_ELO_MIN, clampedElo));
  const skillLevel = eloToSkillLevel(clampedElo);

  return new Promise((resolve, reject) => {
    const stockfishPath = join(
      process.cwd(),
      'node_modules/stockfish/bin/stockfish-18-lite-single.js'
    );

    const proc = spawn(process.execPath, [stockfishPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let buffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('bestmove ')) {
          const match = line.match(/bestmove (\S+)/);
          const move = match ? match[1] : null;
          proc.kill('SIGTERM');
          resolve(move === '(none)' ? null : move);
          return;
        }
      }
    });

    proc.stderr.on('data', () => {
      // Stockfish may write info to stderr; ignore
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code, signal) => {
      if (code !== 0 && code !== null && signal !== 'SIGTERM') {
        reject(new Error(`Stockfish exited with code ${code}`));
      }
    });

    const send = (cmd: string) => {
      proc.stdin?.write(cmd + '\n');
    };

    send('uci');
    if (useUciElo) {
      send('setoption name UCI_LimitStrength value true');
      send(`setoption name UCI_Elo value ${uciElo}`);
    } else {
      send(`setoption name Skill Level value ${skillLevel}`);
    }
    send('isready');
    send(`position fen ${fen}`);
    send(`go movetime ${MOVETIME_MS}`);
  });
}

export interface Evaluation {
  cp: number | null;
  mate: number | null;
}

/**
 * Get evaluation for a FEN position.
 * Returns centipawns (positive = white advantage) or mate in N.
 */
export async function getEvaluation(fen: string): Promise<Evaluation> {
  return new Promise((resolve, reject) => {
    const stockfishPath = join(
      process.cwd(),
      'node_modules/stockfish/bin/stockfish-18-lite-single.js'
    );

    const proc = spawn(process.execPath, [stockfishPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let buffer = '';
    let result: Evaluation = { cp: null, mate: null };

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('bestmove ')) {
          proc.kill('SIGTERM');
          resolve(result);
          return;
        }
        const cpMatch = line.match(/score cp (-?\d+)/);
        const mateMatch = line.match(/score mate (-?\d+)/);
        if (mateMatch) {
          result.mate = parseInt(mateMatch[1], 10);
        }
        if (cpMatch) {
          result.cp = parseInt(cpMatch[1], 10);
        }
      }
    });

    proc.stderr.on('data', () => {});

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code, signal) => {
      if (code !== 0 && code !== null && signal !== 'SIGTERM') {
        reject(new Error(`Stockfish exited with code ${code}`));
      }
    });

    const send = (cmd: string) => {
      proc.stdin?.write(cmd + '\n');
    };

    send('uci');
    send('isready');
    send(`position fen ${fen}`);
    send('go depth 10');
  });
}
