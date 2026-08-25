import { Context, h, Session } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import {} from 'koishi-plugin-monetary'
import {} from 'koishi-plugin-markdown-to-image-service'
import { Config } from './config'
import { createGrid, DIRECTIONS, Grid, highest, isDirection, isOver, move, normalize, spawn } from './game'
import { defineTables, GameRecord, PlayerRecord } from './model'
import { render } from './render'

export { Config }
export const name = 'number-merge-game'
export const inject = {
  required: ['monetary', 'database', 'puppeteer'],
  optional: ['markdownToImage'],
}

export const usage = `## 使用

1. 安装 \`monetary\`、\`database\`、\`puppeteer\` 插件。
2. \`2048Game.加入\` 加入，\`2048Game.开始\` 开局，然后用 \`2048Game.移动 左左上\` 移动。

## 指令

| 指令 | 说明 |
| --- | --- |
| \`2048Game.加入 [投入金额]\` | 加入游戏，再次加入可改投入 |
| \`2048Game.退出\` | 退出并退款 |
| \`2048Game.开始 [网格大小]\` | 开局，网格 4 ~ 8，只有 4 记分发奖 |
| \`2048Game.移动 <方向串>\` | 上/s/u，下/x/d，左/z/l，右/y/r，可连写 |
| \`2048Game.重置\` | 强制重置本局 |
| \`2048Game.历史最高 [-a]\` | 本群/跨群最高记录 |
| \`2048Game.排行榜 [类型] [人数]\` | 胜场 / 输场 / 最高分数 / 最高数字 / 损益 |
| \`2048Game.查询玩家记录 [@某人]\` | 查询记录 |

## QQ 群

- 956758505`

const EMPTY: Grid = []

const LEADERBOARDS = {
  胜场: { field: 'win', title: '玩家胜场排行榜', unit: '次' },
  输场: { field: 'lose', title: '玩家输场排行榜', unit: '次' },
  最高分数: { field: 'best', title: '玩家最高分排行榜', unit: '分' },
  最高数字: { field: 'highestNumber', title: '玩家最高数字排行榜', unit: '' },
  损益: { field: 'moneyChange', title: '玩家损益排行榜', unit: '点' },
} as const

export function apply(ctx: Context, config: Config) {
  defineTables(ctx)

  // 同频道的移动串行处理，避免两条消息同时改棋盘
  const moving = new Set<string>()
  const pending: string[] = []

  const channelOf = (session: Session) => session.channelId || `privateChat_${session.userId}`

  async function sendMessage(session: Session, content: h.Fragment) {
    let payload = content
    if (config.isTextToImageConversionEnabled && typeof content === 'string' && ctx.markdownToImage) {
      const markdown = content.split('\n').map((line) => line.trim() ? `# ${line}` : line).join('\n')
      payload = h.image(await ctx.markdownToImage.convertToImage(markdown), `image/${config.imageType}`)
    }
    const [messageId] = await session.send(payload)
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
      gridSize: config.defaultGridSize2048,
    })
  }

  async function getRecord(userId: string, username: string): Promise<PlayerRecord> {
    const [record] = await ctx.database.get('player_2048_records', { userId })
    if (!record) {
      return ctx.database.create('player_2048_records', {
        userId, username, win: 0, lose: 0, best: 0, highestNumber: 0, moneyChange: 0,
      })
    }
    if (record.username !== username) {
      await ctx.database.set('player_2048_records', { userId }, { username })
      record.username = username
    }
    return record
  }

  const uidOf = async (session: Session, userId = session.userId) => {
    const user = await ctx.database.getUser(session.platform, userId)
    return user?.id ?? (await ctx.database.createUser(session.platform, userId, { authority: 1 })).id
  }

  async function resetGame(channelId: string) {
    await ctx.database.remove('players_in_2048_playing', { channelId })
    await ctx.database.set('game_2048_records', { channelId }, {
      progress: EMPTY,
      score: 0,
      isWon: false,
      isKeepPlaying: false,
      gameStatus: '未开始',
    })
  }

  /** 把本局所有投入原样退还。 */
  async function refund(session: Session, channelId: string) {
    const players = await ctx.database.get('players_in_2048_playing', { channelId })
    for (const player of players) {
      if (player.money > 0) await ctx.monetary.gain(await uidOf(session, player.userId), player.money)
    }
  }

  const board = (game: GameRecord, extra: { isOver?: boolean; isWon?: boolean } = {}) => render(ctx, {
    grid: game.progress,
    size: game.gridSize,
    score: game.score,
    best: game.best,
    ...extra,
  }, config.imageType)

  const image = (buffer: Uint8Array) => h.image(buffer, `image/${config.imageType}`)

  // 游戏中直接发方向字符即可移动；整条消息必须全部是方向字符，避免误伤普通聊天
  ctx.middleware(async (session, next) => {
    if (!config.isMobileCommandMiddlewarePrefixFree) return next()
    const content = session.content?.trim()
    if (!content || ![...content].every(isDirection)) return next()
    const game = await getGame(channelOf(session))
    if (game.gameStatus === '未开始') return next()
    if (!config.allowNonPlayersToMove2048Tiles) {
      const [player] = await ctx.database.get('players_in_2048_playing', {
        channelId: channelOf(session), userId: session.userId,
      })
      if (!player) return next()
    }
    await session.execute(`2048Game.移动 ${content}`)
  })

  const cmd = ctx.command('2048Game', '2048 数字合并游戏')
    .action(({ session }) => session.execute('help 2048Game'))

  cmd.subcommand('.加入 [money:natural]', '加入游戏')
    .action(async ({ session }, money = 0) => {
      const channelId = channelOf(session)
      const { userId, username } = session
      await getRecord(userId, username)

      const game = await getGame(channelId)
      const [player] = await ctx.database.get('players_in_2048_playing', { channelId, userId })

      if (game.gameStatus !== '未开始') {
        if (!player) return sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n下次记得早点加入游戏呀！`)
        return sendMessage(session, [`【@${username}】\n你已经在游戏里啦，继续玩吧~\n`, image(await board(game))])
      }

      if (money > config.maxInvestmentCurrency) {
        return sendMessage(session, `【@${username}】\n投入金额太多惹...\n最大投入金额为：【${config.maxInvestmentCurrency}】`)
      }

      const uid = await uidOf(session)
      // 改投入时先把上一笔退回来，再按新的金额扣
      if (player) {
        if (!money) return sendMessage(session, `【@${username}】\n您已经在游戏中了！\n修改金额的话...\n您得先告诉我想投多少呀~`)
        await ctx.monetary.gain(uid, player.money)
      }

      const [wallet] = await ctx.database.get('monetary', { uid, currency: 'default' })
      const balance = wallet?.value ?? 0
      if (balance < money) {
        if (player) await ctx.monetary.cost(uid, player.money)
        return sendMessage(session, `【@${username}】\n笨蛋！\n赚钱的前提是有本金呐~\n您的余额为：【${balance}】`)
      }

      await ctx.monetary.cost(uid, money)
      if (player) await ctx.database.set('players_in_2048_playing', { channelId, userId }, { money, username })
      else await ctx.database.create('players_in_2048_playing', { channelId, userId, username, money })

      const count = (await ctx.database.get('players_in_2048_playing', { channelId })).length
      if (player) {
        return sendMessage(session, `【@${username}】\n金额修改成功了呢！\n当前您投入的金额为：【${money}】\n当前玩家人数：${count} 名！`)
      }
      const tail = money
        ? `\n投入金额：【${money}】\n当前倍率为：【${config.rewardMultiplier2048Win}】！\n想要修改金额的话...\n那就再加入一次咯~`
        : `\n这个小游戏可以赚钱哦~\n当前倍率为：【${config.rewardMultiplier2048Win}】倍！\n想要投入金额的话...\n那就带上投入的金额数字！`
      return sendMessage(session, `【@${username}】\n您成功加入游戏了!${tail}\n当前玩家人数：${count} 名！`)
    })

  cmd.subcommand('.退出', '退出游戏')
    .action(async ({ session }) => {
      const channelId = channelOf(session)
      const { userId, username } = session
      const game = await getGame(channelId)
      if (game.gameStatus !== '未开始') {
        return sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n不许逃跑！要认真对待呐~`)
      }
      const [player] = await ctx.database.get('players_in_2048_playing', { channelId, userId })
      if (!player) return sendMessage(session, `【@${username}】\n诶呀，你都没加入游戏！那你可退出不了~`)

      const uid = await uidOf(session)
      await ctx.monetary.gain(uid, player.money)
      await ctx.database.remove('players_in_2048_playing', { channelId, userId })
      const [wallet] = await ctx.database.get('monetary', { uid, currency: 'default' })
      const count = (await ctx.database.get('players_in_2048_playing', { channelId })).length
      return sendMessage(session, `【@${username}】\n您要走了嘛...\n那就下次再来玩吧~再见！\n钱已经还给你啦！\n您当前的余额为：【${wallet?.value ?? 0}】\n剩余玩家人数：${count} 名！`)
    })

  cmd.subcommand('.开始 [gridSize:natural]', '开始游戏')
    .action(async ({ session }, gridSize = config.defaultGridSize2048) => {
      const channelId = channelOf(session)
      const { username } = session
      if (gridSize < 4 || gridSize > 8) {
        return sendMessage(session, `【@${username}】\n请输入有效的数字，范围应在 4 到 8 之间。`)
      }

      const game = await getGame(channelId)
      if (game.gameStatus !== '未开始') {
        return sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n难道你想开始两次？`)
      }
      const players = await ctx.database.get('players_in_2048_playing', { channelId })
      if (!players.length && !config.allowNonPlayersToMove2048Tiles) {
        return sendMessage(session, `【@${username}】\n笨蛋，还没有玩家加入游戏呢！才不给你开始~略略略~`)
      }

      // 娱乐模式不记分也不发奖，投入原样退回（只退本频道的，别动别人的局）
      if (gridSize !== 4) {
        await refund(session, channelId)
        await ctx.database.set('players_in_2048_playing', { channelId }, { money: 0 })
      }

      const progress = spawn(createGrid(gridSize), 2)
      await ctx.database.set('game_2048_records', { channelId }, {
        progress, gameStatus: '已开始', gridSize, score: 0, isWon: false, isKeepPlaying: false,
      })

      const buffer = await board({ ...game, progress, gridSize, score: 0 })
      const mode = gridSize === 4 ? '该局游戏是经典模式会记分哦~' : '该局游戏是娱乐模式不记分哦~\n投入的钱已经还给你们惹！'
      return sendMessage(session, [
        `游戏开始咯！\n${mode}\n您现在可以输入指令进行移动啦~\n`,
        image(buffer),
        '\n可选指令参数有：\n【上/s/u】\n【下/x/d】\n【左/z/l】\n【右/y/r】\n可以一次性输入多个参数哦~',
      ])
    })

  cmd.subcommand('.重置', '强制重置游戏')
    .action(async ({ session }) => {
      const channelId = channelOf(session)
      const game = await getGame(channelId)
      if (game.gameStatus === '未开始') {
        return sendMessage(session, `【@${session.username}】\n游戏还没开始呢...\n好像不用重置吧~`)
      }
      await resetGame(channelId)
      return sendMessage(session, `【@${session.username}】\n既然你想要重置游戏的话...\n那就重来咯~不过呢...\n投的钱都归我咯~！`)
    })

  cmd.subcommand('.移动 [operation:text]', '进行移动操作')
    .usage('方向可连写，如 `左左上右`。')
    .example('2048Game.移动 左左上')
    .action(async ({ session }, operation) => {
      const channelId = channelOf(session)
      const { userId, username } = session

      const game = await getGame(channelId)
      if (game.gameStatus === '未开始') return sendMessage(session, `【@${username}】\n游戏还没开始呢~`)
      if (game.isWon && !game.isKeepPlaying) {
        return sendMessage(session, `【@${username}】\n你们已经赢了哦！\n等待最后操作者做出选择吧~`)
      }

      const [player] = await ctx.database.get('players_in_2048_playing', { channelId, userId })
      if (!player) {
        if (!config.allowNonPlayersToMove2048Tiles) {
          return sendMessage(session, `【@${username}】\n没加入游戏的话~移动不了哦！`)
        }
        await getRecord(userId, username)
        await ctx.database.create('players_in_2048_playing', { channelId, userId, username, money: 0 })
      }

      if (!operation) {
        await sendMessage(session, `【@${username}】\n请输入你想要进行的【移动操作】：\n可以一次输入多个操作~\n例如：左右上下左左右`)
        operation = await session.prompt()
        if (!operation) return sendMessage(session, '输入超时。')
      }

      const steps = [...operation].map((char) => DIRECTIONS[char.toLowerCase()]).filter(Boolean)
      if (!steps.length) return sendMessage(session, `【@${username}】\n没看懂这是往哪儿走呀~\n可用：上/s/u 下/x/d 左/z/l 右/y/r`)

      if (moving.has(channelId)) return sendMessage(session, `【@${username}】\n上一步还在算呢，稍等一下下~`)
      moving.add(channelId)
      try {
        // 整串走完只写一次库：原来每合并一次就要读写一遍 game_2048_records
        let grid = normalize(game.progress)
        const spawnCount = 2 ** (game.gridSize - 4)
        let score = game.score
        for (const direction of steps) {
          const result = move(grid, direction)
          grid = result.grid
          score += result.gained
          if (result.moved) grid = spawn(grid, spawnCount)
        }

        const classic = game.gridSize === 4
        const top = highest(grid)
        const won = classic && !game.isWon && top >= 2048
        const over = isOver(grid)
        const best = classic ? Math.max(game.best, score) : game.best

        const players = await ctx.database.get('players_in_2048_playing', { channelId })
        const update: Partial<GameRecord> = { progress: grid, score, best }
        if (won) update.isWon = true
        if (classic) {
          if (top > game.highestNumber) update.highestNumber = top
          if (best > game.best) update.bestPlayers = players.map(({ userId, username }) => ({ userId, username }))
        }
        await ctx.database.set('game_2048_records', { channelId }, update)

        if (classic) {
          for (const { userId } of players) {
            const record = await getRecord(userId, username)
            const patch: Partial<PlayerRecord> = {}
            if (record.best < best) patch.best = best
            if (record.highestNumber < top) patch.highestNumber = top
            if (Object.keys(patch).length) await ctx.database.set('player_2048_records', { userId }, patch)
          }
        }

        const next = { ...game, progress: grid, score, best, isWon: game.isWon || won }
        const buffer = await board(next, { isOver: over && !won, isWon: won })

        if (over && !won) {
          if (classic && !game.isKeepPlaying) {
            for (const { userId, money } of players) {
              const record = await getRecord(userId, username)
              await ctx.database.set('player_2048_records', { userId }, {
                lose: record.lose + 1,
                moneyChange: record.moneyChange - money,
              })
            }
          }
          const settlement = game.isKeepPlaying ? await settleKeepPlaying(session, channelId, players, top) : ''
          await resetGame(channelId)
          return sendMessage(session, game.isKeepPlaying
            ? [`游戏结束了哦！`, image(buffer), `\n继续游戏后的结算结果如下：\n${settlement}\n欢迎下次再来玩哦~`]
            : ['游戏结束！\n你们输惹...\n但没关系，下次一定能行！', image(buffer)])
        }

        if (won) return await celebrate(session, channelId, players, buffer)
        return sendMessage(session, image(buffer))
      } finally {
        moving.delete(channelId)
      }
    })

  /** 继续游戏后按最高数字追加奖励，返回结算文本。 */
  async function settleKeepPlaying(session: Session, channelId: string, players: { userId: string; username: string; money: number }[], top: number) {
    if (!config.rewardHighNumbers) return ''
    const lines: string[] = []
    for (const { userId, username, money } of players) {
      const multiplier = top / 2048 - 1
      const reward = Math.floor(money * (config.incrementalRewardForHighNumbers ? config.rewardMultiplier2048Win : 1) * multiplier)
      if (reward <= 0) continue
      await ctx.monetary.gain(await uidOf(session, userId), reward)
      const record = await getRecord(userId, username)
      await ctx.database.set('player_2048_records', { userId }, { moneyChange: record.moneyChange + reward })
      lines.push(`【${username}】：【+${reward}】`)
    }
    return lines.join('\n')
  }

  /** 达成 2048：发奖，并询问最后操作者是否继续。 */
  async function celebrate(session: Session, channelId: string, players: { userId: string; username: string; money: number }[], buffer: Uint8Array) {
    const lines: string[] = []
    for (const { userId, username, money } of players) {
      const reward = Math.floor(money * config.rewardMultiplier2048Win)
      const record = await getRecord(userId, username)
      await ctx.database.set('player_2048_records', { userId }, {
        win: record.win + 1,
        moneyChange: record.moneyChange + reward,
      })
      if (reward > 0) {
        await ctx.monetary.gain(await uidOf(session, userId), reward)
        lines.push(`【${username}】：【+${reward}】`)
      }
    }
    const settlement = lines.length ? `\n结算结果如下：\n${lines.join('\n')}` : ''

    if (!config.enableContinuedPlayAfter2048Win) {
      await resetGame(channelId)
      return sendMessage(session, ['2048！\n恭喜🎉你们赢了！\n', image(buffer), `${settlement}\n下次再见哦~`])
    }

    await sendMessage(session, ['2048！\n恭喜🎉你们赢了！\n', image(buffer), settlement])
    await sendMessage(session, `【@${session.username}】\n作为赢得游戏的最后操作者！\n您有权决定是否继续游戏，请回复【继续游戏】或【到此为止】。\n不回复的话游戏会自动结束哦~`)

    if (pending.includes(channelId)) return
    pending.push(channelId)
    try {
      for (let i = 0; i < 3; i++) {
        const answer = (await session.prompt())?.trim()
        if (!answer) break
        if (answer === '继续游戏') {
          await ctx.database.set('game_2048_records', { channelId }, { isKeepPlaying: true })
          return sendMessage(session, `【@${session.username}】\n您选择了【继续游戏】！让我看看你们能走多远！`)
        }
        if (answer === '到此为止') break
      }
      await resetGame(channelId)
      return sendMessage(session, `【@${session.username}】\n该局游戏结束咯~\n那就让我们下次再见吧~`)
    } finally {
      pending.splice(pending.indexOf(channelId), 1)
    }
  }

  cmd.subcommand('.历史最高', '查看历史最高记录')
    .option('across', '-a 跨群统计')
    .action(async ({ session, options }) => {
      const record = options.across
        ? (await ctx.database.select('game_2048_records').orderBy('best', 'desc').limit(1).execute())[0]
        : await getGame(channelOf(session))
      if (!record) return sendMessage(session, '未找到任何游戏记录。')
      const names = record.bestPlayers.map((player) => `【${player.username}】`).join('\n') || '（暂无）'
      const scope = options.across ? '跨群' : ''
      return sendMessage(session, `${scope}历史最高数：【${record.highestNumber}】\n${scope}历史最高分为：【${record.best}】\n参与的玩家如下：\n${names}`)
    })

  cmd.subcommand('.排行榜 [type:string] [count:posint]', '查看排行榜')
    .usage(`可选类型：${Object.keys(LEADERBOARDS).join(' / ')}`)
    .example('2048Game.排行榜 最高分数 20')
    .action(async ({ session }, type, count = config.defaultMaxLeaderboardEntries) => {
      const entry = LEADERBOARDS[type]
      if (!entry) {
        return sendMessage(session, `请指定排行榜类型：\n${Object.keys(LEADERBOARDS).map((key, i) => `${i + 1}. ${key}`).join('\n')}\n例如：2048Game.排行榜 最高分数`)
      }
      const players = await ctx.database
        .select('player_2048_records')
        .orderBy(entry.field, 'desc')
        .limit(Math.min(count, 50))
        .execute()
      if (!players.length) return sendMessage(session, '暂无数据。')
      return sendMessage(session, [`${entry.title}：`, ...players.map((player, index) =>
        `${index + 1}. ${player.username}：${player[entry.field]} ${entry.unit}`)].join('\n'))
    })

  cmd.subcommand('.查询玩家记录 [target:user]', '查询玩家记录')
    .action(async ({ session }, target) => {
      const userId = target ? target.split(':')[1] : session.userId
      const [record] = await ctx.database.get('player_2048_records', { userId })
      if (!record) return sendMessage(session, `查询对象：${userId}\n无任何游戏记录。`)
      const { username, win, lose, moneyChange, best, highestNumber } = record
      return sendMessage(session, `查询对象：${username}\n最高数字为：${highestNumber}\n最高分数为：${best} 分\n胜场次数为：${win} 次\n输场次数为：${lose} 次\n损益为：${moneyChange} 点`)
    })
}
