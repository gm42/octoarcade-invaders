/*
 * entities.js - game objects. Each exposes { x, y, w, h }, an update(dt, ...)
 * method, and a draw(ctx) method. The Game in game.js owns and coordinates them.
 */

// Per-tier invader visuals and score values.
const ALIEN_TYPES = {
  squid: {
    frames: SPRITES.squid,
    color: COLORS.alien.squid,
    points: CONFIG.points.squid,
  },
  crab: {
    frames: SPRITES.crab,
    color: COLORS.alien.crab,
    points: CONFIG.points.crab,
  },
  octo: {
    frames: SPRITES.octo,
    color: COLORS.alien.octo,
    points: CONFIG.points.octo,
  },
};

// ---- Player cannon ---------------------------------------------------------

const PLAYER_INPUTS = {
  solo: { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], fire: ['Space', 'ArrowUp'] },
  one: { left: ['KeyA'], right: ['KeyD'], fire: ['Space'] },
  two: { left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter'] },
};

class Player {
  constructor(inputs, color, label) {
    this.inputs = inputs;
    this.color = color;
    this.label = label;
    const s = spriteSize(SPRITES.cannon, CONFIG.swarm.pixel);
    this.w = s.w;
    this.h = s.h;
    this.x = (VIEW.W - this.w) / 2;
    this.spawnX = this.x;
    this.y = VIEW.H - 60;
    this.cooldown = 0;
    this.invuln = 0; // > 0 means recently respawned (briefly immune + blinking)
  }

  update(dt, keys) {
    let dir = 0;
    if (this.inputs.left.some(key => keys.has(key))) dir -= 1;
    if (this.inputs.right.some(key => keys.has(key))) dir += 1;
    this.x = clamp(
      this.x + dir * CONFIG.player.speed * dt,
      CONFIG.margin,
      VIEW.W - CONFIG.margin - this.w
    );
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.invuln > 0) this.invuln -= dt;
  }

  canFire() { return this.cooldown <= 0; }

  firing(keys) { return this.inputs.fire.some(key => keys.has(key)); }

  fire() {
    this.cooldown = CONFIG.player.fireCooldown;
    const beam = new Beam(this.x + this.w / 2 - CONFIG.beam.w / 2, this.y - CONFIG.beam.h);
    beam.owner = this;
    return beam;
  }

  draw(ctx) {
    // Blink while invulnerable.
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return;
    drawSprite(ctx, SPRITES.cannon, this.x, this.y, CONFIG.swarm.pixel, this.color);
    if (this.label) {
      ctx.fillStyle = this.color;
      ctx.font = '12px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.label, this.x + this.w / 2, this.y + this.h + 16);
    }
  }
}

// ---- Projectiles -----------------------------------------------------------

class Beam {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.prevX = x; this.prevY = y;
    this.owner = null; // Set by the firing cannon; unattached beams have no owner.
    this.w = CONFIG.beam.w; this.h = CONFIG.beam.h;
    this.dead = false;
  }
  update(dt) {
    this.prevX = this.x; this.prevY = this.y;
    this.y -= CONFIG.beam.speed * dt;
    if (this.y + this.h < 0) this.dead = true;
  }
  draw(ctx) {
    ctx.fillStyle = this.owner ? this.owner.color : COLORS.beam;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = '#cfe8ff';
    ctx.fillRect(this.x, this.y, this.w, 4);
  }
}

class Bomb {
  constructor(x, y, level, kind) {
    this.w = CONFIG.bomb.w; this.h = CONFIG.bomb.h;
    this.x = x - this.w / 2; this.y = y;
    this.prevX = this.x; this.prevY = y;
    this.kind = kind; // 'straight' | 'wiggle'
    this.speed = CONFIG.bomb.baseSpeed + CONFIG.bomb.speedPerLevel * (level - 1);
    this.baseX = this.x;
    this.phase = randRange(0, Math.PI * 2);
    this.dead = false;
  }
  update(dt) {
    this.prevX = this.x; this.prevY = this.y;
    this.y += this.speed * dt;
    if (this.kind === 'wiggle') {
      this.phase += dt * 10;
      this.x = this.baseX + Math.sin(this.phase) * 8;
    }
    if (this.y > VIEW.H) this.dead = true;
  }
  draw(ctx) {
    ctx.fillStyle = COLORS.bomb;
    // Little 4-segment zigzag bolt.
    const segs = 4, sh = this.h / segs;
    for (let i = 0; i < segs; i++) {
      const off = i % 2 === 0 ? 0 : this.w - 3;
      ctx.fillRect(this.x + off, this.y + i * sh, 3, sh);
    }
  }
}

// ---- Bonus UFO -------------------------------------------------------------

class Ufo {
  constructor() {
    this.w = CONFIG.ufo.w; this.h = CONFIG.ufo.h;
    this.fromLeft = Math.random() < 0.5;
    this.x = this.fromLeft ? -this.w : VIEW.W;
    this.y = CONFIG.ufo.y;
    this.vx = (this.fromLeft ? 1 : -1) * CONFIG.ufo.speed;
    this.points = choice(CONFIG.ufo.points);
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    if ((this.vx > 0 && this.x > VIEW.W) || (this.vx < 0 && this.x + this.w < 0)) this.dead = true;
  }
  draw(ctx) {
    drawSprite(ctx, SPRITES.ufo, this.x, this.y, CONFIG.swarm.pixel, COLORS.ufo);
  }
}

// ---- Explosion particles ---------------------------------------------------

class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.vx = randRange(-120, 120);
    this.vy = randRange(-120, 120);
    this.life = randRange(0.3, 0.6);
    this.maxLife = this.life;
    this.size = randInt(2, 4);
    this.color = color;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 200 * dt; // gentle gravity
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

// ---- Destructible barrier --------------------------------------------------

class Barrier {
  constructor(x, y) {
    const cell = CONFIG.barrier.cell;
    this.cell = cell;
    this.bmp = SPRITES.barrier;
    this.cols = Math.max(...this.bmp.map(r => r.length));
    this.rows = this.bmp.length;
    this.x = x; this.y = y;
    this.w = this.cols * cell;
    this.h = this.rows * cell;
    // Per-cell alive flags derived from the bitmap.
    this.grid = this.bmp.map(row =>
      Array.from({ length: this.cols }, (_, c) => row[c] && row[c] !== '.')
    );
  }

  cellBounds(r, c) {
    return { x: this.x + c * this.cell, y: this.y + r * this.cell, w: this.cell, h: this.cell };
  }

  // Locate the first solid cell along the projectile's swept path.
  projectileHit(projectile) {
    if (sweepTime(projectile, this) === null) return null;
    let first = null;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (!this.grid[r][c]) continue;
        const time = sweepTime(projectile, this.cellBounds(r, c));
        if (time !== null && (!first || time < first.time)) first = { time, r, c };
      }
    }
    return first;
  }

  // A hit removes the solid cell and a small crater around it.
  damageCell(r, c) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < this.rows && cc >= 0 && cc < this.cols) {
          if (Math.abs(dr) + Math.abs(dc) <= 1 || Math.random() < 0.5) this.grid[rr][cc] = false;
        }
      }
    }
  }

  // Descending aliens erase every solid cell they overlap, including edges.
  crush(alien) {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] && hit(alien, this.cellBounds(r, c))) this.grid[r][c] = false;
      }
    }
  }

  draw(ctx) {
    ctx.fillStyle = COLORS.player;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c]) ctx.fillRect(this.x + c * this.cell, this.y + r * this.cell, this.cell, this.cell);
      }
    }
  }
}

// ---- Invader + swarm -------------------------------------------------------

class Alien {
  constructor(typeName, col, row, x, y, pixel = CONFIG.swarm.pixel) {
    const t = ALIEN_TYPES[typeName];
    this.type = t;
    this.col = col;
    this.row = row;
    this.pixel = pixel;
    const size = spriteSize(t.frames[0], pixel);
    this.w = size.w;
    this.h = size.h;
    this.x = x;
    this.y = y;
    this.dead = false;
  }
  draw(ctx, frame) {
    drawSprite(ctx, this.type.frames[frame], this.x, this.y, this.pixel, this.type.color);
  }
}

// The swarm owns the marching formation: discrete left/right steps, dropping
// and reversing at the edges, speeding up as it thins out, and dropping bombs.
class Swarm {
  constructor(level, bottomLimit, map = 'standard') {
    if (map !== 'standard' && map !== 'map8') throw new RangeError('Unknown map.');
    const s = CONFIG.swarm;
    this.level = level;
    this.dir = 1;
    this.frame = 0;
    this.moveTimer = 0;
    this.aliens = [];

    const layout = map === 'map8' ? CONFIG.map8 : s;
    this.stepY = s.stepY * (map === 'map8' ? layout.descentMultiplier : 1);
    const rows = map === 'map8' ? layout.formation.length : s.rows;
    const cols = map === 'map8' ? layout.formation[0].length : s.cols;
    const startX = map === 'map8' ? (VIEW.W - cols * layout.cellW) / 2 : s.startX;
    const startY = s.startY + s.startYPerLevel * (level - 1);
    for (let row = 0; row < rows; row++) {
      const typeName = row === 0 ? 'squid' : row <= 2 ? 'crab' : 'octo';
      const t = ALIEN_TYPES[typeName];
      const size = spriteSize(t.frames[0], layout.pixel);
      for (let col = 0; col < cols; col++) {
        if (map === 'map8' && layout.formation[row][col] !== '#') continue;
        // Center each sprite within its grid cell.
        const cellX = startX + col * layout.cellW;
        const cellY = startY + row * layout.cellH;
        const x = cellX + (layout.cellW - size.w) / 2;
        const y = cellY + (layout.cellH - size.h) / 2;
        this.aliens.push(new Alien(typeName, col, row, x, y, layout.pixel));
      }
    }
    // Keep the formation clear of barriers at spawn.
    const overflow = this.bounds().maxY + s.stepY - bottomLimit;
    if (overflow > 0) for (const alien of this.aliens) alien.y -= overflow;
    this.total = this.aliens.length;
  }

  get count() { return this.aliens.length; }

  bounds() {
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of this.aliens) {
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x + a.w);
      maxY = Math.max(maxY, a.y + a.h);
    }
    return { minX, maxX, maxY };
  }

  stepInterval() {
    const s = CONFIG.swarm;
    const frac = this.count / this.total;
    const base = s.stepIntervalMin + (s.stepIntervalMax - s.stepIntervalMin) * frac;
    return Math.max(s.stepIntervalMin, base * Math.pow(s.levelSpeedup, this.level - 1));
  }

  bombRate() {
    const s = CONFIG.swarm;
    return Math.min(s.bombRateMax, s.bombRateBase + s.bombRatePerLevel * (this.level - 1));
  }

  maxBombs() {
    const s = CONFIG.swarm;
    return Math.min(s.maxBombsCap, s.maxBombsBase + Math.floor((this.level - 1) / s.levelsPerExtraBomb));
  }

  // Bottom-most living alien in a column (the one that can drop a bomb).
  bottomOf(col) {
    let best = null;
    for (const a of this.aliens) {
      if (a.col === col && (!best || a.y > best.y)) best = a;
    }
    return best;
  }

  // Advance one discrete step. Returns { reachedBottom, bomb } for the Game.
  update(dt, game) {
    this.moveTimer += dt;
    const interval = this.stepInterval();
    let result = { reachedBottom: false, bomb: null };

    // A time-based firing rate avoids a second difficulty spike as aliens thin.
    if (this.count > 0 && game.bombs.length < this.maxBombs() &&
        Math.random() < 1 - Math.exp(-this.bombRate() * dt)) {
      const cols = [...new Set(this.aliens.map(a => a.col))];
      const shooter = this.bottomOf(choice(cols));
      const kind = Math.random() < 0.3 ? 'wiggle' : 'straight';
      result.bomb = new Bomb(shooter.x + shooter.w / 2, shooter.y + shooter.h, this.level, kind);
    }
    if (this.moveTimer < interval) return result;
    this.moveTimer -= interval;

    const s = CONFIG.swarm;
    const b = this.bounds();
    const willHitEdge =
      (this.dir > 0 && b.maxX + s.stepX > VIEW.W - s.edgeMargin) ||
      (this.dir < 0 && b.minX - s.stepX < s.edgeMargin);

    if (willHitEdge) {
      for (const a of this.aliens) a.y += this.stepY;
      this.dir *= -1;
    } else {
      for (const a of this.aliens) a.x += this.dir * s.stepX;
    }

    this.frame ^= 1;
    Sfx.step(this.frame === 0);

    if (this.bounds().maxY >= game.players[0].y) result.reachedBottom = true;

    return result;
  }

  draw(ctx) {
    for (const a of this.aliens) a.draw(ctx, this.frame);
  }
}

// ---- Parallax starfield ----------------------------------------------------

class Starfield {
  constructor(n = 70) {
    this.stars = Array.from({ length: n }, () => ({
      x: Math.random() * VIEW.W,
      y: Math.random() * VIEW.H,
      speed: randRange(8, 36),
      bright: Math.random() < 0.3,
    }));
  }
  update(dt) {
    for (const st of this.stars) {
      st.y += st.speed * dt;
      if (st.y > VIEW.H) { st.y = 0; st.x = Math.random() * VIEW.W; }
    }
  }
  draw(ctx) {
    for (const st of this.stars) {
      ctx.fillStyle = st.bright ? COLORS.starBright : COLORS.star;
      const s = st.bright ? 2 : 1;
      ctx.fillRect(st.x, st.y, s, s);
    }
  }
}
