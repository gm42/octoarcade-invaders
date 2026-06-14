/*
 * game.js - the Game class: state machine, simulation, collisions, scoring,
 * levels, the local leaderboard, and all on-canvas UI.
 *
 * States: 'start' | 'playing' | 'paused' | 'levelclear' | 'enterscore' | 'gameover'
 */

class LeaderboardError extends Error {}

class Game {
  constructor(ctx) {
    this.ctx = ctx;
    this.keys = new Set();
    this.starfield = new Starfield();
    this.playerCount = 1;
    this.scoreError = null;
    try {
      this.scores = this.loadScores();
    } catch (error) {
      if (!(error instanceof LeaderboardError)) throw error;
      // Unavailable scores must not stop play or be replaced with fabricated records.
      this.scores = null;
      this.scoreError = error.message;
    }
    this.resetToStart();
  }

  // ---- persistence (the "Leaderboard Service", backed by localStorage) ----

  loadScores() {
    let raw;
    try {
      raw = localStorage.getItem(CONFIG.leaderboard.key);
    } catch (error) {
      if (error.name !== 'SecurityError') throw error;
      throw new LeaderboardError('Saved scores could not be read. Allow browser storage and reload to restore the leaderboard.');
    }
    if (raw === null) return []; // No scores have been saved yet.
    let scores;
    try {
      scores = JSON.parse(raw);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      throw new LeaderboardError('Saved scores are not valid JSON. Repair or clear this site’s saved scores and reload to restore the leaderboard.');
    }
    if (!Array.isArray(scores) || scores.some(entry =>
      entry === null || typeof entry !== 'object' ||
      typeof entry.name !== 'string' || !/^[A-Z]{3}$/.test(entry.name) ||
      !Number.isSafeInteger(entry.score) || entry.score <= 0
    )) {
      throw new LeaderboardError('Saved scores contain invalid records. Repair or clear this site’s saved scores and reload to restore the leaderboard.');
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, CONFIG.leaderboard.size);
  }

  saveScores(scores) {
    try {
      localStorage.setItem(CONFIG.leaderboard.key, JSON.stringify(scores));
    } catch (error) {
      if (error.name !== 'SecurityError' && error.name !== 'QuotaExceededError') throw error;
      throw new LeaderboardError('Your score was not saved. Make browser storage available, then press Enter to retry.');
    }
  }

  // null means the saved leaderboard could not be loaded.
  get highScore() { return this.scores === null ? null : this.scores.length ? this.scores[0].score : 0; }

  get map8Unlocked() { return this.highScore !== null && this.highScore >= CONFIG.map8.unlockScore; }

  qualifies(score) {
    if (this.scores === null) return false;
    if (score <= 0) return false;
    if (this.scores.length < CONFIG.leaderboard.size) return true;
    return score > this.scores[this.scores.length - 1].score;
  }

  commitScore(name) {
    if (this.scores === null) throw new LeaderboardError('The saved leaderboard is unavailable.');
    if (typeof name !== 'string' || !/^[A-Z]{3}$/.test(name) ||
        !Number.isSafeInteger(this.score) || this.score <= 0) {
      throw new TypeError('A high score requires three uppercase initials and a positive integer score.');
    }
    const scores = [...this.scores, { name, score: this.score }]
      .sort((a, b) => b.score - a.score).slice(0, CONFIG.leaderboard.size);
    // Publish only after the write succeeds; retrying must not duplicate entries.
    this.saveScores(scores);
    this.scores = scores;
  }

  // ---- lifecycle ----------------------------------------------------------

  resetToStart() {
    this.state = 'start';
    this.map = 'standard';
    this.score = 0;
    this.level = 1;
    this.lives = CONFIG.player.lives;
    this.players = Array.from({ length: this.playerCount }, (_, i) => new Player(
      this.playerCount === 1 ? PLAYER_INPUTS.solo : i === 0 ? PLAYER_INPUTS.one : PLAYER_INPUTS.two,
      i === 0 ? COLORS.player : COLORS.beam,
      this.playerCount === 2 ? 'P' + (i + 1) : ''
    ));
    this.beams = [];
    this.bombs = [];
    this.particles = [];
    this.barriers = [];
    this.swarm = null;
    this.ufo = null;
    this.lastUfoPoints = null;
    this.ufoTimer = randRange(CONFIG.ufo.spawnMin, CONFIG.ufo.spawnMax);
    this.banner = 0; // countdown for transient overlays (level clear)
  }

  startGame(map = 'standard') {
    if (map !== 'standard' && map !== 'map8') throw new RangeError('Unknown map.');
    if (map === 'map8' && !this.map8Unlocked) throw new Error('Map 8 requires a qualifying saved high score.');
    this.resetToStart();
    this.map = map;
    this.startLevel(map === 'map8' ? 8 : 1);
    this.state = 'playing';
  }

  selectPlayers(count) {
    if (count !== 1 && count !== 2) throw new RangeError('Choose one or two players.');
    if (this.state !== 'start') throw new Error('Player selection is only available on the start screen.');
    this.playerCount = count;
    this.resetToStart();
  }

  startLevel(level) {
    this.level = level;
    this.beams = [];
    this.bombs = [];
    this.buildBarriers();
    this.swarm = new Swarm(level, this.barriers[0].y, this.map);
    for (const [i, player] of this.players.entries()) {
      player.spawnX = VIEW.W * (i + 1) / (this.players.length + 1) - player.w / 2;
      player.x = player.spawnX;
      // A fresh wave has no bombs in flight; blinking is reserved for hit respawns.
      player.invuln = 0;
    }
  }

  buildBarriers() {
    this.barriers = [];
    const probe = new Barrier(0, 0);
    const y = this.players[0].y - CONFIG.barrier.yOffset;
    const n = CONFIG.barrier.count;
    const gap = (VIEW.W - n * probe.w) / (n + 1);
    for (let i = 0; i < n; i++) {
      this.barriers.push(new Barrier(gap + i * (probe.w + gap), y));
    }
  }

  // ---- input --------------------------------------------------------------

  onKeyDown(code, key) {
    Sfx.unlock();
    switch (this.state) {
      case 'start':
        if (code === 'Enter' || code === 'Space') this.startGame();
        break;
      case 'playing':
        if (code === 'KeyP') { this.state = 'paused'; }
        break;
      case 'paused':
        if (code === 'KeyP' || code === 'Enter') this.state = 'playing';
        break;
      case 'enterscore':
        this.handleInitials(code, key);
        break;
      case 'gameover':
        if (code === 'Enter' || code === 'Space') this.resetToStart();
        break;
    }
  }

  handleInitials(code, key) {
    if (code === 'Enter') {
      this.commitScore(this.initials.join(''));
      this.scoreError = null;
      this.state = 'gameover';
      return;
    }
    if (code === 'Backspace' || code === 'ArrowLeft') {
      this.initialIdx = clamp(this.initialIdx - 1, 0, 2);
      return;
    }
    if (code === 'ArrowRight') { this.initialIdx = clamp(this.initialIdx + 1, 0, 2); return; }
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const cur = this.initials[this.initialIdx].charCodeAt(0) - 65;
      const next = (cur + (code === 'ArrowUp' ? 1 : 25)) % 26;
      this.initials[this.initialIdx] = String.fromCharCode(65 + next);
      return;
    }
    if (key && /^[a-zA-Z]$/.test(key)) {
      this.initials[this.initialIdx] = key.toUpperCase();
      this.initialIdx = clamp(this.initialIdx + 1, 0, 2);
    }
  }

  // ---- per-frame update ---------------------------------------------------

  update(dt) {
    this.starfield.update(dt);
    if ((this.state === 'playing' || this.state === 'levelclear') && this.lastUfoPoints) {
      this.lastUfoPoints.t -= dt;
      if (this.lastUfoPoints.t <= 0) this.lastUfoPoints = null;
    }
    if (this.state !== 'playing') {
      if (this.state === 'levelclear') {
        this.banner -= dt;
        this.particles.forEach(p => p.update(dt));
        this.particles = this.particles.filter(p => !p.dead);
        if (this.banner <= 0) {
          if (this.map === 'map8') this.endGame();
          else { this.startLevel(this.level + 1); this.state = 'playing'; }
        }
      }
      return;
    }

    // Player + firing.
    for (const player of this.players) {
      player.update(dt, this.keys);
      if (player.firing(this.keys) && player.canFire() &&
          this.beams.filter(beam => !beam.dead && beam.owner === player).length < CONFIG.player.maxBeams) {
        this.beams.push(player.fire());
        Sfx.shoot();
      }
    }

    this.beams.forEach(b => b.update(dt));
    this.bombs.forEach(b => b.update(dt));
    this.particles.forEach(p => p.update(dt));

    // UFO spawn + motion.
    if (this.ufo) {
      this.ufo.update(dt);
      if (this.ufo.dead) this.ufo = null;
    } else {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0) { this.ufo = new Ufo(); this.ufoTimer = randRange(CONFIG.ufo.spawnMin, CONFIG.ufo.spawnMax); }
    }

    // Swarm march.
    const r = this.swarm.update(dt, this);
    if (r.bomb) this.bombs.push(r.bomb);
    if (r.reachedBottom) { this.endGame(); return; }

    this.handleCollisions();

    // Cull dead entities.
    this.beams = this.beams.filter(b => !b.dead);
    this.bombs = this.bombs.filter(b => !b.dead);
    this.particles = this.particles.filter(p => !p.dead);
    this.swarm.aliens = this.swarm.aliens.filter(a => !a.dead);

    // A fatal collision takes precedence over clearing the final alien.
    if (this.state !== 'playing') return;

    // Level cleared?
    if (this.swarm.count === 0) {
      Sfx.level();
      this.banner = 2.0;
      this.state = 'levelclear';
    }
  }

  explode(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x, y, color));
  }

  handleCollisions() {
    // Barriers intercept beams before they can hit entities behind them.
    for (const beam of this.beams) {
      if (beam.dead) continue;
      if (this.hitBarrier(beam)) continue;

      for (const a of this.swarm.aliens) {
        if (!a.dead && hit(beam, a)) {
          a.dead = true; beam.dead = true;
          this.score += a.type.points;
          this.explode(a.x + a.w / 2, a.y + a.h / 2, a.type.color);
          Sfx.alienHit();
          break;
        }
      }
      if (beam.dead) continue;

      if (this.ufo && hit(beam, this.ufo)) {
        this.score += this.ufo.points;
        this.explode(this.ufo.x + this.ufo.w / 2, this.ufo.y + this.ufo.h / 2, COLORS.ufo, 18);
        this.lastUfoPoints = { value: this.ufo.points, x: this.ufo.x, y: this.ufo.y, t: 1.2 };
        this.ufo = null; beam.dead = true;
        Sfx.ufo();
        continue;
      }

      // A player beam can cancel an incoming bomb.
      for (const bomb of this.bombs) {
        if (!bomb.dead && hit(beam, bomb)) { bomb.dead = true; beam.dead = true; break; }
      }
    }

    // Bombs vs barriers / player.
    for (const bomb of this.bombs) {
      if (bomb.dead) continue;
      if (this.hitBarrier(bomb)) continue;
      for (const player of this.players) {
        if (player.invuln <= 0 && hit(bomb, player)) {
          bomb.dead = true;
          this.loseLife(player);
          if (this.state !== 'playing') return;
          break;
        }
      }
    }

    // Aliens grinding into the barriers erase them.
    for (const a of this.swarm.aliens) {
      if (a.dead) continue;
      for (const bar of this.barriers) {
        if (hit(a, bar)) bar.crush(a);
      }
    }
  }

  hitBarrier(projectile) {
    let first = null, barrier = null;
    for (const bar of this.barriers) {
      const contact = bar.projectileHit(projectile);
      if (contact && (!first || contact.time < first.time)) {
        first = contact;
        barrier = bar;
      }
    }
    if (!first) return false;
    barrier.damageCell(first.r, first.c);
    projectile.dead = true;
    return true;
  }

  loseLife(player) {
    this.lives--;
    this.explode(player.x + player.w / 2, player.y + player.h / 2, player.color, 16);
    Sfx.playerHit();
    if (this.lives <= 0) { this.endGame(); return; }
    player.invuln = CONFIG.player.respawnInvuln;
    player.x = player.spawnX;
  }

  endGame() {
    if (this.qualifies(this.score)) {
      this.initials = ['A', 'A', 'A'];
      this.initialIdx = 0;
      this.state = 'enterscore';
    } else {
      this.state = 'gameover';
    }
  }

  // ---- rendering ----------------------------------------------------------

  render() {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    this.starfield.draw(ctx);

    if (this.state === 'start') { this.drawStart(ctx); return; }

    // World.
    if (this.swarm) this.swarm.draw(ctx);
    if (this.ufo) this.ufo.draw(ctx);
    this.barriers.forEach(b => b.draw(ctx));
    this.beams.forEach(b => b.draw(ctx));
    this.bombs.forEach(b => b.draw(ctx));
    this.particles.forEach(p => p.draw(ctx));
    if (this.state !== 'gameover' && this.state !== 'enterscore') this.players.forEach(player => player.draw(ctx));

    this.drawUfoBonus(ctx);
    this.drawHud(ctx);

    if (this.state === 'paused') this.drawCenterOverlay(ctx, 'PAUSED', 'Press P or ENTER to resume');
    if (this.state === 'levelclear') this.drawCenterOverlay(ctx,
      this.map === 'map8' ? 'MAP 8 CLEARED' : 'LEVEL ' + this.level + ' CLEARED',
      this.map === 'map8' ? 'Bonus map complete' : 'Get ready…');
    if (this.state === 'enterscore') this.drawEnterScore(ctx);
    if (this.state === 'gameover') this.drawGameOver(ctx);
  }

  drawUfoBonus(ctx) {
    if (!this.lastUfoPoints) return;
    ctx.fillStyle = COLORS.ufo;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('+' + this.lastUfoPoints.value, this.lastUfoPoints.x + CONFIG.ufo.w / 2, this.lastUfoPoints.y);
  }

  drawHud(ctx) {
    ctx.textAlign = 'left';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('SCORE ' + this.score, 16, 24);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('HI ' + (this.highScore === null ? '?' : Math.max(this.highScore, this.score)), VIEW.W / 2, 24);
    ctx.fillStyle = COLORS.accent;
    ctx.fillText(this.map === 'map8' ? 'MAP 8' : 'LEVEL ' + this.level, VIEW.W / 2, 44);

    // Lives as little cannon icons.
    ctx.textAlign = 'right';
    ctx.fillStyle = COLORS.text;
    ctx.fillText('LIVES', VIEW.W - 16 - (this.lives * 24), 24);
    for (let i = 0; i < this.lives; i++) {
      drawSprite(ctx, SPRITES.cannon, VIEW.W - 16 - (i + 1) * 24 + 2, 12, 1.6, COLORS.player);
    }
  }

  drawTitle(ctx) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.alien.octo;
    ctx.font = 'bold 44px "Courier New", monospace';
    ctx.fillText('OCTOARCADE', VIEW.W / 2, 150);
    ctx.fillStyle = COLORS.alien.squid;
    ctx.fillText('INVADERS', VIEW.W / 2, 200);
    // Mascot row of invaders.
    drawSprite(ctx, SPRITES.crab[0], VIEW.W / 2 - 90, 230, 4, COLORS.alien.crab);
    drawSprite(ctx, SPRITES.squid[0], VIEW.W / 2 - 16, 232, 4, COLORS.alien.squid);
    drawSprite(ctx, SPRITES.octo[0], VIEW.W / 2 + 50, 230, 4, COLORS.alien.octo);
  }

  drawStart(ctx) {
    this.drawTitle(ctx);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('Press ENTER to start', VIEW.W / 2, 320);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = '14px "Courier New", monospace';
    if (this.playerCount === 1) {
      ctx.fillText('← → or A / D to move      SPACE to fire', VIEW.W / 2, 360);
      ctx.fillText('P pause', VIEW.W / 2, 382);
    } else {
      ctx.fillText('P1: A / D move · SPACE fire', VIEW.W / 2, 360);
      ctx.fillText('P2: ← / → move · ENTER fire · P pauses', VIEW.W / 2, 382);
    }

    this.drawScoreboard(ctx, 430);
  }

  drawScoreboard(ctx, y) {
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText('- LEADERBOARD -', VIEW.W / 2, y);
    ctx.font = '15px "Courier New", monospace';
    if (this.scores === null) {
      ctx.fillStyle = COLORS.textDim;
      ctx.fillText('saved scores unavailable', VIEW.W / 2, y + 28);
      return;
    }
    if (!this.scores.length) {
      ctx.fillStyle = COLORS.textDim;
      ctx.fillText('no scores yet - be the first', VIEW.W / 2, y + 28);
      return;
    }
    this.scores.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? COLORS.text : COLORS.textDim;
      const line = (i + 1) + '. ' + s.name.padEnd(3, ' ') + '   ' + String(s.score).padStart(6, ' ');
      ctx.fillText(line, VIEW.W / 2, y + 28 + i * 22);
    });
  }

  drawCenterOverlay(ctx, title, subtitle) {
    ctx.fillStyle = 'rgba(13,17,23,0.7)';
    ctx.fillRect(0, VIEW.H / 2 - 70, VIEW.W, 140);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 32px "Courier New", monospace';
    ctx.fillText(title, VIEW.W / 2, VIEW.H / 2);
    if (subtitle) {
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '16px "Courier New", monospace';
      ctx.fillText(subtitle, VIEW.W / 2, VIEW.H / 2 + 34);
    }
  }

  drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(13,17,23,0.82)';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.bomb;
    ctx.font = 'bold 44px "Courier New", monospace';
    ctx.fillText(this.map === 'map8' && this.swarm.count === 0 ? 'MAP 8 COMPLETE' : 'GAME OVER', VIEW.W / 2, 130);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText('Score ' + this.score + '   ·   ' + (this.map === 'map8' ? 'Map 8' : 'Level ' + this.level), VIEW.W / 2, 175);
    this.drawScoreboard(ctx, 240);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText('Press ENTER to play again', VIEW.W / 2, 470);
  }

  drawEnterScore(ctx) {
    ctx.fillStyle = 'rgba(13,17,23,0.85)';
    ctx.fillRect(0, 0, VIEW.W, VIEW.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.alien.squid;
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.fillText('NEW HIGH SCORE!', VIEW.W / 2, 180);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText('Score ' + this.score, VIEW.W / 2, 220);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = '15px "Courier New", monospace';
    ctx.fillText('Type initials · arrows edit · ENTER saves', VIEW.W / 2, 260);

    // Three initial slots with a cursor under the active one.
    const spacing = 56;
    const startX = VIEW.W / 2 - spacing;
    ctx.font = 'bold 48px "Courier New", monospace';
    for (let i = 0; i < 3; i++) {
      const x = startX + i * spacing;
      ctx.fillStyle = i === this.initialIdx ? COLORS.accent : COLORS.text;
      ctx.fillText(this.initials[i], x, 330);
      if (i === this.initialIdx) {
        ctx.fillRect(x - 18, 345, 36, 4);
      }
    }
  }
}
