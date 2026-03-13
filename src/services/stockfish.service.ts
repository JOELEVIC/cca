import { spawn } from 'child_process';
import { join } from 'path';

export type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_CONFIG: Record<
  Difficulty,
  { skillLevel: number; movetime: number }
> = {
  easy: { skillLevel: 5, movetime: 500 },
  medium: { skillLevel: 12, movetime: 1500 },
  hard: { skillLevel: 18, movetime: 3000 },
};

/**
 * Get best move from Stockfish for the given FEN position.
 * Spawns Stockfish process, sends UCI commands, returns best move.
 */
export async function getBestMove(
  fen: string,
  difficulty: Difficulty = 'medium'
): Promise<string | null> {
  const { skillLevel, movetime } = DIFFICULTY_CONFIG[difficulty];

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
    send(`setoption name Skill Level value ${skillLevel}`);
    send('isready');
    send(`position fen ${fen}`);
    send(`go movetime ${movetime}`);
  });
}
