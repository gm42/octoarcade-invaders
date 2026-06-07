/*
 * core.js - shared config, palette, and small helpers.
 * Loaded first; everything below is referenced by the other scripts.
 */

// Internal render resolution. The canvas is scaled up with CSS, so all game
// logic works in this fixed coordinate space regardless of display size.
const VIEW = { W: 800, H: 600 };

// Dark palette. Each alien tier gets its own label-style color so point values
// are readable at a glance.
const COLORS = {
  bg: '#0d1117',
  bgGrid: '#161b22',
  text: '#e6edf3',
  textDim: '#8b949e',
  accent: '#2f81f7',
  player: '#3fb950',
  beam: '#58a6ff',
  bomb: '#f85149',
  ufo: '#f0883e',
  star: '#30363d',
  starBright: '#6e7681',
  alien: {
    squid: '#f778ba', // top row  - 30 pts
    crab: '#a371f7',  // mid rows - 20 pts
    octo: '#56d364',  // low rows - 10 pts
  },
};

const CONFIG = {
  margin: 16,

  player: { speed: 330, fireCooldown: 0.28, maxBeams: 2, lives: 3, respawnInvuln: 2.0 },
  beam: { speed: 560, w: 3, h: 14 },
  bomb: { w: 6, h: 14, baseSpeed: 160, speedPerLevel: 12 },

  swarm: {
    rows: 5,
    cols: 11,
    cellW: 48,
    cellH: 38,
    pixel: 3,           // sprite pixel size
    startX: 136,        // (VIEW.W - cols*cellW) / 2
    startY: 70,
    startYPerLevel: 8, // lower starts are bounded by the barrier geometry
    stepX: 8,
    stepY: 16,
    edgeMargin: 16,
    // step interval shrinks as the swarm thins out and as levels climb
    stepIntervalMax: 0.7,
    stepIntervalMin: 0.16,
    levelSpeedup: 0.94,
    bombRateBase: 0.25, // bombs per second, independent of marching speed
    bombRatePerLevel: 0.04,
    bombRateMax: 0.85,
    maxBombsBase: 1,
    levelsPerExtraBomb: 3,
    maxBombsCap: 6,
  },

  ufo: { y: 46, speed: 150, w: 48, h: 21, spawnMin: 12, spawnMax: 22, points: [50, 100, 150, 300] },

  barrier: { count: 4, cell: 5, yOffset: 110 },

  points: { squid: 30, crab: 20, octo: 10 },

  leaderboard: { key: 'octoarcade.scores', size: 5 },

  map8: {
    unlockScore: 5000,
    descentMultiplier: 0.25,
    pixel: 1,
    cellW: 18,
    cellH: 18,
    // Octocat: pointed ears, eye openings, whiskers, a curled tail and four feet.
    formation: [
      '.....##...........##...',
      '.....####.......####...',
      '.....###############...',
      '....#################..',
      '....#################..',
      '....####..#####..####..',
      '....####..#####..####..',
      '###.#################.#',
      '.....#######.#######...',
      '......#############....',
      '........#########......',
      '..##......#######......',
      '...##....########......',
      '....####.########......',
      '......###########......',
      '.........#.#.#.#.......',
      '.........#.#.#.#.......',
      '........##.#.#.##......',
      '.......##.##.##.##.....',
    ],
  },
};

// ---- helpers ---------------------------------------------------------------

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function randInt(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); }
function randRange(lo, hi) { return lo + Math.random() * (hi - lo); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Axis-aligned bounding-box overlap test.
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Overlap test for two entities exposing { x, y, w, h }.
function hit(a, b) { return aabb(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h); }

// First overlap along a projectile's movement this frame (0..1), or null.
// Sweeping the whole rectangle prevents thin barrier cells being skipped.
function sweepTime(projectile, target) {
  let enter = 0, leave = 1;
  for (const [axis, size, previous] of [['x', 'w', 'prevX'], ['y', 'h', 'prevY']]) {
    const start = projectile[previous];
    const delta = projectile[axis] - start;
    if (delta === 0) {
      if (start + projectile[size] <= target[axis] || start >= target[axis] + target[size]) return null;
      continue;
    }
    const a = (target[axis] - start - projectile[size]) / delta;
    const b = (target[axis] + target[size] - start) / delta;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
    if (enter >= leave) return null;
  }
  return enter;
}
