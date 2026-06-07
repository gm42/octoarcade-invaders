/*
 * sprites.js - pixel-art bitmaps + a tiny scaled-pixel renderer.
 *
 * Each sprite is an array of strings; any character other than '.' is a filled
 * pixel. drawSprite() paints it as scaled squares in a single flat color, which
 * keeps the whole game art dependency-free.
 */

const SPRITES = {
  // Top-row invader (squid), 8x8, two animation frames.
  squid: [
    [
      '...##...',
      '..####..',
      '.######.',
      '##.##.##',
      '########',
      '..#..#..',
      '.#.##.#.',
      '#.#..#.#',
    ],
    [
      '...##...',
      '..####..',
      '.######.',
      '##.##.##',
      '########',
      '.#.##.#.',
      '#.#..#.#',
      '.#....#.',
    ],
  ],

  // Mid-row invader (crab), 11x8.
  crab: [
    [
      '..#.....#..',
      '...#...#...',
      '..#######..',
      '.##.###.##.',
      '###########',
      '#.#######.#',
      '#.#.....#.#',
      '...##.##...',
    ],
    [
      '..#.....#..',
      '#..#...#..#',
      '#.#######.#',
      '###.###.###',
      '###########',
      '.#########.',
      '..#.....#..',
      '.#.......#.',
    ],
  ],

  // Low-row invader (octo), 12x8.
  octo: [
    [
      '....####....',
      '.##########.',
      '############',
      '###..##..###',
      '############',
      '...##..##...',
      '..##.##.##..',
      '##........##',
    ],
    [
      '....####....',
      '.##########.',
      '############',
      '###..##..###',
      '############',
      '..###..###..',
      '.##..##..##.',
      '..##....##..',
    ],
  ],

  // Player cannon, 13x8.
  cannon: [
    '......#......',
    '.....###.....',
    '.....###.....',
    '.###########.',
    '#############',
    '#############',
    '#############',
    '#############',
  ],

  // Bonus UFO, 16x7.
  ufo: [
    '.....######.....',
    '...##########...',
    '..############..',
    '.##.##.##.##.##.',
    '################',
    '..###..##..###..',
    '...#........#...',
  ],

  // Destructible barrier, 11x8 (drawn at a larger pixel scale).
  barrier: [
    '..#######..',
    '.#########.',
    '###########',
    '###########',
    '###########',
    '###.....###',
    '##.......##',
    '##.......##',
  ],
};

// Pixel dimensions of a frame at a given scale.
function spriteSize(frame, px) {
  let w = 0;
  for (const row of frame) w = Math.max(w, row.length);
  return { w: w * px, h: frame.length * px };
}

// Paint a sprite frame at (x, y) using square "pixels" of size px.
function drawSprite(ctx, frame, x, y, px, color) {
  ctx.fillStyle = color;
  for (let r = 0; r < frame.length; r++) {
    const row = frame[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '.') ctx.fillRect(x + c * px, y + r * px, px, px);
    }
  }
}
