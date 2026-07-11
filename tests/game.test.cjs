const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(raw = null) {
  const storage = {
    raw, readError: null, writeError: null, writes: 0,
    getItem() { if (this.readError) throw this.readError; return this.raw; },
    setItem(key, value) {
      if (this.writeError) throw this.writeError;
      this.raw = value;
      this.writes++;
    },
  };
  const math = Object.create(Math);
  math.random = () => 0.5;
  const text = [];
  const ctx = { fillRect() {}, fillText(value) { text.push(value); } };
  const context = vm.createContext({ Math: math, localStorage: storage, window: {}, setTimeout() {} });
  function script(name) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', name + '.js'), 'utf8'), context, { filename: name + '.js' });
  }
  for (const name of ['core', 'sprites', 'audio', 'entities', 'game']) script(name);
  const api = vm.runInContext('({ Game, Beam, Bomb, Barrier, Swarm, LeaderboardError, CONFIG, hit, Sfx, Music })', context);
  return { api, storage, ctx, context, text, script, game: () => new api.Game(ctx) };
}

function storageError(name) {
  const error = new Error('test storage failure');
  error.name = name;
  return error;
}

function isolateCell(barrier, row, col) {
  barrier.grid.forEach(cells => cells.fill(false));
  barrier.grid[row][col] = true;
}

test('fatal hit on the final-alien frame ends play and cannot advance a wave', () => {
  const h = harness();
  const g = h.game(); g.startGame(); g.lives = 1;
  const a = g.swarm.aliens[0];
  g.swarm.aliens = [a];
  g.beams = [new h.api.Beam(a.x, a.y)];
  g.bombs = [new h.api.Bomb(g.players[0].x + g.players[0].w / 2, g.players[0].y, 1, 'straight')];
  g.update(0);
  assert.equal(g.score, 30);
  assert.equal(g.lives, 0);
  assert.equal(g.state, 'enterscore');
  g.update(3);
  assert.equal(g.level, 1);
  assert.equal(g.state, 'enterscore');
});

test('multiple simultaneous bombs cannot remove lives after a fatal hit', () => {
  const h = harness(); const g = h.game(); g.startGame(); g.lives = 1;
  g.bombs = Array.from({ length: 3 }, () => new h.api.Bomb(g.players[0].x + g.players[0].w / 2, g.players[0].y, 1, 'straight'));
  g.update(0);
  assert.equal(g.lives, 0);
  assert.equal(g.state, 'gameover');
});

test('nonfatal final-alien frame still advances with score and remaining lives', () => {
  const h = harness(); const g = h.game(); g.startGame();
  const a = g.swarm.aliens[0]; g.swarm.aliens = [a]; g.beams = [new h.api.Beam(a.x, a.y)];
  g.update(0);
  assert.equal(g.state, 'levelclear');
  g.update(2.1);
  assert.equal(g.state, 'playing'); assert.equal(g.level, 2); assert.equal(g.score, 30); assert.equal(g.lives, 3);
});

test('fast beams and bombs hit isolated barrier cells rather than tunneling', () => {
  for (const kind of ['beam', 'bomb']) {
    const h = harness(); const g = h.game(); g.startGame();
    const bar = new h.api.Barrier(100, 430); isolateCell(bar, 4, 5); g.barriers = [bar];
    const projectile = kind === 'beam' ? new h.api.Beam(126, 456) : new h.api.Bomb(128, 425, 22, 'straight');
    g[kind === 'beam' ? 'beams' : 'bombs'] = [projectile];
    g.update(0.05);
    assert.equal(projectile.dead, true, kind);
    assert.equal(bar.grid[4][5], false, kind);
  }
});

test('projectile width can hit a cell even when its center misses', () => {
  const h = harness(); const g = h.game(); g.startGame();
  const bar = new h.api.Barrier(100, 430); isolateCell(bar, 4, 5); g.barriers = [bar];
  const beam = new h.api.Beam(129, 456); g.beams = [beam]; g.update(0.05);
  assert.equal(beam.dead, true); assert.equal(bar.grid[4][5], false);
});

test('projectiles pass through destroyed cells and exact outside edges', () => {
  const h = harness(); const g = h.game(); g.startGame();
  const bar = new h.api.Barrier(100, 430); isolateCell(bar, 4, 5); g.barriers = [bar];
  const beam = new h.api.Beam(130, 456); g.beams = [beam]; g.update(0.05);
  assert.equal(beam.dead, false); assert.equal(bar.grid[4][5], true);
  bar.grid[4][5] = false;
  const throughHole = new h.api.Beam(126, 456); g.beams = [throughHole]; g.update(0.05);
  assert.equal(throughHole.dead, false);
});

test('the nearest barrier stops a projectile regardless of barrier array order', () => {
  const h = harness(); const g = h.game(); g.startGame();
  const far = new h.api.Barrier(100, 300), near = new h.api.Barrier(100, 430);
  isolateCell(far, 4, 5); isolateCell(near, 4, 5); g.barriers = [far, near];
  const beam = new h.api.Beam(126, 470); beam.update(0.4); g.beams = [beam]; g.handleCollisions();
  assert.equal(beam.dead, true); assert.equal(near.grid[4][5], false); assert.equal(far.grid[4][5], true);
});

test('barriers protect targets behind a swept projectile path', () => {
  const h = harness(); const g = h.game(); g.startGame();
  const bar = new h.api.Barrier(100, 430); isolateCell(bar, 4, 5); g.barriers = [bar];
  const a = g.swarm.aliens[0]; a.x = 125; a.y = 425; g.swarm.aliens = [a];
  const beam = new h.api.Beam(126, 456); g.beams = [beam]; g.update(0.05);
  assert.equal(beam.dead, true); assert.equal(a.dead, false); assert.equal(g.score, 0);
});

test('aliens remove every overlapping solid cell even with their bottom beyond the barrier', () => {
  const h = harness(); const g = h.game(); g.startGame();
  const bar = new h.api.Barrier(100, 430); g.barriers = [bar];
  const a = g.swarm.aliens[0]; a.x = 105; a.y = 450; g.swarm.aliens = [a];
  const before = bar.grid.map(row => [...row]);
  let crushed = 0;
  g.handleCollisions();
  for (let r = 0; r < bar.rows; r++) for (let c = 0; c < bar.cols; c++) {
    const bounds = { x: bar.x + c * bar.cell, y: bar.y + r * bar.cell, w: bar.cell, h: bar.cell };
    if (h.api.hit(a, bounds) && before[r][c]) {
      assert.equal(bar.grid[r][c], false); crushed++;
    } else assert.equal(bar.grid[r][c], before[r][c]);
  }
  assert.ok(crushed > 0);
});

test('later waves start above barriers and can march without instant defeat', () => {
  const h = harness(); const g = h.game(); g.startGame();
  for (const level of [1, 10, 22, 100]) {
    g.startLevel(level);
    assert.ok(g.swarm.bounds().maxY < g.barriers[0].y);
    g.update(0.05);
    assert.equal(g.state, 'playing', 'level ' + level);
  }
  g.players[0].y -= 40;
  g.startLevel(100);
  assert.equal(g.swarm.bounds().maxY + h.api.CONFIG.swarm.stepY, g.barriers[0].y);
  assert.equal(new h.api.Swarm(1, g.barriers[0].y).aliens[0].y, 77);
});

test('R is not a reset shortcut and remains a letter during initials entry', () => {
  const h = harness();
  for (const state of ['start', 'playing', 'paused', 'levelclear', 'gameover']) {
    const g = h.game(); g.startGame(); g.state = state; g.score = 100;
    g.onKeyDown('KeyR', 'r'); assert.equal(g.state, state); assert.equal(g.score, 100);
  }
  const g = h.game(); g.startGame(); g.score = 100; g.endGame();
  g.onKeyDown('KeyR', 'r'); assert.equal(g.state, 'enterscore'); assert.equal(g.initials[0], 'R');
  g.onKeyDown('KeyR', 'R'); assert.equal(g.state, 'enterscore'); assert.equal(g.initials[1], 'R');
});

test('UFO bonus duration follows simulation time, freezes while paused, and clears on reset', () => {
  const h = harness(); const g = h.game(); g.startGame();
  g.lastUfoPoints = { value: 50, x: 0, y: 0, t: 1.2 };
  for (let frame = 0; frame < 144; frame++) g.render();
  assert.equal(g.lastUfoPoints.t, 1.2);
  g.update(0.4); assert.ok(Math.abs(g.lastUfoPoints.t - 0.8) < 1e-10);
  g.onKeyDown('KeyP', 'p'); g.update(10); g.render(); assert.ok(Math.abs(g.lastUfoPoints.t - 0.8) < 1e-10);
  g.onKeyDown('KeyP', 'p'); g.update(0.9); assert.equal(g.lastUfoPoints, null);
  g.lastUfoPoints = { value: 50, x: 0, y: 0, t: 1.2 }; g.resetToStart(); assert.equal(g.lastUfoPoints, null);
});

test('leaderboard validates every record and does not replace corrupt data', () => {
  for (const raw of ['', 'bad json', 'null', '{}', '[null]', '[{"score":100}]', '[{"name":null,"score":100}]',
    '[{"name":"AAA","score":"100"}]', '[{"name":"AAA","score":-1}]', '[{"name":"AAA","score":0}]',
    '[{"name":"AAA","score":1.5}]', '[{"name":"TOOLONG","score":100}]',
    '[{"name":"AAA","score":9007199254740992}]']) {
    const h = harness(raw);
    const g = h.game();
    assert.equal(g.scores, null, raw);
    assert.equal(g.highScore, null);
    assert.ok(g.scoreError.length > 0);
    assert.throws(() => g.loadScores(), h.api.LeaderboardError, raw);
    g.startGame(); g.render();
    assert.equal(g.state, 'playing');
    assert.ok(h.text.includes('HI ?'));
    g.score = 100; g.endGame(); assert.equal(g.state, 'gameover');
    assert.throws(() => g.commitScore('AAA'), h.api.LeaderboardError);
    assert.equal(h.storage.raw, raw); assert.equal(h.storage.writes, 0);
  }
});

test('valid stored scores are sorted before trimming and qualify correctly', () => {
  const h = harness(JSON.stringify([10, 60, 20, 70, 30, 80].map(score => ({ name: 'AAA', score }))));
  const g = h.game();
  assert.equal(g.highScore, 80); assert.deepEqual(Array.from(g.scores, entry => entry.score), [80, 70, 60, 30, 20]);
  assert.equal(g.qualifies(21), true); assert.equal(g.qualifies(20), false); g.render();
});

test('storage denial is explicit and unexpected errors propagate', () => {
  const h = harness(); h.storage.readError = storageError('SecurityError');
  const g = h.game();
  assert.equal(g.scores, null);
  assert.match(g.scoreError, /could not be read/);
  g.startGame(); assert.equal(g.state, 'playing');
  assert.throws(() => g.loadScores(), h.api.LeaderboardError);
  h.storage.readError = new TypeError('unexpected failure');
  assert.throws(() => h.game(), error => error === h.storage.readError);
});

test('failed saves retain initials and scores; retry commits exactly once', () => {
  for (const name of ['SecurityError', 'QuotaExceededError']) {
    const h = harness(); const g = h.game(); g.startGame(); g.score = 100; g.endGame();
    h.storage.writeError = storageError(name);
    assert.throws(() => g.handleInitials('Enter', 'Enter'), h.api.LeaderboardError);
    assert.equal(g.state, 'enterscore'); assert.equal(g.scores.length, 0); assert.equal(h.storage.raw, null);
    h.storage.writeError = null; g.handleInitials('Enter', 'Enter');
    assert.equal(g.state, 'gameover'); assert.equal(g.scores.length, 1); assert.equal(h.storage.writes, 1);
    assert.equal(h.game().highScore, 100);
  }
});

function bootstrap(h) {
  const nodes = new Map();
  for (const id of ['game', 'reset', 'sound', 'storage-error', 'storage-error-message', 'player-options', 'solo', 'coop', 'control-hint', 'map8']) {
    nodes.set(id, { hidden: true, textContent: '', listeners: new Map(),
      addEventListener(type, callback) { this.listeners.set(type, callback); },
      setAttribute(name, value) { this[name] = value; },
      getContext() { return h.ctx; }, focus() {},
    });
  }
  const listeners = new Map(), frames = [];
  h.context.document = { getElementById(id) { assert.ok(nodes.has(id), id); return nodes.get(id); } };
  h.context.window.addEventListener = (name, callback) => listeners.set(name, callback);
  h.context.performance = { now: () => 0 };
  h.context.requestAnimationFrame = callback => frames.push(callback);
  vm.runInContext('const BaseGame = Game; Game = class extends BaseGame { constructor(ctx) { super(ctx); globalThis.currentGame = this; } };', h.context);
  h.script('main');
  return { nodes, frames, key(code, key = code) {
    listeners.get('keydown')({ code, key, target: { tagName: 'CANVAS' }, repeat: false, preventDefault() {} });
  } };
}

test('invalid scores display an error while startup and gameplay remain available', () => {
  const h = harness('[{"score":100}]'); const ui = bootstrap(h);
  assert.equal(ui.nodes.get('storage-error').hidden, false);
  assert.match(ui.nodes.get('storage-error-message').textContent, /invalid records/);
  assert.equal(h.storage.raw, '[{"score":100}]'); assert.equal(h.storage.writes, 0);
  ui.frames.shift()(16);
  ui.key('Enter');
  assert.equal(h.context.currentGame.state, 'playing');
  ui.frames.shift()(32);
  assert.equal(ui.nodes.get('storage-error').hidden, false);
  assert.equal(h.storage.raw, '[{"score":100}]'); assert.equal(h.storage.writes, 0);
  ui.nodes.get('reset').listeners.get('click')();
  assert.equal(h.context.currentGame.state, 'start');
  assert.equal(ui.nodes.get('storage-error').hidden, false);
});

test('page displays failed-save feedback, retries, and resets by button in every game state', () => {
  const h = harness(); const ui = bootstrap(h); ui.key('Enter');
  const g = h.context.currentGame; g.score = 100; g.endGame();
  h.storage.writeError = storageError('QuotaExceededError'); ui.key('Enter');
  assert.equal(ui.nodes.get('storage-error').hidden, false);
  assert.match(ui.nodes.get('storage-error-message').textContent, /not saved/);
  assert.equal(g.state, 'enterscore');
  h.storage.writeError = null; ui.key('Enter');
  assert.equal(ui.nodes.get('storage-error').hidden, true); assert.equal(g.state, 'gameover'); assert.equal(h.storage.writes, 1);
  for (const state of ['start', 'playing', 'paused', 'levelclear', 'enterscore', 'gameover']) {
    g.startGame(); g.state = state; g.score = 200;
    ui.nodes.get('reset').listeners.get('click')();
    assert.equal(g.state, 'start'); assert.equal(g.score, 0);
    assert.equal(ui.nodes.get('storage-error').hidden, true);
  }
});

test('opening wave is gentler and later waves ramp gradually', () => {
  const h = harness();
  const waves = [1, 2, 3, 4, 8].map(level => new h.api.Swarm(level, 430));
  assert.equal(waves[0].maxBombs(), 1);
  assert.equal(waves[1].maxBombs(), 1);
  assert.equal(waves[2].maxBombs(), 1);
  assert.equal(waves[3].maxBombs(), 2);
  assert.ok(waves[0].stepInterval() > 0.55);
  for (let i = 1; i < waves.length; i++) {
    assert.ok(waves[i].stepInterval() < waves[i - 1].stepInterval());
    assert.ok(waves[i].bombRate() > waves[i - 1].bombRate());
  }
  const opening = waves[0]; opening.aliens = [opening.aliens[0]];
  assert.ok(opening.stepInterval() >= 0.16);
  assert.equal(opening.bombRate(), 0.25);
  const bomb = new h.api.Bomb(100, 100, 1, 'straight');
  assert.ok(bomb.speed < 230);
});

test('bomb firing uses elapsed time even between swarm steps', () => {
  const h = harness(); const g = h.game(); g.startGame();
  h.context.Math.random = () => 0.001;
  const result = g.swarm.update(0.01, g);
  assert.ok(result.bomb);
  assert.equal(g.swarm.frame, 0);
  g.bombs.push(result.bomb);
  assert.equal(g.swarm.update(0.01, g).bomb, null);
});
