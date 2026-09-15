import { Context } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import { Grid } from './game'
import { baseline, components, palettesOf, scheme, SHAPE } from './m3'

/** 2048 的主色取暖橙，和方块本身的升温感一致；里程碑用的第三色改取玫红。 */
const HUE = 52
const SOURCE = { tertiaryShift: -60 }
const SCHEME = scheme(HUE, false, SOURCE)
const PALETTE = palettesOf(HUE, SOURCE)

// 都落在 4dp 栅格上
const CELL = 108
const GAP = 16
const PAD = 24

export interface Board {
  grid: Grid
  size: number
  score: number
  best: number
  isOver?: boolean
  isWon?: boolean
}

/**
 * 方块配色：把数字的指数直接映射到色调板上。
 *
 * 越大的数字色调越深、彩度越高，于是一眼就能看出棋盘的「温度」，
 * 而不必去记「橙色比黄色大」这种任意的对应关系。2048 及以上换用第三色，
 * 让通关的那一块从整片暖色里跳出来。
 */
function tileStyle(value: number) {
  const exponent = Math.min(11, Math.max(1, Math.round(Math.log2(value))))
  const milestone = value >= 2048

  const ramp = milestone ? PALETTE.tertiary : PALETTE.primary
  const tone = milestone ? 46 : 94 - (exponent - 1) * 5.2
  const chroma = 8 + (exponent - 1) * 5

  const background = milestone ? ramp(tone) : PALETTE.primary(tone)
  // 深底配浅字、浅底配深字，阈值取在 M3 认为对比度开始不够的那一档
  const foreground = tone >= 62 ? PALETTE.primary(18) : PALETTE.primary(100)

  // 数字越长字号越小，保证四位数也能完整落在方块里
  const digits = String(value).length
  const size = digits <= 2 ? 52 : digits === 3 ? 44 : digits === 4 ? 34 : 26

  // Expressive 的「形状承载语义」：数值越大圆角越大，方块看起来越「饱满」
  const radius = Math.round(SHAPE.large + (exponent - 1) * 0.8)

  return { background, foreground, size, radius, chroma }
}

function styles(size: number) {
  const board = CELL * size + GAP * (size + 1)

  const positions = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) =>
      `.pos-${i + 1}-${j + 1}{transform:translate(${i * (CELL + GAP)}px,${j * (CELL + GAP)}px)}`).join('')).join('')

  // 每个档位一条规则，模板里只要写 .tile-<指数>
  const tiles = Array.from({ length: 12 }, (_, index) => {
    const value = 2 ** (index + 1)
    const { background, foreground, size: fontSize, radius } = tileStyle(value)
    return `.tile-${index + 1} .tile-face{background:${background};color:${foreground};font-size:${fontSize}px;border-radius:${radius}px}`
  }).join('')

  return `${baseline(SCHEME)}${components()}
body{display:flex;justify-content:center;padding:32px 24px 28px}
.app{width:${board}px}

.topbar{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:24px}
.brand{display:flex;flex-direction:column;gap:2px}
.brand h1{margin:0;font-size:45px;line-height:52px;font-weight:600;letter-spacing:-.5px;color:var(--md-sys-color-primary)}
.brand p{margin:0;font-size:12px;line-height:16px;letter-spacing:.4px;color:var(--md-sys-color-on-surface-variant)}

.scores{display:flex;gap:8px}
/* 比分块是一对并排的容器，当前分用主色容器抬一档，最高分退到中性容器 */
.score{
  min-width:104px;padding:10px 18px 12px;
  border-radius:${SHAPE.largeIncreased}px;
  background:var(--md-sys-color-surface-container-high);
  color:var(--md-sys-color-on-surface);
  text-align:center;
}
.score--current{background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container)}
.score .label{display:block;font-size:11px;line-height:16px;font-weight:600;letter-spacing:.5px;opacity:.72}
.score .value{display:block;font-size:28px;line-height:36px;font-weight:600;font-variant-numeric:tabular-nums}

.board{
  position:relative;box-sizing:border-box;
  width:${board}px;height:${board}px;padding:${GAP}px;
  border-radius:${SHAPE.extraExtraLarge}px;
  background:var(--md-sys-color-surface-container-high);
}
.cells,.tiles{position:absolute;inset:${GAP}px}
.cell{
  position:absolute;width:${CELL}px;height:${CELL}px;
  border-radius:${SHAPE.large}px;
  /* 空位比棋盘再暗一档，像挖出来的凹槽，落子后的方块才显得是浮在上面的 */
  background:var(--md-sys-color-surface-dim);
}
.tile{position:absolute;width:${CELL}px;height:${CELL}px}
.tile-face{
  display:flex;align-items:center;justify-content:center;
  width:100%;height:100%;
  font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.5px;
}
${tiles}${positions}

/* 结算浮层：M3 的 scrim 压暗棋盘，结果本身放进一张浮起的卡片 */
.veil{
  position:absolute;inset:0;z-index:2;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  border-radius:${SHAPE.extraExtraLarge}px;
  background:color-mix(in srgb, var(--md-sys-color-scrim) 42%, transparent);
}
.veil .panel{
  display:flex;flex-direction:column;align-items:center;gap:12px;
  padding:28px 36px;
  border-radius:${SHAPE.extraLarge}px;
  background:var(--md-sys-color-surface-container-lowest);
  box-shadow:var(--md-sys-elevation-level3);
}
.veil h2{margin:0;font-size:32px;line-height:40px;font-weight:600;color:var(--md-sys-color-on-surface)}
.veil--won h2{color:var(--md-sys-color-tertiary)}

.hint{margin-top:20px;text-align:center}`
}

export function html({ grid, size, score, best, isOver, isWon }: Board) {
  const at = (i: number) => i * (CELL + GAP)

  const cells = Array.from({ length: size * size }, (_, i) =>
    `<div class="cell" style="left:${at(i % size)}px;top:${at((i / size) | 0)}px"></div>`).join('')

  const tiles = grid.flatMap((row, x) => row.map((item, y) => {
    if (!item?.value) return ''
    const step = Math.min(12, Math.max(1, Math.round(Math.log2(item.value))))
    return `<div class="tile tile-${step} pos-${y + 1}-${x + 1}"><div class="tile-face">${item.value}</div></div>`
  })).join('')

  const veil = isOver
    ? `<div class="veil"><div class="panel"><h2>本局结束</h2><span class="m3-chip m3-chip--primary">发送 2048 再来一局</span></div></div>`
    : isWon
      ? `<div class="veil veil--won"><div class="panel"><h2>2048 达成</h2><span class="m3-chip m3-chip--tertiary">成就解锁 · 可继续挑战</span></div></div>`
      : ''

  return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="UTF-8"><title>2048</title><style>${styles(size)}</style></head>
<body>
  <div class="app">
    <div class="topbar">
      <div class="brand"><h1>2048</h1><p>滑动合并 · 抵达 2048</p></div>
      <div class="scores">
        <div class="score score--current"><span class="label">本局</span><span class="value">${score}</span></div>
        <div class="score"><span class="label">最高</span><span class="value">${best}</span></div>
      </div>
    </div>
    <div class="board">
      ${veil}
      <div class="cells">${cells}</div>
      <div class="tiles">${tiles}</div>
    </div>
    <div class="hint m3-footnote">上 / 下 / 左 / 右 · 可连续输入</div>
  </div>
</body>
</html>`
}

export async function render(ctx: Context, board: Board, type: 'png' | 'jpeg' | 'webp') {
  const width = CELL * board.size + GAP * (board.size + 1) + PAD * 2
  const page = await ctx.puppeteer.page()
  try {
    await page.setViewport({ width, height: width })
    await page.setContent(html(board))
    return await page.screenshot({ fullPage: true, type })
  } finally {
    await page.close()
  }
}
