import { Context } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import { Grid } from './game'

const CELL = 107
const GAP = 15

export interface Board {
  grid: Grid
  size: number
  score: number
  best: number
  isOver?: boolean
  isWon?: boolean
}

function styles(size: number) {
  const board = CELL * size + GAP * (size + 1)
  const positions = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      `.tile-position-${i + 1}-${j + 1}{transform:translate(${i * (CELL + GAP)}px,${j * (CELL + GAP)}px)}`).join('')).join('')

  return `
    html,body{margin:0;padding:0;background:#faf8ef;color:#776e65;font:18px "Helvetica Neue",Arial,sans-serif}
    body{margin:20px 0}
    .container{width:${board}px;margin:0 auto}
    .heading:after{content:"";display:block;clear:both}
    .scores-container{float:right;text-align:right}
    .score-container,.best-container{position:relative;display:inline-block;margin-top:8px;padding:15px 35px;height:25px;background:#bbada0;border-radius:3px;color:#fff;font-size:20px;font-weight:bold;line-height:47px;text-align:center;white-space:nowrap}
    .score-container:after,.best-container:after{position:absolute;top:10px;left:0;width:100%;color:#eee4da;font-size:13px;line-height:13px;text-align:center;text-transform:uppercase}
    .score-container:after{content:"Score"}
    .best-container:after{content:"Best"}
    .game-container{position:relative;margin-top:20px;padding:${GAP}px;width:${board}px;height:${board}px;box-sizing:border-box;background:#bbada0;border-radius:6px}
    .game-message{display:block;position:absolute;top:0;right:0;bottom:0;left:0;z-index:100;text-align:center;background:rgba(238,228,218,.5)}
    .game-message.game-won{background:rgba(237,194,46,.5);color:#f9f6f2}
    .game-message p{margin:${board / 2 - 58}px 0 10px;height:60px;font-size:60px;font-weight:bold;line-height:60px}
    .game-message .lower{display:block}
    .game-message a{display:inline-block;margin-left:9px;padding:0 20px;height:40px;background:#8f7a66;border-radius:3px;color:#f9f6f2;line-height:42px;text-decoration:none}
    .grid-container{position:absolute;z-index:1}
    .grid-row{margin-bottom:${GAP}px}
    .grid-row:last-child{margin-bottom:0}
    .grid-row:after{content:"";display:block;clear:both}
    .grid-cell{float:left;margin-right:${GAP}px;width:${CELL}px;height:${CELL}px;background:rgba(238,228,218,.35);border-radius:3px}
    .grid-cell:last-child{margin-right:0}
    .tile-container{position:absolute;z-index:2}
    .tile{position:absolute;width:${CELL}px;height:${CELL}px}
    .tile-inner{width:${CELL}px;height:${CELL}px;background:#eee4da;border-radius:3px;font-size:55px;font-weight:bold;line-height:${CELL}px;text-align:center}
    .tile-4 .tile-inner{background:#ede0c8}
    .tile-8 .tile-inner{color:#f9f6f2;background:#f2b179}
    .tile-16 .tile-inner{color:#f9f6f2;background:#f59563}
    .tile-32 .tile-inner{color:#f9f6f2;background:#f67c5f}
    .tile-64 .tile-inner{color:#f9f6f2;background:#f65e3b}
    .tile-128 .tile-inner{color:#f9f6f2;background:#edcf72;font-size:45px}
    .tile-256 .tile-inner{color:#f9f6f2;background:#edcc61;font-size:45px}
    .tile-512 .tile-inner{color:#f9f6f2;background:#edc850;font-size:45px}
    .tile-1024 .tile-inner{color:#f9f6f2;background:#edc53f;font-size:35px}
    .tile-2048 .tile-inner{color:#f9f6f2;background:#edc22e;font-size:35px}
    .tile-super .tile-inner{color:#f9f6f2;background:#3c3a32;font-size:30px}
    ${positions}`
}

function html({ grid, size, score, best, isOver, isWon }: Board) {
  const cells = Array.from({ length: size }, () =>
    `<div class="grid-row">${'<div class="grid-cell"></div>'.repeat(size)}</div>`).join('')

  const tiles = grid.flatMap((row, x) => row.map((item, y) => item?.value
    ? `<div class="tile tile-${item.value > 2048 ? 'super' : item.value} tile-position-${y + 1}-${x + 1}"><div class="tile-inner">${item.value}</div></div>`
    : '')).join('')

  const banner = isOver
    ? '<div class="game-message game-over"><p>本局结束</p><div class="lower"><a>再来一局</a></div></div>'
    : isWon
      ? '<div class="game-message game-won"><p>2048!</p><div class="lower"><a>成就解锁 · 可继续挑战</a></div></div>'
      : ''

  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>2048</title><style>${styles(size)}</style></head>
<body>
  <div class="container">
    <div class="heading"><div class="scores-container">
      <div class="score-container">${score}</div>
      <div class="best-container">${best}</div>
    </div></div>
    <div class="game-container">
      ${banner}
      <div class="grid-container">${cells}</div>
      <div class="tile-container">${tiles}</div>
    </div>
  </div>
</body>
</html>`
}

export async function render(ctx: Context, board: Board, type: 'png' | 'jpeg' | 'webp') {
  const width = CELL * board.size + GAP * (board.size + 1) + 50
  const page = await ctx.puppeteer.page()
  try {
    await page.setViewport({ width, height: width })
    await page.setContent(html(board))
    return await page.screenshot({ fullPage: true, type })
  } finally {
    await page.close()
  }
}
