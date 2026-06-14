/*
 * main.js - bootstrap: wire the canvas, input, control buttons, and run the
 * fixed-timestep-ish requestAnimationFrame loop.
 */

(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const game = new Game(ctx);
  const storageError = document.getElementById('storage-error');
  const storageMessage = document.getElementById('storage-error-message');
  const playerOptions = document.getElementById('player-options');
  const soloBtn = document.getElementById('solo');
  const coopBtn = document.getElementById('coop');
  const controlHint = document.getElementById('control-hint');
  const map8Btn = document.getElementById('map8');

  function showPlayers() {
    playerOptions.hidden = game.state !== 'start';
    soloBtn.setAttribute('aria-pressed', String(game.playerCount === 1));
    coopBtn.setAttribute('aria-pressed', String(game.playerCount === 2));
    map8Btn.hidden = !game.map8Unlocked;
    controlHint.textContent = game.playerCount === 1 ?
      '← → / A D move · SPACE fire · P pause' :
      'P1: A D / SPACE · P2: ← → / ENTER · P pause · shared score and lives';
  }
  for (const [button, count] of [[soloBtn, 1], [coopBtn, 2]]) {
    button.addEventListener('click', () => { game.selectPlayers(count); showPlayers(); canvas.focus(); });
  }
  showPlayers();
  map8Btn.addEventListener('click', () => {
    Sfx.unlock();
    game.startGame('map8');
    showPlayers();
    canvas.focus();
  });

  function showScoreError() {
    storageError.hidden = game.scoreError === null;
    if (game.scoreError !== null) storageMessage.textContent = game.scoreError;
  }
  showScoreError();

  // Keys we drive the game with; prevent the page from scrolling on them.
  const TRACKED = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter']);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    if (TRACKED.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      try {
        game.onKeyDown(e.code, e.key);
      } catch (error) {
        if (!(error instanceof LeaderboardError)) throw error;
        game.scoreError = error.message;
      }
      showScoreError();
    }
    game.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => game.keys.delete(e.code));
  // Dropping focus (alt-tab, devtools) shouldn't leave a key stuck "down".
  window.addEventListener('blur', () => game.keys.clear());

  // HTML controls.
  const resetBtn = document.getElementById('reset');
  if (resetBtn) resetBtn.addEventListener('click', () => {
    game.resetToStart();
    if (game.scores !== null) game.scoreError = null;
    showScoreError();
    canvas.focus();
  });

  const soundBtn = document.getElementById('sound');
  if (soundBtn) soundBtn.addEventListener('click', () => {
    Sfx.unlock();
    soundBtn.textContent = 'Sound: ' + (Sfx.toggle() ? 'on' : 'off');
  });

  // Main loop with a clamped delta so a backgrounded tab can't fast-forward.
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    game.update(dt);
    Music.update(game.state);
    game.render();
    showPlayers();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
