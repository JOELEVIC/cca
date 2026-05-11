/**
 * Player Style — server-side R2M attribute classifier.
 *
 * Same heuristic philosophy as `ccaui/src/lib/r2m-classifier.ts` but
 * implemented WITHOUT chess.js: we parse PGN move tokens with regex.
 * The result is structurally compatible — both sides produce the same
 * 6-attribute block and Hunter Class id.
 *
 * Mapping:
 *   • strength     — capture rate + checks + mate-wins
 *   • agility      — bullet/blitz share + win-rate in fast games
 *   • intelligence — repertoire breadth (distinct ECOs) + deep wins
 *   • vitality     — long-game survival + long-game share
 *   • sense        — quiet-move density + draw share
 *   • willpower    — long endgame conversion
 */

import type { NormalisedGame } from './chesscom.service.js';

export type AttrKey =
  | 'strength'
  | 'agility'
  | 'intelligence'
  | 'vitality'
  | 'sense'
  | 'willpower';

export interface Attributes {
  strength: number;
  agility: number;
  intelligence: number;
  vitality: number;
  sense: number;
  willpower: number;
}

export type HunterClassId =
  | 'assassin'
  | 'architect'
  | 'guardian'
  | 'tactician'
  | 'predator'
  | 'sage';

export interface HunterClass {
  id: HunterClassId;
  name: string;
  tagline: string;
  primary: [AttrKey, AttrKey];
  mentor: { name: string; era: string; quote: string };
}

const HUNTER_CLASSES: HunterClass[] = [
  { id: 'assassin',  name: 'The Assassin',  tagline: 'Strike fast. Strike once.',          primary: ['strength', 'agility'],     mentor: { name: 'Mikhail Tal',         era: '8th World Champion',  quote: 'You must take the reader into a deep, dark forest.' } },
  { id: 'architect', name: 'The Architect', tagline: 'Every square has a plan.',            primary: ['intelligence', 'sense'],   mentor: { name: 'Anatoly Karpov',      era: '12th World Champion', quote: 'Style? I have no style.' } },
  { id: 'guardian',  name: 'The Guardian',  tagline: 'Their attack will break before you do.', primary: ['vitality', 'willpower'],  mentor: { name: 'Tigran Petrosian',    era: '9th World Champion',  quote: 'Defence is the soul of chess.' } },
  { id: 'tactician', name: 'The Tactician', tagline: 'Calculation as a weapon.',            primary: ['strength', 'intelligence'], mentor: { name: 'Garry Kasparov',     era: '13th World Champion', quote: 'Tactics flow from a superior position.' } },
  { id: 'predator',  name: 'The Predator',  tagline: 'Patient. Inevitable.',                primary: ['sense', 'strength'],       mentor: { name: 'Magnus Carlsen',      era: '16th World Champion', quote: "I let my opponents do the dreaming." } },
  { id: 'sage',      name: 'The Sage',      tagline: 'The endgame begins on move one.',     primary: ['intelligence', 'willpower'], mentor: { name: 'José Raúl Capablanca', era: '3rd World Champion',  quote: 'A good player is always lucky.' } },
];

export interface PlayerStyle {
  username: string;
  computedAt: string;
  attributes: Attributes;
  hunterClass: HunterClass;
  sample: {
    games: number;
    medianRating: number;
    avgPlies: number;
    timeClassMix: Record<string, number>;
  };
  recommendation: {
    attribute: AttrKey;
    title: string;
    href: string;
  };
}

/* ────────────────────────────────────────────────────────────────────
 * PGN regex parser — fast, no dependencies. We only need three facts
 * per game: ply count, capture count, check count, plus whether the
 * game ended in checkmate.
 * ─────────────────────────────────────────────────────────────────── */

const HEADER_RE = /\[([A-Za-z0-9]+)\s+"([^"]*)"\]/g;
const MOVE_RE = /\d+\.+\s*([A-Za-z][A-Za-z0-9+#=x/-]*)\s*([A-Za-z][A-Za-z0-9+#=x/-]*)?/g;

interface PgnStats {
  plies: number;
  captures: number;
  checks: number;
  quietMoves: number;
  endedInMate: boolean;
  eco?: string;
}

function parsePgn(pgn: string): PgnStats {
  // Headers
  const headers: Record<string, string> = {};
  let m: RegExpExecArray | null;
  HEADER_RE.lastIndex = 0;
  while ((m = HEADER_RE.exec(pgn)) !== null) {
    if (m[1] && m[2] !== undefined) headers[m[1]] = m[2];
  }

  // Movetext: drop everything before the first move number and strip comments
  const moveStart = pgn.search(/\n\n|\r\n\r\n/);
  const movetextRaw = moveStart >= 0 ? pgn.slice(moveStart) : pgn;
  const movetext = movetextRaw
    .replace(/\{[^}]*\}/g, ' ')      // strip comments
    .replace(/\$\d+/g, ' ')          // strip NAGs
    .replace(/\([^)]*\)/g, ' ');     // strip parentheticals (variations)

  let plies = 0;
  let captures = 0;
  let checks = 0;
  let quietMoves = 0;
  let lastSan: string | undefined;

  MOVE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MOVE_RE.exec(movetext)) !== null) {
    for (const san of [match[1], match[2]]) {
      if (!san) continue;
      // Filter out result tokens and stray garbage that the regex might catch.
      if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(san)) continue;
      if (san.length < 2) continue;
      plies++;
      const isCapture = san.includes('x');
      const isCheck = san.endsWith('+') || san.endsWith('#');
      if (isCapture) captures++;
      if (isCheck) checks++;
      if (!isCapture && !isCheck) quietMoves++;
      lastSan = san;
    }
  }

  return {
    plies,
    captures,
    checks,
    quietMoves,
    endedInMate: lastSan?.endsWith('#') ?? false,
    eco: headers['ECO'] ?? headers['Opening'] ?? undefined,
  };
}

/* ────────────────────────────────────────────────────────────────────
 * Heuristic mapping
 * ─────────────────────────────────────────────────────────────────── */

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function score(value: number, ceiling: number): number {
  if (value <= 0) return 0;
  const ratio = value / ceiling;
  return clamp(80 * Math.tanh(ratio) + 15 * Math.tanh(ratio - 1));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 0) {
    return Math.round(((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2);
  }
  return s[mid] ?? 0;
}

interface PerGame {
  stats: PgnStats;
  game: NormalisedGame;
  longEndgame: boolean;
}

export function attributesFromGames(perGame: PerGame[]): Attributes {
  if (perGame.length === 0) {
    return { strength: 30, agility: 30, intelligence: 30, vitality: 30, sense: 30, willpower: 30 };
  }

  const n = perGame.length;
  const totalPlies = perGame.reduce((s, p) => s + p.stats.plies, 0);
  const totalCaptures = perGame.reduce((s, p) => s + p.stats.captures, 0);
  const totalChecks = perGame.reduce((s, p) => s + p.stats.checks, 0);
  const totalQuiet = perGame.reduce((s, p) => s + p.stats.quietMoves, 0);

  const wins = perGame.filter((p) => p.game.perspective?.outcome === 'win').length;
  const losses = perGame.filter((p) => p.game.perspective?.outcome === 'loss').length;
  const draws = perGame.filter((p) => p.game.perspective?.outcome === 'draw').length;
  const mateWins = perGame.filter((p) => p.stats.endedInMate && p.game.perspective?.outcome === 'win').length;
  const longGames = perGame.filter((p) => p.stats.plies > 60).length;
  const longWins = perGame.filter((p) => p.stats.plies > 60 && p.game.perspective?.outcome === 'win').length;
  const longLossByMate = perGame.filter(
    (p) => p.stats.plies > 60 && p.stats.endedInMate && p.game.perspective?.outcome === 'loss',
  ).length;
  const longEndgames = perGame.filter((p) => p.longEndgame).length;
  const longEndgameWins = perGame.filter((p) => p.longEndgame && p.game.perspective?.outcome === 'win').length;
  const longishWins = perGame.filter((p) => p.stats.plies > 40 && p.game.perspective?.outcome === 'win').length;

  const openings = new Set(perGame.map((p) => p.stats.eco).filter(Boolean));

  const bulletBlitz = perGame.filter((p) => p.game.timeClass === 'bullet' || p.game.timeClass === 'blitz').length;
  const bulletBlitzWins = perGame.filter(
    (p) => (p.game.timeClass === 'bullet' || p.game.timeClass === 'blitz') && p.game.perspective?.outcome === 'win',
  ).length;

  // 1. Strength
  const captureRate = totalPlies > 0 ? totalCaptures / totalPlies : 0;
  const checkRate = totalPlies > 0 ? totalChecks / totalPlies : 0;
  const strength = clamp(
    score(captureRate, 0.18) * 0.55 +
      score(checkRate, 0.10) * 0.20 +
      score(mateWins / Math.max(1, wins || 1), 0.30) * 0.25,
  );

  // 2. Agility
  const fastShare = bulletBlitz / n;
  const fastWinRate = bulletBlitz > 0 ? bulletBlitzWins / bulletBlitz : 0;
  const agility = clamp(score(fastShare, 0.6) * 0.5 + score(fastWinRate, 0.55) * 0.5);

  // 3. Intelligence
  const intelligence = clamp(
    score(openings.size, 10) * 0.55 + score(longishWins / n, 0.35) * 0.45,
  );

  // 4. Vitality
  const longSurvival = longGames > 0 ? 1 - longLossByMate / longGames : 0.5;
  const vitality = clamp(
    score(longGames / n, 0.35) * 0.45 + score(longSurvival, 0.85) * 0.55,
  );

  // 5. Sense
  const quietRate = totalPlies > 0 ? totalQuiet / totalPlies : 0;
  const drawShare = draws / n;
  const sense = clamp(score(quietRate, 0.78) * 0.6 + score(drawShare, 0.18) * 0.4);

  // 6. Willpower
  const willpower = clamp(
    score(longEndgames / n, 0.30) * 0.4 +
      score(longEndgameWins / Math.max(1, longEndgames || 1), 0.55) * 0.4 +
      score(longWins / Math.max(1, longGames || 1), 0.50) * 0.2,
  );

  // Suppress unused-warnings while keeping the variables documented:
  void losses;

  return { strength, agility, intelligence, vitality, sense, willpower };
}

export function classify(attributes: Attributes): HunterClass {
  const ranked: { key: AttrKey; value: number }[] = (
    ['strength', 'agility', 'intelligence', 'vitality', 'sense', 'willpower'] as AttrKey[]
  )
    .map((k) => ({ key: k, value: attributes[k] }))
    .sort((a, b) => b.value - a.value);

  let best: HunterClass = HUNTER_CLASSES[3] ?? HUNTER_CLASSES[0]!;
  let bestScore = -1;
  const top1 = ranked[0]?.key;
  const top2 = ranked[1]?.key;
  const top3 = new Set([ranked[0]?.key, ranked[1]?.key, ranked[2]?.key].filter(Boolean) as AttrKey[]);
  for (const c of HUNTER_CLASSES) {
    let s = 0;
    if (top1 && c.primary.includes(top1)) s += 2;
    if (top2 && c.primary.includes(top2)) s += 1;
    if (top3.has(c.primary[0]) && top3.has(c.primary[1])) s += 1;
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

const DUNGEON_MAP: Record<AttrKey, { title: string; href: string }> = {
  strength:     { title: 'Mating-Attack Dojo',     href: '/learning?focus=tactics' },
  agility:      { title: 'Blitz Arena: 60 games',  href: '/play/bot?elo=1500' },
  intelligence: { title: 'Repertoire Forge',       href: '/learning?focus=openings' },
  vitality:     { title: 'Endurance Trials',       href: '/play/bot?elo=1800' },
  sense:        { title: 'Prophylaxis Drills',     href: '/learning?focus=strategy' },
  willpower:    { title: 'Endgame Conservatory',   href: '/learning?focus=endgame' },
};

function recommendDungeon(attributes: Attributes): { attribute: AttrKey; title: string; href: string } {
  const keys: AttrKey[] = ['strength', 'agility', 'intelligence', 'vitality', 'sense', 'willpower'];
  const weakest = keys.reduce<AttrKey>((acc, k) => (attributes[k] < attributes[acc] ? k : acc), 'strength');
  const entry = DUNGEON_MAP[weakest];
  return { attribute: weakest, title: entry.title, href: entry.href };
}

/* ────────────────────────────────────────────────────────────────────
 * Public API
 * ─────────────────────────────────────────────────────────────────── */

export function styleFromGames(username: string, games: NormalisedGame[]): PlayerStyle {
  const perGame: PerGame[] = games
    .map((g) => {
      const stats = parsePgn(g.pgn);
      if (stats.plies < 4) return null;
      // Long endgame: > 50 ply AND the final 20 plies have < 4 captures
      // (regex approximation: count captures in the tail by scanning the SAN
      // tokens for "x" in the last quarter of the movetext).
      const tailStart = Math.floor(stats.plies * 0.75);
      const longEndgame = stats.plies > 50 && (stats.captures - Math.floor(stats.captures * (tailStart / stats.plies))) < 4;
      return { stats, game: g, longEndgame };
    })
    .filter((p): p is PerGame => p !== null);

  const attributes = attributesFromGames(perGame);
  const hunterClass = classify(attributes);
  const recommendation = recommendDungeon(attributes);

  const timeClassMix: Record<string, number> = {};
  for (const g of games) {
    timeClassMix[g.timeClass] = (timeClassMix[g.timeClass] ?? 0) + 1;
  }
  const ratings = perGame
    .map((p) => p.game.perspective?.rating ?? 0)
    .filter((r) => r > 0);

  return {
    username,
    computedAt: new Date().toISOString(),
    attributes,
    hunterClass,
    sample: {
      games: perGame.length,
      medianRating: median(ratings),
      avgPlies: perGame.length > 0 ? Math.round(perGame.reduce((s, p) => s + p.stats.plies, 0) / perGame.length) : 0,
      timeClassMix,
    },
    recommendation,
  };
}
