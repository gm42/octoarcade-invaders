# 👾 OctoArcade Invaders

Defend the repo. Clear the swarm.

A browser arcade shooter on a plain HTML5 canvas. No build step, no dependencies: open
`index.html` and play.

## Play

Open `index.html` in a browser, or serve the folder so high scores stick to one origin:

```sh
python -m http.server 8000
```

Keyboard only for now.

| | |
|---|---|
| Move | `←` `→` or `A` `D` |
| Fire | `Space` or `↑` |
| Pause | `P` |
| Start / resume | `Enter` |

Pick **1 player** or **2 players** on the title screen. In co-op P1 uses A/D + Space and
P2 uses ←/→ + Enter. Score and lives are shared.

## What's in it

- A 5 × 11 formation of three alien types that marches, drops bombs, and speeds up as it thins out
- Four barriers that both sides chew through
- A bonus UFO worth 50 to 300 points
- Endless waves. Each one is faster, starts lower, and throws more bombs
- Three lives, and a local top-five leaderboard with initials
- Chiptune soundtrack and effects straight from the Web Audio API
- A hidden Map 8. Get 5,000 on the board to find it

## High scores

Scores are saved in `localStorage`, so they stay on this browser. If storage is blocked or
the saved data is broken the page says so and the game keeps working without a leaderboard.
To wipe the board, delete the `octoarcade.scores` key in devtools and reload.

## Hacking on it

```text
index.html       page shell
src/core.js      config, palette, helpers
src/sprites.js   pixel art + renderer
src/audio.js     effects and soundtrack
src/entities.js  player, projectiles, swarm, barriers, UFO, particles, stars
src/game.js      state machine, collisions, scoring, levels, leaderboard, UI
src/main.js      canvas bootstrap, input, game loop
```

Scripts are classic (non-module) so the game also runs from `file://`.

### Tests

Needs Node:

```sh
node --test tests/game.test.cjs
```

They run the game in a VM with fake storage and fixed randomness. No browser needed.

## License

MPL 2.0. See [LICENSE](LICENSE).
