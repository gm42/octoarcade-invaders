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

## What's in it

- A 5 × 11 formation of three alien types that marches, drops bombs, and speeds up as it thins out
- Four barriers that both sides chew through
- A bonus UFO worth 50 to 300 points
- Endless waves. Each one is faster, starts lower, and throws more bombs
- Three lives, and a local top-five leaderboard with initials

## High scores

Scores are saved in `localStorage`, so they stay on this browser. If storage is blocked or
the saved data is broken the page says so and the game keeps working without a leaderboard.
To wipe the board, delete the `octoarcade.scores` key in devtools and reload.

## License

MPL 2.0. See [LICENSE](LICENSE).
