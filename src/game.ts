export interface Position { x: number; y: number }
export interface Cell { position: Position | null; value: number | null }
export type Grid = Cell[][]

export type Direction = 'up' | 'down' | 'left' | 'right'

/** 一个字符对应一个方向，允许一次输入多个，如 `左左上右`。 */
export const DIRECTIONS: Record<string, Direction> = {
  上: 'up', s: 'up', u: 'up',
  下: 'down', x: 'down', d: 'down',
  左: 'left', z: 'left', l: 'left',
  右: 'right', y: 'right', r: 'right',
}

export const isDirection = (char: string) => char.toLowerCase() in DIRECTIONS

const cell = (value: number, x: number, y: number): Cell =>
  value ? { position: { x, y }, value } : null

/** 棋盘的权威状态是数值矩阵，`position` 只是渲染用的冗余字段，每次都由下标重算。 */
function toValues(grid: Grid): number[][] {
  return grid.map((row) => row.map((item) => item?.value ?? 0))
}

function toGrid(values: number[][]): Grid {
  return values.map((row, x) => row.map((value, y) => cell(value, x, y)))
}

export const createGrid = (size: number): Grid =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => null))

/** 补齐 `position`，兼容旧存档里可能已经错位的数据。 */
export const normalize = (grid: Grid): Grid => toGrid(toValues(grid))

/** 把一行牌向下标小的方向压紧并合并，返回新行与本次得分。 */
function collapse(line: number[]) {
  const tiles = line.filter(Boolean)
  const result: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) {
      const merged = tiles[i] * 2
      result.push(merged)
      gained += merged
      i++ // 每个格子一次移动里只合并一次
    } else {
      result.push(tiles[i])
    }
  }
  while (result.length < line.length) result.push(0)
  return { line: result, gained }
}

/** 按方向取出所有待压紧的序列，返回读写用的坐标表。 */
function lanes(size: number, direction: Direction): Position[][] {
  const range = Array.from({ length: size }, (_, i) => i)
  const build = (outer: number, inner: number[]): Position[] =>
    direction === 'up' || direction === 'down'
      ? inner.map((x) => ({ x, y: outer }))
      : inner.map((y) => ({ x: outer, y }))
  const order = direction === 'down' || direction === 'right' ? [...range].reverse() : range
  return range.map((outer) => build(outer, order))
}

export function move(grid: Grid, direction: Direction) {
  const values = toValues(grid)
  const size = values.length
  let gained = 0
  let moved = false

  for (const lane of lanes(size, direction)) {
    const before = lane.map(({ x, y }) => values[x][y])
    const after = collapse(before)
    gained += after.gained
    lane.forEach(({ x, y }, index) => {
      if (values[x][y] !== after.line[index]) moved = true
      values[x][y] = after.line[index]
    })
  }

  return { grid: toGrid(values), moved, gained }
}

/** 在空格里随机放入 `count` 个 2 或 4（各 90% / 10%）。 */
export function spawn(grid: Grid, count: number): Grid {
  const empty: Position[] = []
  grid.forEach((row, x) => row.forEach((item, y) => {
    if (!item?.value) empty.push({ x, y })
  }))

  const next = grid.map((row) => [...row])
  for (let i = 0; i < count && empty.length; i++) {
    const [{ x, y }] = empty.splice(Math.floor(Math.random() * empty.length), 1)
    next[x][y] = cell(Math.random() < 0.9 ? 2 : 4, x, y)
  }
  return next
}

export function highest(grid: Grid): number {
  return grid.reduce((max, row) =>
    row.reduce((rowMax, item) => Math.max(rowMax, item?.value ?? 0), max), 0)
}

/** 棋盘已满且四个方向都推不动时结束。 */
export function isOver(grid: Grid): boolean {
  const values = toValues(grid)
  if (values.some((row) => row.some((value) => !value))) return false
  for (let x = 0; x < values.length; x++) {
    for (let y = 0; y < values[x].length; y++) {
      if (values[x][y] === values[x][y + 1]) return false
      if (values[x][y] === values[x + 1]?.[y]) return false
    }
  }
  return true
}
