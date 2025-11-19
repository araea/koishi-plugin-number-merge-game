import { Context, h, Schema } from 'koishi'
import { } from 'koishi-plugin-puppeteer'
import { } from 'koishi-plugin-monetary'
import { } from 'koishi-plugin-markdown-to-image-service'
import path from "node:path";

export const name = 'number-merge-game'
export const inject = {
  required: ['monetary', 'database', 'puppeteer'],
  optional: ['markdownToImage'],
}

export const usage = `## 使用

1. 安装 \`monetary\`，\`database\` 和 \`puppeteer\` 插件。
2. 设置指令别名。

## 特殊指令

- \`2048Game.移动 [操作方向]\`：移动操作，可选 \`上/s/u\`，\`下/x/d\`，\`左/z/l\`，\`右/y/r\`。可同时输入多个方向。
- \`2048Game.历史最高\`：查看历史最高记录，可选参数 \`-a\` 跨群查询。
- \`2048Game.查询玩家记录 [@指定用户]\`：查询玩家游戏记录信息，无参数则默认为指令发送者。

## QQ 群

- 956758505`

export interface Config {
  defaultGridSize2048: number
  maxInvestmentCurrency: number
  defaultMaxLeaderboardEntries: number
  rewardMultiplier2048Win: number
  retractDelay: number
  imageType: "png" | "jpeg" | "webp"
  isTextToImageConversionEnabled: boolean
  allowNonPlayersToMove2048Tiles: boolean
  isMobileCommandMiddlewarePrefixFree: boolean
  enableContinuedPlayAfter2048Win: boolean
  rewardHighNumbers: boolean
  incrementalRewardForHighNumbers: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    maxInvestmentCurrency: Schema.number().min(0).default(50).description(`加入游戏时可投入的最大货币数额。`),
  }).description('游戏投入设置'),
  Schema.object({
    defaultMaxLeaderboardEntries: Schema.number().min(0).default(10).description(`显示排行榜时默认的最大人数。`),
  }).description('排行榜设置'),
  Schema.object({
    rewardMultiplier2048Win: Schema.number().min(0).default(2).description(`达成 2048 赢了之后可得到的货币倍数。`),
    defaultGridSize2048: Schema.number().min(4).max(8).default(4).description(`开始 2048 游戏时默认的游戏网格大小，范围 4~8，值为 4 时为经典模式，才会记分和奖励。`),
  }).description('2048 游戏奖励设置'),
  Schema.object({
    retractDelay: Schema.number().min(0).default(0).description(`自动撤回等待的时间，单位是秒。值为 0 时不启用自动撤回功能。`),
    imageType: Schema.union(['png', 'jpeg', 'webp']).default('png').description(`发送的图片类型。`),
    isTextToImageConversionEnabled: Schema.boolean().default(false).description(`是否开启将文本转为图片的功能（可选），如需启用，需要启用 \`markdownToImage\` 服务。`),
  }).description('消息发送设置'),
  Schema.object({
    allowNonPlayersToMove2048Tiles: Schema.boolean().default(false).description(`是否允许未加入游戏的人进行 2048 游戏的移动操作（无法投入货币），开启后可以 0 玩家开始游戏。`),
    isMobileCommandMiddlewarePrefixFree: Schema.boolean().default(false).description(`是否开启移动指令无前缀的中间件。`),
    enableContinuedPlayAfter2048Win: Schema.boolean().default(true).description(`是否开启赢得2048后的继续游戏功能。`),
  }).description('2048 游戏操作设置'),
  Schema.object({
    rewardHighNumbers: Schema.boolean().default(true).description(`是否对后续的高数字进行奖励。`),
    incrementalRewardForHighNumbers: Schema.boolean().default(true).description(`高数字奖励是否依次递增。`),
  }).description('数字奖励设置'),
])

declare module 'koishi' {
  interface Tables {
    game_2048_records: GameRecord
    players_in_2048_playing: GamingPlayer
    player_2048_records: PlayerRecord
    monetary: Monetary
  }
}

interface Monetary {
  uid: number
  currency: string
  value: number
}

interface Position {
  x: number;
  y: number;
}

interface Cell {
  position: Position | null;
  value: number | null;
}

export interface GameRecord {
  id: number
  channelId: string
  gameStatus: string
  progress: Cell[][] // json
  score: number
  isWon: boolean
  isKeepPlaying: boolean
  best: number
  highestNumber: number
  bestPlayers: BestPlayer[] // json
  gridSize: number
}

export interface GamingPlayer {
  id: number
  channelId: string
  userId: string
  username: string
  money: number
}

export interface PlayerRecord {
  id: number
  userId: string
  username: string
  win: number
  lose: number
  best: number
  highestNumber: number
  moneyChange: number
}

interface BestPlayer {
  userId: string
  username: string
}

export function apply(ctx: Context, config: Config) {
  // Database extensions
  ctx.model.extend('game_2048_records', {
    id: 'unsigned',
    channelId: 'string',
    best: 'unsigned',
    gameStatus: { type: 'string', initial: '未开始' },
    score: 'unsigned',
    isKeepPlaying: { type: 'boolean', initial: false },
    isWon: { type: 'boolean', initial: false },
    bestPlayers: { type: 'json', initial: [] },
    progress: {
      type: 'json', initial: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ]
    },
    highestNumber: 'unsigned',
    gridSize: 'unsigned',
  }, {
    primary: 'id',
    autoInc: true,
  })

  ctx.model.extend('players_in_2048_playing', {
    id: 'unsigned',
    userId: 'string',
    username: 'string',
    channelId: 'string',
    money: 'unsigned',
  }, {
    primary: 'id',
    autoInc: true,
  })

  ctx.model.extend('player_2048_records', {
    id: 'unsigned',
    best: 'unsigned',
    username: 'string',
    lose: 'unsigned',
    moneyChange: 'double',
    userId: 'string',
    win: 'unsigned',
    highestNumber: 'unsigned',
  }, {
    primary: 'id',
    autoInc: true,
  })

  // Middleware for shorthand commands
  ctx.middleware(async (session, next) => {
    const { channelId, content, userId } = session;
    if (!config.isMobileCommandMiddlewarePrefixFree) {
      return await next();
    }

    const gameInfo = await getGameInfo(channelId);
    if (gameInfo.gameStatus === '未开始') {
      return await next();
    }

    if (!config.allowNonPlayersToMove2048Tiles) {
      let getPlayer = await ctx.database.get('players_in_2048_playing', { channelId, userId })
      if (getPlayer.length === 0) {
        return await next();
      }
    }

    const moveChars = ['上', 's', 'u', '下', 'x', 'd', '左', 'z', 'l', '右', 'y', 'r'];
    if (content.split('').some(char => moveChars.includes(char))) {
      await session.execute(`2048Game.移动 ${content}`);
      return;
    } else {
      return await next();
    }
  });

  ctx.command('2048Game', '2048Game指令帮助')
    .action(async ({ session }) => {
      await session.execute(`2048Game -h`)
    })

  ctx.command('2048Game.加入 [money:number]', '加入游戏')
    .action(async ({ session }, money = 0) => {
      let { channelId, userId, username, user } = session;
      if (!channelId) channelId = `privateChat_${userId}`;

      await updateUserRecord(userId, username)

      const gameInfo = await getGameInfo(channelId);
      const getPlayer = await ctx.database.get('players_in_2048_playing', { channelId, userId })

      if (gameInfo.gameStatus !== '未开始') {
        if (getPlayer.length !== 0) {
          const imageBuffer = await renderGameImage(ctx, gameInfo, config);
          return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n而且你还在游戏里面呢~！继续玩吧~\n${h.image(imageBuffer, `image/${config.imageType}`)}`);
        }
        return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n下次记得早点加入游戏呀！`);
      }

      const bestPlayers = gameInfo.bestPlayers
      await updateBestPlayerUsername(bestPlayers, channelId, userId, username)

      let isChange: boolean = false
      if (getPlayer.length !== 0) {
        if (money === 0) {
          return await sendMessage(session, `【@${username}】\n您已经在游戏中了！\n修改金额的话...\n您得先告诉我想投多少呀~`)
        } else {
          isChange = true
          // @ts-ignore
          const uid = user.id;
          await ctx.monetary.gain(uid, getPlayer[0].money);
        }
      }

      if (typeof money !== 'number' || money < 0) {
        return await sendMessage(session, `【@${username}】\n你个笨蛋！\n投个钱也要别人教你嘛~`);
      }

      // @ts-ignore
      const uid = user.id;
      let getUserMonetary = await ctx.database.get('monetary', { uid });
      if (getUserMonetary.length === 0) {
        await ctx.database.create('monetary', { uid, value: 0, currency: 'default' });
        getUserMonetary = await ctx.database.get('monetary', { uid })
      }
      const userMonetary = getUserMonetary[0]

      if (money > config.maxInvestmentCurrency) {
        return await sendMessage(session, `【@${username}】\n投入金额太多惹...\n知道你可能很有钱，哼~ \n最大投入金额为：【${config.maxInvestmentCurrency}】`);
      }

      if (userMonetary.value < money) {
        return await sendMessage(session, `【@${username}】\n笨蛋！\n赚钱的前提是有本金呐~\n您的余额为：【${userMonetary.value}】`);
      }

      await ctx.monetary.cost(uid, money);

      if (isChange) {
        await ctx.database.set('players_in_2048_playing', { channelId, userId }, { money })
      } else {
        await ctx.database.create('players_in_2048_playing', { channelId, userId, username, money });
      }

      const numberOfPlayers = (await ctx.database.get('players_in_2048_playing', { channelId })).length;
      const stringWhenMoneyIs0 = `\n这个小游戏可以赚钱哦~\n当前倍率为：【${config.rewardMultiplier2048Win}】倍！\n想要投入金额的话...\n那就带上投入的金额数字！`
      const stringWhenMoneyIsNot0 = `\n投入金额：【${money}】\n当前倍率为：【${config.rewardMultiplier2048Win}】！\n想要修改金额的话...\n那就再加入一次咯~`

      if (isChange) {
        return await sendMessage(session, `【@${username}】\n金额修改成功了呢！\n当前您投入的金额为：【${money}】\n当前玩家人数：${numberOfPlayers} 名！`);
      }
      return await sendMessage(session, `【@${username}】\n您成功加入游戏了!${money === 0 ? stringWhenMoneyIs0 : stringWhenMoneyIsNot0}\n当前玩家人数：${numberOfPlayers} 名！`);
    })

  ctx.command('2048Game.退出', '退出游戏')
    .action(async ({ session }) => {
      let { channelId, userId, username, user } = session;
      if (!channelId) channelId = `privateChat_${userId}`;

      const gameInfo = await getGameInfo(channelId);
      if (gameInfo.gameStatus !== '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n不许逃跑！要认真对待呐~`);
      }
      const getPlayer = await ctx.database.get('players_in_2048_playing', { channelId, userId })
      if (getPlayer.length === 0) {
        return await sendMessage(session, `【@${username}】\n诶呀，你都没加入游戏！那你可退出不了~`);
      }

      // @ts-ignore
      const uid = user.id;
      await ctx.monetary.gain(uid, getPlayer[0].money);
      await ctx.database.remove('players_in_2048_playing', { channelId, userId })
      const getUserMonetary = await ctx.database.get('monetary', { uid });
      const userMonetary = getUserMonetary[0]
      const numberOfPlayers = (await ctx.database.get('players_in_2048_playing', { channelId })).length;
      return await sendMessage(session, `【@${username}】\n您要走了嘛...\n那就下次再来玩吧~再见！\n钱已经还给你啦！\n您当前的余额为：【${userMonetary.value}】\n剩余玩家人数：${numberOfPlayers} 名！`);
    })

  ctx.command('2048Game.开始 [gridSize:number]', '开始游戏')
    .action(async ({ session }, gridSize = config.defaultGridSize2048) => {
      let { channelId, userId, username, platform } = session;
      if (typeof gridSize !== 'number' || gridSize < 4 || gridSize > 8) {
        return await sendMessage(session, `【@${username}】\n请输入有效的数字，范围应在 4 到 8 之间。`);
      }
      if (!channelId) channelId = `privateChat_${userId}`;

      const gameInfo = await getGameInfo(channelId);
      if (gameInfo.gameStatus !== '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n难道你想开始两次？`);
      }
      const numberOfPlayers = (await ctx.database.get('players_in_2048_playing', { channelId })).length;
      if (numberOfPlayers <= 0 && !config.allowNonPlayersToMove2048Tiles) {
        return await sendMessage(session, `【@${username}】\n笨蛋，还没有玩家加入游戏呢！才不给你开始~略略略~`);
      }

      const emptyGrid = createEmptyGrid(gridSize)
      const initialState = insertRandomElement(emptyGrid, 2);

      // Update Game info first so render works
      await ctx.database.set('game_2048_records', { channelId }, { progress: initialState, gameStatus: '已开始', gridSize })
      const updatedGameInfo = await getGameInfo(channelId);

      const imageBuffer = await renderGameImage(ctx, updatedGameInfo, config);

      if (gridSize !== 4) {
        const getUsers = await ctx.database.get('players_in_2048_playing', {})
        for (const player of getUsers) {
          const { userId, money } = player;
          const uid = (await ctx.database.getUser(platform, userId)).id
          await ctx.monetary.gain(uid, money)
        }
      }
      const gameModeMessage = gridSize === 4 ? '该局游戏是经典模式会记分哦~' : '该局游戏是娱乐模式不记分哦~\n投入的钱已经还给你们惹！';
      const instructionMessage = `您现在可以输入指令进行移动啦~\n${h.image(imageBuffer, `image/${config.imageType}`)}\n可选指令参数有：\n【上/s/u】\n【下/x/d】\n【左/z/l】\n【右/y/r】\n可以一次性输入多个参数哦~`;

      await sendMessage(session, `游戏开始咯！\n${gameModeMessage}\n${instructionMessage}`);
    })

  ctx.command('2048Game.重置', '强制重置游戏')
    .action(async ({ session }) => {
      let { channelId, userId, username } = session;
      if (!channelId) channelId = `privateChat_${userId}`;

      const gameInfo = await getGameInfo(channelId);
      if (gameInfo.gameStatus === '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏还没开始呢...\n好像不用重置吧~`);
      }
      await reset2048Game(channelId)
      return await sendMessage(session, `【@${username}】\n既然你想要重置游戏的话...\n那就重来咯~不过呢...\n投的钱都归我咯~！`);
    })

  ctx.command('2048Game.移动 [operation:text]', '进行移动操作')
    .action(async ({ session }, operation) => {
      let { channelId, userId, username, platform } = session;
      if (!channelId) channelId = `privateChat_${userId}`;

      const gameInfo = await getGameInfo(channelId);
      if (gameInfo.isWon && !gameInfo.isKeepPlaying) {
        return await sendMessage(session, `【@${username}】\n你们已经赢了哦！\n等待最后操作者做出选择吧~`);
      }
      if (gameInfo.gameStatus === '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏还没开始呢~`);
      }

      let getPlayer = await ctx.database.get('players_in_2048_playing', { channelId, userId })
      if (getPlayer.length === 0) {
        if (config.allowNonPlayersToMove2048Tiles) {
          await updateUserRecord(userId, username)
          await updateBestPlayerUsername(gameInfo.bestPlayers, channelId, userId, username)
          await ctx.database.create('players_in_2048_playing', { channelId, userId, username, money: 0 });
        } else {
          return await sendMessage(session, `【@${username}】\n没加入游戏的话~移动不了哦！`);
        }
      }

      if (!operation) {
        await sendMessage(session, `【@${username}】\n请输入你想要进行的【移动操作】：\n可以一次输入多个操作~\n例如：左右上下左左右`)
        const userInput = await session.prompt()
        if (!userInput) return await sendMessage(session, `输入超时。`);
        operation = userInput
      }

      let state = gameInfo.progress
      const originalState = JSON.parse(JSON.stringify(state)) as Cell[][];

      for (let i = 0; i < operation.length; i++) {
        let currentChar = operation[i];
        const lowerChar = currentChar.toLowerCase();
        if (['上', 's', 'u'].includes(lowerChar)) {
          await moveAndMergeUp(state, channelId)
        } else if (['下', 'x', 'd'].includes(lowerChar)) {
          await moveAndMergeDown(state, channelId)
        } else if (['左', 'z', 'l'].includes(lowerChar)) {
          await moveAndMergeLeft(state, channelId)
        } else if (['右', 'y', 'r'].includes(lowerChar)) {
          await moveAndMergeRight(state, channelId)
        }

        if (!compareStates(originalState, state)) {
          state = insertNewElements(state, Math.pow(2, gameInfo.gridSize - 4))
        }
      }

      const theHighestNumber = findHighestValue(state)
      let isWon: boolean = false
      if (gameInfo.gridSize === 4) {
        isWon = hasValue2048(state) || theHighestNumber > 2048;
        if (isWon) {
          await ctx.database.set('game_2048_records', { channelId }, { isWon: true })
        }
      }

      const isOver = isGameOver(state)
      await ctx.database.set('game_2048_records', { channelId }, { progress: state })

      // Fetch updated info for rendering
      const newGameInfo = await getGameInfo(channelId);

      // Render image using helper
      const imageBuffer = await renderGameImage(ctx, newGameInfo, config, isOver, isWon);

      const getUsers = await ctx.database.get('players_in_2048_playing', { channelId })
      const theBest = newGameInfo.best

      if (gameInfo.gridSize === 4) {
        if (theHighestNumber > gameInfo.highestNumber) {
          await ctx.database.set('game_2048_records', { channelId }, { highestNumber: theHighestNumber })
        }
        if (theBest > gameInfo.best) {
          const bestPlayers: BestPlayer[] = getUsers.map((player) => {
            const { userId, username } = player;
            return { userId, username };
          });
          await ctx.database.set('game_2048_records', { channelId }, { bestPlayers })
        }
        for (const player of getUsers) {
          const { userId } = player;
          const [userRecord] = await ctx.database.get('player_2048_records', { userId })
          if (userRecord.best < theBest) {
            await ctx.database.set('player_2048_records', { userId }, { best: theBest })
          }
          if (userRecord.highestNumber < theHighestNumber) {
            await ctx.database.set('player_2048_records', { userId }, { highestNumber: theHighestNumber })
          }
        }
      }

      // Lose condition
      if (!gameInfo.isKeepPlaying && isOver) {
        if (gameInfo.gridSize === 4) {
          for (const player of getUsers) {
            const { userId, money } = player;
            const [userRecord] = await ctx.database.get('player_2048_records', { userId })
            await ctx.database.set('player_2048_records', { userId }, {
              lose: userRecord.lose + 1,
              moneyChange: userRecord.moneyChange - money,
            })
          }
        }
        await reset2048Game(channelId)
        return await sendMessage(session, `游戏结束！\n你们输惹...\n但没关系，下次一定能行！${h.image(imageBuffer, `image/${config.imageType}`)}`)
      }

      // Game Over after Keep Playing
      if (gameInfo.isKeepPlaying && isOver) {
        for (const player of getUsers) {
          const { userId, money } = player;
          const [userRecord] = await ctx.database.get('player_2048_records', { userId })
          const highestValue = findHighestValue(state)

          if (config.rewardHighNumbers) {
            const multiplier = highestValue / 2048 - 1;
            let reward = 0;
            if (config.incrementalRewardForHighNumbers) {
              reward = money * config.rewardMultiplier2048Win * multiplier;
            } else {
              reward = money * multiplier;
            }

            const uid = (await ctx.database.getUser(platform, userId)).id
            await ctx.monetary.gain(uid, reward);
            await ctx.database.set('player_2048_records', { userId }, {
              moneyChange: userRecord.moneyChange + reward,
            })
            await ctx.database.set('players_in_2048_playing', { userId }, { money: reward })
          }
        }
        const getNewUsers = await ctx.database.get('players_in_2048_playing', { channelId })
        let settlementResult = '';
        for (const player of getNewUsers) {
          if (player.money !== 0) {
            const { username, money } = player;
            settlementResult += `【${username}】：【+${money}】\n`;
          }
        }
        await reset2048Game(channelId)
        return await sendMessage(session, `游戏结束了哦！${h.image(imageBuffer, `image/${config.imageType}`)}\n继续游戏后的结算结果如下：\n${settlementResult}\n欢迎下次再来玩哦~`)
      }

      // Win condition
      if (!gameInfo.isKeepPlaying && isWon) {
        for (const player of getUsers) {
          const { userId, money } = player;
          const [userRecord] = await ctx.database.get('player_2048_records', { userId })
          const winReward = money * config.rewardMultiplier2048Win;
          await ctx.database.set('player_2048_records', { userId }, {
            win: userRecord.win + 1,
            moneyChange: userRecord.moneyChange + winReward,
          })
          const uid = (await ctx.database.getUser(platform, userId)).id
          await ctx.monetary.gain(uid, winReward);
        }

        let settlementResult = '';
        for (const player of getUsers) {
          if (player.money !== 0) {
            const { username, money } = player;
            settlementResult += `【${username}】：【+${money * config.rewardMultiplier2048Win}】\n`;
          }
        }

        if (!config.enableContinuedPlayAfter2048Win) {
          await reset2048Game(channelId)
          return await sendMessage(session, `2048！\n恭喜🎉你们赢了！\n${h.image(imageBuffer, `image/${config.imageType}`)}\n结算结果如下：\n${settlementResult}\n下次再见哦~`)
        } else {
          await sendMessage(session, `2048！\n恭喜🎉你们赢了！\n${h.image(imageBuffer, `image/${config.imageType}`)}\n结算结果如下：\n${settlementResult}`)
        }

        await sendMessage(session, `【@${username}】\n作为赢得游戏的最后操作者！\n您有权决定是否继续游戏，请选择：\n【继续游戏】或【到此为止】\n输入次数为：【3】\n注意：不选择的话游戏会自动结束哦~`)
        let userInput = ''
        let inputNum = 0
        let isChoose: boolean = false
        while (userInput !== '继续游戏' && userInput !== '到此为止' && inputNum < 3) {
          userInput = await session.prompt()
          ++inputNum
          if (userInput === '继续游戏') {
            isChoose = true
            await ctx.database.set('game_2048_records', { channelId }, { isKeepPlaying: true })
            // Render Keep Playing State
            const keepPlayingBuffer = await renderGameImage(ctx, newGameInfo, config);
            return await sendMessage(session, `【@${username}】\n您选择了【继续游戏】！让我看看你们能走多远！\n祝你们接下来一路顺利呀~\n${h.image(keepPlayingBuffer, `image/${config.imageType}`)}`)
          } else if (userInput === '到此为止') {
            isChoose = true
            await reset2048Game(channelId)
            return await sendMessage(session, `【@${username}】\n您选择了【到此为止】！\n该局游戏结束咯~\n那就让我们下次再见吧~`)
          }
        }
        if (!isChoose) {
          await reset2048Game(channelId)
          await sendMessage(session, `最后操作者未做出选择，该局游戏结束咯~`)
        }
      }
      // Return state image
      return await sendMessage(session, `${h.image(imageBuffer, `image/${config.imageType}`)}`)
    })

  ctx.command('2048Game.历史最高', '查看历史最高记录')
    .option('across', '-a 跨群')
    .action(async ({ session, options }) => {
      let result: string = ''
      if (options.across) {
        const getGamesAcross: GameRecord[] = await ctx.database.get('game_2048_records', {})
        if (getGamesAcross.length === 0) {
          return await sendMessage(session, `未找到任何游戏记录。`)
        }
        const highestBest = getGamesAcross.reduce((prev, current) => (prev.best > current.best) ? prev : current, {} as GameRecord);
        const bestPlayersList = highestBest.bestPlayers.map(player => `【${player.username}】`).join('\n');
        result = `跨群历史最高数：【${highestBest.highestNumber}】\n跨群历史最高分为：【${highestBest.best}】\n参与的玩家如下：\n${bestPlayersList}`;
      } else {
        const gameInfo: GameRecord = await getGameInfo(session.channelId)
        const bestPlayersList = gameInfo.bestPlayers.map(player => `【${player.username}】`).join('\n');
        result = `历史最高数：【${gameInfo.highestNumber}】\n历史最高分为：【${gameInfo.best}】\n参与的玩家如下：\n${bestPlayersList}`;
      }
      return await sendMessage(session, result)
    })

  ctx.command('2048Game.排行榜 [number:number]', '查看排行榜相关指令')
    .action(async ({ session }, number = config.defaultMaxLeaderboardEntries) => {
      if (typeof number !== 'number' || isNaN(number) || number < 0) {
        return '请输入大于等于 0 的数字作为排行榜的参数。';
      }
      const leaderboards = {
        "1": `2048Game.排行榜.胜场 ${number}`,
        "2": `2048Game.排行榜.输场 ${number}`,
        "3": `2048Game.排行榜.最高分数 ${number}`,
        "4": `2048Game.排行榜.最高数字 ${number}`,
        "5": `2048Game.排行榜.损益 ${number}`,
      };

      await sendMessage(session, `当前可查看排行榜如下：\n1. 胜场排行榜\n2. 输场排行榜\n3. 最高分数排行榜\n4. 最高数字排行榜\n5. 损益排行榜\n请输入想要查看的【排行榜名】或【序号】：`);
      const userInput = await session.prompt();
      if (!userInput) return sendMessage(session, `输入超时。`);
      const selectedLeaderboard = leaderboards[userInput] || leaderboards[Object.keys(leaderboards).find(k => k.includes(userInput))]; // Fuzzy match logic if needed or strict
      if (leaderboards[userInput]) {
        await session.execute(leaderboards[userInput]);
      } else {
        // Check named keys
        if (['胜场', '输场', '最高分数', '最高数字', '损益'].some(k => userInput.includes(k))) {
           const key = Object.keys(leaderboards).find(k => k.includes(userInput) && k.length > 1);
           if(key) await session.execute(leaderboards[key]);
           else return sendMessage(session, `无效的输入。`);
        } else {
           return sendMessage(session, `无效的输入。`);
        }
      }
    });

  ['胜场', '输场', '最高分数', '最高数字', '损益'].forEach(type => {
    const fieldMap = {
      '胜场': { field: 'win', title: '玩家胜场排行榜', unit: '次' },
      '输场': { field: 'lose', title: '玩家输场排行榜', unit: '次' },
      '最高分数': { field: 'best', title: '玩家最高分排行榜', unit: '分' },
      '最高数字': { field: 'highestNumber', title: '玩家最高数字排行榜', unit: '' },
      '损益': { field: 'moneyChange', title: '玩家损益排行榜', unit: '点' }
    };
    ctx.command(`2048Game.排行榜.${type} [number:number]`, `查看${type}排行榜`)
      .action(async ({ session }, number = config.defaultMaxLeaderboardEntries) => {
        if (typeof number !== 'number' || isNaN(number) || number < 0) return '请输入大于等于 0 的数字。';
        const info = fieldMap[type];
        return await getLeaderboard(session, info.field, info.field, info.title, number, info.unit);
      });
  });

  ctx.command('2048Game.查询玩家记录 [targetUser:text]', '查询玩家记录')
    .action(async ({ session }, targetUser) => {
      let { channelId, userId, username } = session
      if (targetUser) {
        targetUser = await replaceAtTags(session, targetUser)
        const userIdRegex = /<at id="([^"]+)"(?: name="([^"]+)")?\/>/;
        const match = targetUser.match(userIdRegex);
        userId = match?.[1] ?? userId;
        username = match?.[2] ?? username;
      }
      const targetUserRecord = await ctx.database.get('player_2048_records', { userId })
      if (targetUserRecord.length === 0) {
        await ctx.database.create('player_2048_records', {
          userId, username, lose: 0, win: 0, moneyChange: 0, best: 0, highestNumber: 0
        })
        return sendMessage(session, `查询对象：${username}\n无任何游戏记录。`)
      }
      const { win, lose, moneyChange, best, highestNumber } = targetUserRecord[0]
      return sendMessage(session, `查询对象：${username}\n最高数字为：${highestNumber}\n最高分数为：${best} 分\n胜场次数为：${win} 次\n输场次数为：${lose} 次\n损益为：${moneyChange} 点`)
    });

  // --- Helpers within apply ---

  async function updateBestPlayerUsername(bestPlayers: any[], channelId, userId, username: string,) {
    if (bestPlayers.length !== 0) {
      const playerIndex = bestPlayers.findIndex(player => player.userId === userId);
      if (playerIndex !== -1) {
        if (bestPlayers[playerIndex].username !== username) {
          bestPlayers[playerIndex].username = username;
          await ctx.database.set('game_2048_records', { channelId }, { bestPlayers })
        }
      }
    }
  }

  async function updateUserRecord(userId: string, username: string): Promise<void> {
    const userRecord = await ctx.database.get('player_2048_records', { userId });
    if (userRecord.length === 0) {
      await ctx.database.create('player_2048_records', {
        userId, username, best: 0, win: 0, lose: 0, moneyChange: 0, highestNumber: 0
      });
    } else if (username !== userRecord[0].username) {
      await ctx.database.set('player_2048_records', { userId }, { username });
    }
  }

  async function getLeaderboard(session: any, type: string, sortField: string, title: string, number: number, unit: string = '') {
    const getPlayers: PlayerRecord[] = await ctx.database.get('player_2048_records', {})
    const sortedPlayers = getPlayers.sort((a, b) => b[sortField] - a[sortField])
    const topPlayers = sortedPlayers.slice(0, number)

    let result = `${title}：\n`;
    topPlayers.forEach((player, index) => {
      result += `${index + 1}. ${player.username}：${player[sortField]} ${unit}\n`
    })
    return await sendMessage(session, result);
  }

  async function reset2048Game(channelId: string): Promise<void> {
    await ctx.database.remove('players_in_2048_playing', { channelId });
    await ctx.database.set('game_2048_records', { channelId }, {
      progress: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
      ],
      score: 0,
      isWon: false,
      isKeepPlaying: false,
      gameStatus: '未开始',
    });
  }

  async function moveAndMergeUp(state: Cell[][], channelId) {
    for (let col = 0; col < state[0].length; col++) {
      let mergeIndex = -1;
      for (let row = 1; row < state.length; row++) {
        if (state[row][col]) {
          let currentRow = row;
          while (currentRow > 0) {
            if (!state[currentRow - 1][col]) {
              --state[currentRow][col].position.x
              state[currentRow - 1][col] = state[currentRow][col];
              state[currentRow][col] = null;
              currentRow--;
            } else if (state[currentRow - 1][col].value === state[currentRow][col].value && currentRow - 1 !== mergeIndex) {
              state[currentRow - 1][col].value *= 2;
              await updateScore(channelId, state[currentRow - 1][col].value);
              state[currentRow][col] = null;
              mergeIndex = currentRow - 1;
              break;
            } else {
              break;
            }
          }
        }
      }
    }
    return state;
  }

  async function moveAndMergeDown(state: Cell[][], channelId) {
    for (let col = 0; col < state[0].length; col++) {
      let mergeIndex = -1;
      for (let row = state.length - 2; row >= 0; row--) {
        if (state[row][col]) {
          let currentRow = row;
          while (currentRow < state.length - 1) {
            if (!state[currentRow + 1][col]) {
              ++state[currentRow][col].position.x
              state[currentRow + 1][col] = state[currentRow][col];
              state[currentRow][col] = null;
              currentRow++;
            } else if (state[currentRow + 1][col].value === state[currentRow][col].value && currentRow + 1 !== mergeIndex) {
              state[currentRow + 1][col].value *= 2;
              await updateScore(channelId, state[currentRow + 1][col].value);
              state[currentRow][col] = null;
              mergeIndex = currentRow + 1;
              break;
            } else {
              break;
            }
          }
        }
      }
    }
    return state;
  }

  async function moveAndMergeLeft(state: Cell[][], channelId) {
    for (let row = 0; row < state.length; row++) {
      let mergeIndex = -1;
      for (let col = 1; col < state[row].length; col++) {
        if (state[row][col]) {
          let currentCol = col;
          while (currentCol > 0) {
            if (!state[row][currentCol - 1]) {
              --state[row][currentCol].position.y
              state[row][currentCol - 1] = state[row][currentCol];
              state[row][currentCol] = null;
              currentCol--;
            } else if (state[row][currentCol - 1].value === state[row][currentCol].value && currentCol - 1 !== mergeIndex) {
              state[row][currentCol - 1].value *= 2;
              await updateScore(channelId, state[row][currentCol - 1].value);
              state[row][currentCol] = null;
              mergeIndex = currentCol - 1;
              break;
            } else {
              break;
            }
          }
        }
      }
    }
    return state;
  }

  async function moveAndMergeRight(state: Cell[][], channelId) {
    for (let row = 0; row < state.length; row++) {
      let mergeIndex = -1;
      for (let col = state[row].length - 2; col >= 0; col--) {
        if (state[row][col]) {
          let currentCol = col;
          while (currentCol < state[row].length - 1) {
            if (!state[row][currentCol + 1]) {
              ++state[row][currentCol].position.y
              state[row][currentCol + 1] = state[row][currentCol];
              state[row][currentCol] = null;
              currentCol++;
            } else if (state[row][currentCol + 1].value === state[row][currentCol].value && currentCol + 1 !== mergeIndex) {
              state[row][currentCol + 1].value *= 2;
              await updateScore(channelId, state[row][currentCol + 1].value);
              state[row][currentCol] = null;
              mergeIndex = currentCol + 1;
              break;
            } else {
              break;
            }
          }
        }
      }
    }
    return state;
  }

  async function updateScore(channelId: string, addedScore: number) {
    const gameInfo = await getGameInfo(channelId)
    const score = gameInfo.score + addedScore
    if (score > gameInfo.best && gameInfo.gridSize === 4) {
      await ctx.database.set('game_2048_records', { channelId }, { score, best: score })
    } else {
      await ctx.database.set('game_2048_records', { channelId }, { score })
    }
  }

  async function getGameInfo(channelId: string): Promise<GameRecord> {
    let gameRecord = await ctx.database.get('game_2048_records', { channelId });
    if (gameRecord.length === 0) {
      await ctx.database.create('game_2048_records', {
        channelId,
        gameStatus: '未开始',
        best: 0,
        score: 0,
        isWon: false,
        isKeepPlaying: false,
        progress: [
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null],
          [null, null, null, null],
        ],
        bestPlayers: [],
        highestNumber: 0,
      });
      gameRecord = await ctx.database.get('game_2048_records', { channelId });
    }
    return gameRecord[0];
  }

  let sentMessages = [];

  async function sendMessage(session: any, message: any): Promise<void> {
    const { bot, channelId } = session;
    let messageId;
    if (config.isTextToImageConversionEnabled && typeof message === 'string') {
      const lines = message.split('\n');
      const isOnlyImgTag = lines.length === 1 && lines[0].trim().startsWith('<img');
      if (isOnlyImgTag) {
        [messageId] = await session.send(message);
      } else {
        const modifiedMessage = lines
          .map((line) => {
            if (line.trim() !== '' && !line.includes('<img')) {
              return `# ${line}`;
            } else {
              return line + '\n';
            }
          })
          .join('\n');
        const imageBuffer = await ctx.markdownToImage.convertToImage(modifiedMessage);
        [messageId] = await session.send(h.image(imageBuffer, `image/${config.imageType}`));
      }
    } else {
      [messageId] = await session.send(message);
    }

    if (config.retractDelay === 0) return;
    sentMessages.push(messageId);

    if (sentMessages.length > 1) {
      const oldestMessageId = sentMessages.shift();
      setTimeout(async () => {
        try {
          await bot.deleteMessage(channelId, oldestMessageId);
        } catch (e) { }
      }, config.retractDelay * 1000);
    }
  }

  // --- Helper to render the game image ---
  async function renderGameImage(ctx: Context, gameInfo: GameRecord, config: Config, isOver: boolean = false, isWon: boolean = false): Promise<Buffer> {
    const { gridSize, progress, score, best, isKeepPlaying } = gameInfo;
    const htmlGridContainer = generateGridHTML(gridSize);
    const tilePositionHtml = generate2048TilePositionHtml(gridSize);
    const gameContainerHtml = generate2048GameContainerHtml(gridSize);
    const stateHtml = convertStateToHTML(progress);

    const width = 107 * gridSize + 15 * (gridSize + 1) + 50;
    const height = 107 * gridSize + 15 * (gridSize + 1) + 50;

    const gameOverHtml = `
    <div class="game-message game-over">
        <p>你们输了!</p>
        <div class="lower">
              <a class="retry-button">下次一定</a>
        </div>
    </div>`;
    const gameWonHtml = `
    <div class="game-message game-won">
        <p>你们赢了!</p>
        <div class="lower">
            <a class="keep-playing-button">继续游戏</a>
            <a class="retry-button">到此为止</a>
        </div>
    </div>`;

    const html = `${htmlHead}
    .game-container .game-message p {
        font-size: 60px;
        font-weight: bold;
        height: 60px;
        line-height: 60px;
        margin-top: ${(width - 50) / 2 - 28}px;
    }
    .container {
        width: ${width - 50}px;
        margin: 0 auto;
    }
    ${gameContainerHtml}
    ${tilePositionHtml}
    </style>
    <body>
    <div class="container">
        <div class="heading">
            <div class="scores-container">
                <div class="score-container">${score}</div>
                <div class="best-container">${best}</div>
            </div>
        </div>
        <div class="game-container">
            ${isOver ? gameOverHtml : ''}
            ${isWon && !isKeepPlaying ? gameWonHtml : ''}
            ${htmlGridContainer}
            <div class="tile-container">
                ${stateHtml}
            </div>
        </div>
    </div>
    </body>
    </html>`;

    const browser = ctx.puppeteer.browser;
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    // Using a file protocol here to potentially load local assets if configured,
    // or just to set a base URL.
    const filePath = path.join(__dirname, 'emptyHtml.html').replace(/\\/g, '/');
    await page.goto('file://' + filePath);
    await page.setViewport({ width, height });
    await page.setContent(html, { waitUntil: 'load' });
    const imageBuffer = await page.screenshot({ fullPage: true, type: config.imageType });
    await page.close();
    await context.close();
    return imageBuffer as Buffer;
  }
}

// --- Independent Utils ---

async function replaceAtTags(session, content: string): Promise<string> {
  const atRegex = /<at id="(\d+)"(?: name="([^"]*)")?\/>/g;
  let match;
  while ((match = atRegex.exec(content)) !== null) {
    const userId = match[1];
    const name = match[2];
    if (!name) {
      let guildMember;
      try {
        guildMember = await session.bot.getGuildMember(session.guildId, userId);
      } catch (error) {
        guildMember = { user: { name: '未知用户' } };
      }
      const newAtTag = `<at id="${userId}" name="${guildMember.user.name}"/>`;
      content = content.replace(match[0], newAtTag);
    }
  }
  return content;
}

function generate2048GameContainerHtml(gridSize: number): string {
  const cellSize = 107;
  const marginSize = 15;
  const containerWidth = cellSize * gridSize + marginSize * (gridSize + 1);
  const containerHeight = cellSize * gridSize + marginSize * (gridSize + 1);

  return `
    .game-container {
      margin-top: 20px;
      position: relative;
      padding: 15px;
      cursor: default;
      background: #bbada0;
      border-radius: 6px;
      width: ${containerWidth}px;
      height: ${containerHeight}px;
      box-sizing: border-box;
    }
  `;
}

function generate2048TilePositionHtml(gridSize: number): string {
  let styleString = "";
  for (let i = 1; i <= gridSize; i++) {
    for (let j = 1; j <= gridSize; j++) {
      const transformX = (i - 1) * 121;
      const transformY = (j - 1) * 121;
      const className = `.tile.tile-position-${i}-${j}`;
      styleString += `
          ${className} {
              transform: translate(${transformX}px, ${transformY}px);
          }
      `;
    }
  }
  return styleString;
}

function generateGridHTML(size: number): string {
  let gridHTML = '<div class="grid-container">\n';
  for (let i = 0; i < size; i++) {
    gridHTML += '    <div class="grid-row">\n';
    for (let j = 0; j < size; j++) {
      gridHTML += '        <div class="grid-cell"></div>\n';
    }
    gridHTML += '    </div>\n';
  }
  gridHTML += '</div>';
  return gridHTML;
}

function insertNewElements(state: Cell[][], elementCount: number): Cell[][] {
  const emptyCells: Position[] = [];
  for (let i = 0; i < state.length; i++) {
    for (let j = 0; j < state[i].length; j++) {
      if (state[i][j] === null || state[i][j].value === null || state[i][j].position === null) {
        emptyCells.push({ x: i, y: j });
      }
    }
  }

  if (emptyCells.length === 0) return state;

  const insertCount = Math.min(elementCount, emptyCells.length);
  const newState = state.map(row => [...row]);
  for (let k = 0; k < insertCount; k++) {
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    const randomPosition = emptyCells[randomIndex];
    const value = Math.random() < 0.9 ? 2 : 4;
    newState[randomPosition.x][randomPosition.y] = {
      position: { x: randomPosition.x, y: randomPosition.y },
      value: value
    };
    emptyCells.splice(randomIndex, 1);
  }
  return newState;
}

function compareStates(originalState: Cell[][], state: Cell[][]): boolean {
  if (originalState.length !== state.length || originalState[0].length !== state[0].length) {
    return false;
  }
  for (let i = 0; i < originalState.length; i++) {
    for (let j = 0; j < originalState[i].length; j++) {
      if (JSON.stringify(originalState[i][j]) !== JSON.stringify(state[i][j])) {
        return false;
      }
    }
  }
  return true;
}

function findHighestValue(state: Cell[][]): number {
  let highestValue = 0;
  for (let row of state) {
    for (let cell of row) {
      if (cell && cell.value !== null) {
        if (cell.value > highestValue) {
          highestValue = cell.value;
        }
      }
    }
  }
  return highestValue;
}

function isGameOver(state: Cell[][]): boolean {
  for (let row of state) {
    for (let cell of row) {
      if (cell === null || cell.position === null) return false;
    }
  }
  for (let i = 0; i < state.length; i++) {
    for (let j = 0; j < state[i].length; j++) {
      const currentCell = state[i][j];
      if (currentCell !== null) {
        if (j < state[i].length - 1 && currentCell.value === state[i][j + 1]?.value) return false;
        if (i < state.length - 1 && currentCell.value === state[i + 1][j]?.value) return false;
      }
    }
  }
  return true;
}

function createEmptyGrid(size: number): Cell[][] {
  const cells = [];
  for (let x = 0; x < size; x++) {
    const row = cells[x] = [];
    for (let y = 0; y < size; y++) {
      row.push(null);
    }
  }
  return cells;
}

function getRandomPosition(grid: Cell[][]): { x: number, y: number } {
  const availablePositions: { x: number, y: number }[] = [];
  grid.forEach((row, x) => {
    row.forEach((cell, y) => {
      if (cell === null) {
        availablePositions.push({ x, y });
      }
    });
  });

  if (availablePositions.length === 0) throw new Error("Grid is full");
  const randomIndex = Math.floor(Math.random() * availablePositions.length);
  return availablePositions[randomIndex];
}

function insertRandomElement(grid: Cell[][], insertNumber: number): Cell[][] {
  const newGrid: Cell[][] = grid.map(row => row.map(cell => cell !== null ? {
    position: { x: 0, y: 0 },
    value: (cell as any).value || cell
  } : null));

  for (let i = 0; i < insertNumber; i++) {
    const { x, y } = getRandomPosition(grid);
    const value = Math.random() < 0.9 ? 2 : 4;
    newGrid[x][y] = { position: { x, y }, value };
  }
  return newGrid;
}

function generateTileElement(cell: Cell) {
  if (cell !== null) {
    const { value, position } = cell;
    const tileClass = `tile tile-${value > 2048 ? 'super' : value} tile-position-${position.y + 1}-${position.x + 1}`;
    const tileInner = `<div class="tile-inner">${value}</div>`;
    return `<div class="${tileClass}">${tileInner}</div>`;
  }
  return '';
}

function convertStateToHTML(state: Cell[][]) {
  let html = '';
  state.forEach((row) => {
    row.forEach((cell) => {
      html += generateTileElement(cell);
    });
  });
  return html;
}

function hasValue2048(state: Cell[][]): boolean {
  for (let row of state) {
    for (let cell of row) {
      if (cell && cell.value === 2048) return true;
    }
  }
  return false;
}

const htmlHead = `<html lang="zh">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>2048 Game</title>
    <style>
        @font-face {
            font-family: "Clear Sans";
            url("./assets/ClearSans-Regular-webfont.woff") format("woff");
            font-weight: normal;
            font-style: normal;
        }
        @font-face {
            font-family: "Clear Sans";
            url("./assets/ClearSans-Bold-webfont.woff") format("woff");
            font-weight: 700;
            font-style: normal;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: #faf8ef;
            color: #776e65;
            font-family: "Clear Sans", "Helvetica Neue", Arial, sans-serif;
            font-size: 18px;
        }
        body { margin: 20px 0; }
        .heading:after { content: ""; display: block; clear: both; }
        .title { font-size: 50px; font-weight: bold; margin: 0; display: block; float: left; }
        .scores-container { float: right; text-align: right; }
        .score-container, .best-container {
            position: relative;
            display: inline-block;
            background: #bbada0;
            padding: 15px 35px;
            white-space: nowrap;
            font-size: 20px;
            height: 25px;
            line-height: 47px;
            font-weight: bold;
            border-radius: 3px;
            color: white;
            margin-top: 8px;
            text-align: center;
        }
        .score-container:after { content: "Score"; position: absolute; width: 100%; top: 10px; left: 0; text-transform: uppercase; font-size: 13px; line-height: 13px; text-align: center; color: #eee4da; }
        .best-container:after { content: "Best"; position: absolute; width: 100%; top: 10px; left: 0; text-transform: uppercase; font-size: 13px; line-height: 13px; text-align: center; color: #eee4da; }
        p { margin-top: 0; margin-bottom: 10px; line-height: 1.65; }
        a { text-decoration: underline; cursor: pointer; }
        .game-container .game-message {
            display: none;
            position: absolute;
            top: 0; right: 0; bottom: 0; left: 0;
            background: rgba(238, 228, 218, 0.5);
            z-index: 100;
            text-align: center;
        }
        .game-container .game-message .lower { display: block; margin-top: 59px; }
        .game-container .game-message a {
            display: inline-block;
            background: #8f7a66;
            border-radius: 3px;
            padding: 0 20px;
            text-decoration: none;
            color: #f9f6f2;
            height: 40px;
            line-height: 42px;
            margin-left: 9px;
        }
        .game-container .game-message a.keep-playing-button { display: none; }
        .game-container .game-message.game-won { background: rgba(237, 194, 46, 0.5); color: #f9f6f2; }
        .game-container .game-message.game-won a.keep-playing-button { display: inline-block; }
        .game-container .game-message.game-won, .game-container .game-message.game-over { display: block; }
        .grid-container { position: absolute; z-index: 1; }
        .grid-row { margin-bottom: 15px; }
        .grid-row:last-child { margin-bottom: 0; }
        .grid-row:after { content: ""; display: block; clear: both; }
        .grid-cell {
            width: 106.25px; height: 106.25px; margin-right: 15px; float: left; border-radius: 3px; background: rgba(238, 228, 218, 0.35);
        }
        .grid-cell:last-child { margin-right: 0; }
        .tile-container { position: absolute; z-index: 2; }
        .tile, .tile .tile-inner { width: 107px; height: 107px; line-height: 107px; }
        .tile { position: absolute; transition: 100ms ease-in-out; }
        .tile .tile-inner {
            border-radius: 3px; background: #eee4da; text-align: center; font-weight: bold; z-index: 10; font-size: 55px;
        }
        .tile.tile-2 .tile-inner { background: #eee4da; }
        .tile.tile-4 .tile-inner { background: #ede0c8; }
        .tile.tile-8 .tile-inner { color: #f9f6f2; background: #f2b179; }
        .tile.tile-16 .tile-inner { color: #f9f6f2; background: #f59563; }
        .tile.tile-32 .tile-inner { color: #f9f6f2; background: #f67c5f; }
        .tile.tile-64 .tile-inner { color: #f9f6f2; background: #f65e3b; }
        .tile.tile-128 .tile-inner { color: #f9f6f2; background: #edcf72; font-size: 45px; }
        .tile.tile-256 .tile-inner { color: #f9f6f2; background: #edcc61; font-size: 45px; }
        .tile.tile-512 .tile-inner { color: #f9f6f2; background: #edc850; font-size: 45px; }
        .tile.tile-1024 .tile-inner { color: #f9f6f2; background: #edc53f; font-size: 35px; }
        .tile.tile-2048 .tile-inner { color: #f9f6f2; background: #edc22e; font-size: 35px; }
        .tile.tile-super .tile-inner { color: #f9f6f2; background: #3c3a32; font-size: 30px; }
`
