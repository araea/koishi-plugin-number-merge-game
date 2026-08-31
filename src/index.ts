import { Context, h, Session } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import { Config } from './config'
import { createGrid, DIRECTIONS, Grid, highest, isDirection, isOver, move, normalize, spawn } from './game'
import { defineTables, GameRecord, PlayerRecord } from './model'
import { render } from './render'

export { Config }
export const name = 'number-merge-game'
export const inject = {
  required: ['database', 'puppeteer'],
}

export const usage = `## 使用

发送 \`2048\` 开局。游戏中发送 \`上、下、左、右\` 或 \`W、A、S、D\`，支持连续输入。

## 指令

| 指令 | 说明 |
| --- | --- |
| \`2048\` | 开始游戏；已有游戏时查看棋盘 |
| \`2048.移动 <方向串>\` | 显式移动，如 \`2048.移动 左左上\` |
| \`2048.记录 [@某人]\` | 查看生涯成就 |
| \`2048.排行 [人数]\` | 成就排行榜 |
| \`2048.结束\` | 发起者结束本局 |

达成 2048 记入生涯记录，之后可继续挑战更高数字。`

const EMPTY: Grid = []
const GRID_SIZE = 4

export function apply(ctx: Context, config: Config) {
  defineTables(ctx)

  // 同频道的开局、移动和结束串行处理，避免并发消息覆盖棋盘。
  const mutating = new Set<string>()
  const channelOf = (session: Session) => session.channelId || `privateChat_${session.userId}`

  async function sendMessage(session: Session, content: h.Fragment) {
    const [messageId] = await session.send(content)
    if (!config.retractDelay || !messageId) return
    ctx.setTimeout(() => {
      session.bot.deleteMessage(session.channelId, messageId).catch(() => {})
    }, config.retractDelay * 1000)
  }

  async function getGame(channelId: string): Promise<GameRecord> {
    const [record] = await ctx.database.get('game_2048_records', { channelId })
    if (record) return record
    return ctx.database.create('game_2048_records', {
      channelId,
      gameStatus: '未开始',
      score: 0,
      best: 0,
      isWon: false,
      isKeepPlaying: false,
      progress: EMPTY,
      bestPlayers: [],
      highestNumber: 0,
      gridSize: GRID_SIZE,
    })
  }

  async function getRecord(userId: string, username: string): Promise<PlayerRecord> {
    const [record] = await ctx.database.get('player_2048_records', { userId })
    if (!record) {
      return ctx.database.create('player_2048_records', {
        userId, username, win: 0, best: 0, highestNumber: 0,
      })
    }
    if (record.username !== username) {
      await ctx.database.set('player_2048_records', { userId }, { username })
      record.username = username
    }
    return record
  }

  async function addParticipant(channelId: string, userId: string, username: string) {
    const record = await getRecord(userId, username)
    const [participant] = await ctx.database.get('players_in_2048_playing', { channelId, userId })
    if (!participant) {
      await ctx.database.create('players_in_2048_playing', { channelId, userId, username })
    } else if (participant.username !== username) {
      await ctx.database.set('players_in_2048_playing', { channelId, userId }, { username })
    }
    return record
  }

  async function resetGame(channelId: string) {
    await ctx.database.remove('players_in_2048_playing', { channelId })
    await ctx.database.set('game_2048_records', { channelId }, {
      progress: EMPTY,
      score: 0,
      isWon: false,
      isKeepPlaying: false,
      gameStatus: '未开始',
      gridSize: GRID_SIZE,
    })
  }

  const board = (game: GameRecord, extra: { isOver?: boolean; isWon?: boolean } = {}) => render(ctx, {
    grid: game.progress,
    size: game.gridSize,
    score: game.score,
    best: game.best,
    ...extra,
  }, config.imageType)

  const image = (buffer: Uint8Array) => h.image(buffer, `image/${config.imageType}`)
  const controls = config.enableDirectInput
    ? '直接发送方向：上 / 下 / 左 / 右（也支持 WASD、箭头和连续输入）'
    : '发送「2048.移动 左」进行移动，方向支持连续输入。'

  async function start(session: Session) {
    const channelId = channelOf(session)
    if (mutating.has(channelId)) return sendMessage(session, '⏳ 本频道的上一步操作还在处理，请稍候。')
    mutating.add(channelId)
    try {
      const game = await getGame(channelId)
      if (game.gameStatus !== '未开始') {
        return sendMessage(session, ['🎮 本频道已有一局 2048。\n', image(await board(game)), `\n${controls}`])
      }

      await ctx.database.remove('players_in_2048_playing', { channelId })
      await addParticipant(channelId, session.userId, session.username)
      const progress = spawn(createGrid(GRID_SIZE), 2)
      const next = { ...game, progress, gridSize: GRID_SIZE, score: 0, isWon: false }
      await ctx.database.set('game_2048_records', { channelId }, {
        progress,
        gameStatus: '已开始',
        gridSize: GRID_SIZE,
        score: 0,
        isWon: false,
        isKeepPlaying: false,
      })
      return sendMessage(session, ['🎮 2048 开始。\n', image(await board(next)), `\n${controls}`])
    } finally {
      mutating.delete(channelId)
    }
  }

  // 只接管“整条消息都是方向”的内容，避免影响正常聊天。
  ctx.middleware(async (session, next) => {
    if (!config.enableDirectInput) return next()
    const content = session.content?.replace(/\s/g, '')
    if (!content || ![...content].every(isDirection)) return next()
    const game = await getGame(channelOf(session))
    if (game.gameStatus === '未开始') return next()
    await session.execute(`2048.移动 ${content}`)
  })

  const cmd = ctx.command('2048', '2048 数字合并游戏')
    .action(({ session }) => start(session))

  cmd.subcommand('.移动 <operation:text>', '移动方块')
    .usage('支持上下左右、WASD、箭头与连续输入。')
    .example('2048.移动 左左上')
    .action(async ({ session }, operation) => {
      const channelId = channelOf(session)
      const compact = operation.replace(/\s/g, '')
      if (!compact || ![...compact].every(isDirection)) {
        return sendMessage(session, '⚠️ 无法识别方向。请使用上下左右、WASD 或箭头。')
      }
      if (mutating.has(channelId)) return sendMessage(session, '⏳ 上一步还在处理，请稍候。')

      mutating.add(channelId)
      try {
        // 获得锁后重新读取，确保基于最新棋盘计算。
        const game = await getGame(channelId)
        if (game.gameStatus === '未开始') return sendMessage(session, '💡 发送「2048」即可开始游戏。')

        await addParticipant(channelId, session.userId, session.username)
        let grid = normalize(game.progress)
        let score = game.score
        let moved = false
        for (const char of compact) {
          const result = move(grid, DIRECTIONS[char.toLowerCase()])
          grid = result.grid
          score += result.gained
          if (result.moved) {
            grid = spawn(grid, 1)
            moved = true
          }
        }

        if (!moved) return sendMessage(session, ['↔️ 这个方向无法移动。\n', image(await board(game))])

        const top = highest(grid)
        const won = !game.isWon && top >= 2048
        const over = isOver(grid)
        const best = Math.max(game.best, score)
        const participants = await ctx.database.get('players_in_2048_playing', { channelId })
        const update: Partial<GameRecord> = {
          progress: grid,
          score,
          best,
          highestNumber: Math.max(game.highestNumber, top),
        }
        if (won) update.isWon = true
        if (best > game.best) {
          update.bestPlayers = participants.map(({ userId, username }) => ({ userId, username }))
        }
        await ctx.database.set('game_2048_records', { channelId }, update)

        for (const participant of participants) {
          const record = await getRecord(participant.userId, participant.username)
          const patch: Partial<PlayerRecord> = {}
          if (record.best < best) patch.best = best
          if (record.highestNumber < top) patch.highestNumber = top
          if (won) patch.win = record.win + 1
          if (Object.keys(patch).length) {
            await ctx.database.set('player_2048_records', { userId: participant.userId }, patch)
          }
        }

        const next = { ...game, ...update, isWon: game.isWon || won }
        const buffer = await board(next, { isOver: over && !won, isWon: won })
        if (over) {
          await resetGame(channelId)
          const summary = won
            ? '🏆 解锁生涯成就：2048！记录已保存，本局也已结束。'
            : '🏁 本局结束。'
          return sendMessage(session, [`${summary}发送「2048」可以立即再来一局。\n`, image(buffer)])
        }
        if (won) {
          return sendMessage(session, ['🏆 解锁生涯成就：2048！记录已保存，还可以继续挑战更高数字。\n', image(buffer)])
        }
        return sendMessage(session, image(buffer))
      } finally {
        mutating.delete(channelId)
      }
    })

  cmd.subcommand('.记录 [target:user]', '查看生涯成就')
    .action(async ({ session }, target) => {
      const userId = target ? target.split(':')[1] : session.userId
      const [record] = await ctx.database.get('player_2048_records', { userId })
      if (!record) return sendMessage(session, '📭 还没有 2048 生涯记录。')
      return sendMessage(session,
        `🏅 ${record.username} 的 2048 生涯\n最高数字：${record.highestNumber}\n最高分数：${record.best}\n达成 2048：${record.win} 次`)
    })

  cmd.subcommand('.排行 [count:posint]', '查看综合成就榜')
    .action(async ({ session }, count = config.defaultMaxLeaderboardEntries) => {
      const players = await ctx.database
        .select('player_2048_records')
        .orderBy('best', 'desc')
        .limit(Math.min(count, 50))
        .execute()
      if (!players.length) return sendMessage(session, '📭 还没有 2048 生涯记录。')
      const lines = players.map((player, index) =>
        `${index + 1}. ${player.username}｜${player.best} 分｜最高 ${player.highestNumber}｜2048 × ${player.win}`)
      return sendMessage(session, `🏆 2048 综合成就榜\n${lines.join('\n')}`)
    })

  cmd.subcommand('.结束', '结束当前游戏')
    .action(async ({ session }) => {
      const channelId = channelOf(session)
      if (mutating.has(channelId)) return sendMessage(session, '⏳ 上一步还在处理，请稍候。')
      mutating.add(channelId)
      try {
        const game = await getGame(channelId)
        if (game.gameStatus === '未开始') return sendMessage(session, '💡 当前没有进行中的游戏。')
        const participants = await ctx.database
          .select('players_in_2048_playing')
          .where({ channelId })
          .orderBy('id')
          .execute()
        const owner = participants[0]
        if (owner?.userId !== session.userId) {
          return sendMessage(session, `🔒 只有本局发起者 ${owner?.username || ''} 可以结束游戏。`)
        }
        await resetGame(channelId)
        return sendMessage(session, '✅ 本局已结束。发送「2048」可开始新游戏。')
      } finally {
        mutating.delete(channelId)
      }
    })
}
