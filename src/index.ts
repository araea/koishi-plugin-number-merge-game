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

发送 \`2048\` 开局。对局中可以发送上、下、左、右或 W、A、S、D，也可以连续输入。

## 指令

| 指令 | 说明 |
| --- | --- |
| \`2048\` | 开始对局；已有对局时查看棋盘 |
| \`2048.移动 <方向串>\` | 移动，例如 \`2048.移动 左左上\` |
| \`2048.战绩 [@某人]\` | 生涯战绩 |
| \`2048.排行榜 [人数]\` | 综合排行榜 |
| \`2048.结束\` | 由发起者结束当前对局 |

达到 2048 后记入战绩，并且可以继续挑战更高的数字。`

const EMPTY: Grid = []
const GRID_SIZE = 4

export function apply(ctx: Context, config: Config) {
  defineTables(ctx)
  const logger = ctx.logger(name)

  // 同频道的开局、移动和结束串行处理，避免并发消息覆盖棋盘。
  const mutating = new Set<string>()
  const channelOf = (session: Session) => session.channelId || `privateChat_${session.userId}`
  // 自动撤回：同一频道只保留最新一条，上一条延时撤回。
  const lastMessage = new Map<string, { id: string; timestamp: number }>()

  async function sendMessage(session: Session, content: h.Fragment) {
    const [messageId] = await session.send(content)
    if (!config.retractDelay || !messageId) return
    const channelId = channelOf(session)
    const previous = lastMessage.get(channelId)
    if (previous) {
      const passed = Date.now() - previous.timestamp
      // 超过两分钟的消息撤不回来，留 2 秒余量。
      if (passed < 118000) {
        ctx.setTimeout(() => {
          session.bot.deleteMessage(session.channelId, previous.id).catch((error) => {
            logger.debug('撤回消息失败：%s', error.message)
          })
        }, Math.max(0, config.retractDelay * 1000 - passed))
      }
    }
    lastMessage.set(channelId, { id: messageId, timestamp: Date.now() })
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
    if (mutating.has(channelId)) return sendMessage(session, '⏳ 本频道上一步还在处理，稍等一下。')
    mutating.add(channelId)
    try {
      const game = await getGame(channelId)
      if (game.gameStatus !== '未开始') {
        return sendMessage(session, ['💡 本频道已有一局 2048。\n', image(await board(game)), `\n${controls}`])
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
      return sendMessage(session, ['✅ 2048 开始。\n', image(await board(next)), `\n${controls}`])
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
        return sendMessage(session, '⚠️ 认不出这个方向\n可用上 / 下 / 左 / 右、WASD 或箭头，支持连续输入。')
      }
      if (mutating.has(channelId)) return sendMessage(session, '⏳ 上一步还在处理，稍等一下。')

      mutating.add(channelId)
      try {
        // 获得锁后重新读取，确保基于最新棋盘计算。
        const game = await getGame(channelId)
        if (game.gameStatus === '未开始') return sendMessage(session, '💡 本频道没有进行中的对局。\n发送「2048」开一局。')

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

        if (!moved) return sendMessage(session, ['💡 这个方向没有方块可以移动。\n', image(await board(game))])

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
            : '✅ 本局结束。'
          return sendMessage(session, [`${summary}\n发送「2048」再来一局。\n`, image(buffer)])
        }
        if (won) {
          return sendMessage(session, ['🏆 解锁生涯成就：2048！记录已保存，还可以继续挑战更高的数字。\n', image(buffer)])
        }
        return sendMessage(session, image(buffer))
      } finally {
        mutating.delete(channelId)
      }
    })

  cmd.subcommand('.战绩 [target:user]', '查看生涯战绩')
    .action(async ({ session }, target) => {
      const userId = target ? target.split(':')[1] : session.userId
      const [record] = await ctx.database.get('player_2048_records', { userId })
      if (!record) return sendMessage(session, '📋 还没有生涯战绩\n第一次达成 2048 后，这里会记下最高分与最高数字。\n发送「2048」开一局。')
      return sendMessage(session,
        `📋 ${record.username} 的 2048 战绩\n最高数字：${record.highestNumber}\n最高分数：${record.best}\n达成 2048：${record.win} 次`)
    })

  cmd.subcommand('.排行榜 [count:posint]', '查看综合排行榜')
    .action(async ({ session }, count = config.defaultMaxLeaderboardEntries) => {
      const players = await ctx.database
        .select('player_2048_records')
        .orderBy('best', 'desc')
        .limit(Math.min(count, 50))
        .execute()
      if (!players.length) return sendMessage(session, '📋 排行榜还空着\n第一个达成 2048 的人，名字会写在这里。\n发送「2048」开一局。')
      const lines = players.map((player, index) =>
        `${index + 1}. ${player.username} · ${player.best} 分 · 最高 ${player.highestNumber} · 2048 × ${player.win}`)
      return sendMessage(session, `📋 2048 综合排行榜\n${lines.join('\n')}`)
    })

  cmd.subcommand('.结束', '结束当前对局')
    .action(async ({ session }) => {
      const channelId = channelOf(session)
      if (mutating.has(channelId)) return sendMessage(session, '⏳ 上一步还在处理，稍等一下。')
      mutating.add(channelId)
      try {
        const game = await getGame(channelId)
        if (game.gameStatus === '未开始') return sendMessage(session, '💡 本频道没有进行中的对局。\n发送「2048」开一局。')
        const participants = await ctx.database
          .select('players_in_2048_playing')
          .where({ channelId })
          .orderBy('id')
          .execute()
        const owner = participants[0]
        if (owner?.userId !== session.userId) {
          return sendMessage(session, `⚠️ 这一局由 ${owner?.username || '他人'} 发起\n只有发起者可以结束它。`)
        }
        await resetGame(channelId)
        return sendMessage(session, '✅ 本局已结束。\n发送「2048」再来一局。')
      } finally {
        mutating.delete(channelId)
      }
    })
}
