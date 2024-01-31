import {Context, h, Schema} from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import {} from 'koishi-plugin-monetary'
import path from "node:path";

export const name = 'number-merge-game'
export const inject = {
  required: ['monetary', 'database', 'puppeteer'],
}
export const usage = `## 🌈 使用

- 启动必要的服务。您需要启用 \`monetary\`，\`database\` 和 \`puppeteer\` 插件，以实现货币系统，数据存储和图片生成的功能。
- 建议自行添加指令别名，以方便您和您的用户使用。

## 🌼 指令

- \`2048Game\`：显示 2048 游戏的指令帮助。
- \`2048Game.加入 [money:number]\`：加入游戏，可选参数为投入的货币数额。
- \`2048Game.退出\`：退出游戏，如果游戏未开始，会退还投入的货币。
- \`2048Game.开始 [gridSize:number]\`：开始游戏，需要至少有一个玩家加入。
- \`2048Game.重置\`：强制重置游戏，不会退还投入的货币。
- \`2048Game.移动 [operation:text]\`：进行移动操作，参数为方向，可选 \`上/s/u\`，\`下/x/d\`，\`左/z/l\`，\`右/y/r\`，也可以一次输入多个方向。
- \`2048Game.历史最高\`：查看历史最高记录，可选参数 \`-a\` 跨群查询。
- \`2048Game.排行榜 [number:number]\`：查看排行榜相关指令，可选 \`胜场\`，\`输场\`，\`最高分数\`。
- \`2048Game.查询玩家记录 [targetUser:text]\`：查询玩家游戏记录信息，可选参数为目标玩家的 at 信息，没有参数则默认为指令发送者。`

export interface Config {
  defaultGridSize2048: number
  maxInvestmentCurrency: number
  defaultMaxLeaderboardEntries: number
  rewardMultiplier2048Win: number
  imageType: "png" | "jpeg" | "webp"
  enableContinuedPlayAfter2048Win: boolean
  rewardHighNumbers: boolean
  incrementalRewardForHighNumbers: boolean
}

export const Config: Schema<Config> = Schema.object({
  maxInvestmentCurrency: Schema.number().min(0).default(50).description(`加入游戏时可投入的最大货币数额。`),
  defaultMaxLeaderboardEntries: Schema.number().min(0).default(10).description(`显示排行榜时默认的最大人数。`),
  rewardMultiplier2048Win: Schema.number().min(0).default(2).description(`达成 2048 赢了之后可得到的货币倍数。`),
  defaultGridSize2048: Schema.number().min(4).max(8).default(4).description(`开始 2048 游戏时默认的游戏网格大小，范围 4~8，值为 4 时为经典模式，才会记分和奖励。`),
  imageType: Schema.union(['png', 'jpeg', 'webp']).default('png').description(`发送的图片类型。`),
  enableContinuedPlayAfter2048Win: Schema.boolean().default(true).description(`是否开启赢得2048后的继续游戏功能。`),
  rewardHighNumbers: Schema.boolean().default(true).description(`是否对后续的高数字进行奖励。`),
  incrementalRewardForHighNumbers: Schema.boolean().default(true).description(`高数字奖励是否依次递增。`),
})

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

// 主控游戏数据表 game_2048_records ： id 群组id 游戏状态 当前游戏的进度 （json） 分数 历史最高分数 创造历史最高时参与的玩家名和玩家id
export interface GameRecord {
  id: number
  guildId: string
  gameStatus: string
  progress: any[][] // json
  score: number
  isWon: boolean
  isKeepPlaying: boolean
  best: number
  highestNumber: number
  bestPlayers: BestPlayer[] // json
  gridSize: number
}

// 游戏中玩家数据表 players_in_2048_playing ： id 群组id 用户id 用户名 money
export interface GamingPlayer {
  id: number
  guildId: string
  userId: string
  username: string
  money: number
}

// 玩家记录数据表 player_2048_records ： id 用户id 用户名 胜场 输场 历史最高分数 赚得的货币数额
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
  ctx.model.extend('game_2048_records', {
    id: 'unsigned',
    guildId: 'string',
    best: 'unsigned',
    gameStatus: {type: 'string', initial: '未开始'},
    score: 'unsigned',
    isKeepPlaying: {type: 'boolean', initial: false},
    isWon: {type: 'boolean', initial: false},
    bestPlayers: {type: 'json', initial: []},
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
    guildId: 'string',
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

  // 2048Game h*
  ctx.command('2048Game', '2048Game指令帮助')
    .action(async ({session}) => {
      await session.execute(`2048Game -h`)
    })
  // j* jr*
  ctx.command('2048Game.加入 [money:number]', '加入游戏')
    .action(async ({session}, money = 0) => {
      // 如果玩家的玩家记录表中的用户名和当前的对不上，就为他更新一下名字~ 如果他还不在玩家记录表里，那就创建一个咯
      let {guildId, userId, username, user} = session;
      if (!guildId) {
        // 在这里为私聊场景赋予一个 guildId
        guildId = `privateChat_${userId}`;
      }
      // 玩家记录表操作
      const userRecord = await ctx.database.get('player_2048_records', {userId});
      if (userRecord.length === 0) {
        await ctx.database.create('player_2048_records', {userId, username, best: 0, win: 0, lose: 0, moneyChange: 0});
      } else if (username !== userRecord[0].username) {
        await ctx.database.set('player_2048_records', {userId}, {username});
      }

      // 判断游戏是否已经开始，若开始，则不给你加入。 再输出一张当前游戏状态图片 // db*
      // 游戏记录表操作
      const gameInfo = await getGameInfo(guildId);
      const getPlayer = await ctx.database.get('players_in_2048_playing', {guildId, userId})
      if (gameInfo.gameStatus !== '未开始') {
        if (getPlayer.length !== 0) {
          const stateHtml = convertStateToHTML(gameInfo.progress)
          const htmlGridContainer = generateGridHTML(gameInfo.gridSize);
          const tilePositionHtml = generate2048TilePositionHtml(gameInfo.gridSize);
          const gameContainerHtml = generate2048GameContainerHtml(gameInfo.gridSize);
          const width = 107 * gameInfo.gridSize + 15 * (gameInfo.gridSize + 1) + 50
          const height = 107 * gameInfo.gridSize + 15 * (gameInfo.gridSize + 1) + 50
          const page = await ctx.puppeteer.page()
          await page.goto(path.join(__dirname, 'emptyHtml.html'))
          await page.setViewport({width, height})
          const html = `${htmlHead}
.container {
    width: ${width - 50}px;
    margin: 0 auto;
}
${gameContainerHtml}
${tilePositionHtml}
    </style>
</head>
<body>
<div class="container">
    <div class="heading">
        <div class="scores-container">
            <div class="score-container">${gameInfo.score}</div>
            <div class="best-container">${gameInfo.best}</div>
        </div>
    </div>
    <div class="game-container">
        ${htmlGridContainer}
        <div class="tile-container">
            ${stateHtml}
        </div>
    </div>
</div>
</body>
</html>`
          await page.setContent(html, {waitUntil: 'load'})
          const imageBuffer = await page.screenshot({fullPage: true, type: config.imageType})
          return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n而且你还在游戏里面呢~！继续玩吧~\n${h.image(imageBuffer, `image/${config.imageType}`)}`);
        }
        return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n下次记得早点加入游戏呀！`);
      }

      // 历史最高的玩家也要为他们更新用户名
      const bestPlayers = gameInfo.bestPlayers
      if (bestPlayers.length !== 0) {
        // 寻找 playerId 与 userId 相同的元素
        const playerIndex = bestPlayers.findIndex(player => player.userId === userId);
        // 如果找到了相同的 playerId
        if (playerIndex !== -1) {
          // 判断 username 和 playerName 是否一样，如果不一样，就将 playerName 改成 username
          if (bestPlayers[playerIndex].username !== username) {
            bestPlayers[playerIndex].username = username;
            await ctx.database.set('game_2048_records', {guildId}, {bestPlayers})
          }
        }
      }

      // 判断该玩家是否已经加入游戏，若已经加入，则提醒并为其修改投入货币的金额 （如果有正确输入的话）
      // 判断该玩家有没有加入过游戏
      let isChange: boolean = false
      if (getPlayer.length !== 0) {
        if (money === 0) {
          return await sendMessage(session, `【@${username}】
您已经在游戏中了！
修改金额的话...
您得先告诉我想投多少呀~
`)
        } else {
          // 修改金额 退钱 先判断投入货币的输入是否正确 正确的话
          isChange = true
          // @ts-ignore
          const uid = user.id;
          await ctx.monetary.gain(uid, getPlayer[0].money);
        }
      }
      // 校验投入货币的输入
      if (typeof money !== 'number' || money < 0) {
        return await sendMessage(session, `【@${username}】\n你个笨蛋！\n投个钱也要别人教你嘛~`);
      }
      // 判断该玩家投入的货币是否大于它的余额，如果没钱的话，就拒绝他的投入
      // @ts-ignore
      const uid = user.id;
      let getUserMonetary = await ctx.database.get('monetary', {uid});
      if (getUserMonetary.length === 0) {
        await ctx.database.create('monetary', {uid, value: 0, currency: 'default'});
        getUserMonetary = await ctx.database.get('monetary', {uid})
      }
      const userMonetary = getUserMonetary[0]
      // 投入金额过大
      if (money > config.maxInvestmentCurrency) {
        return await sendMessage(session, `【@${username}】
投入金额太多惹...
知道你可能很有钱，哼~
不过我们这个是小游戏好叭，别拿来刷钱呀！
最大投入金额为：【${config.maxInvestmentCurrency}】`);
      }

      if (userMonetary.value < money) {
        return await sendMessage(session, `【@${username}】
笨蛋！
赚钱的前提是有本金呐~
您的余额为：【${userMonetary.value}】`);
      }

      // 满足条件，则为其更新信息，提示加入游戏和游戏人数
      await ctx.monetary.cost(uid, money);
      // 如果是修改金额就先退钱，修改金额，不是的话就创建玩家
      if (isChange) {
        await ctx.database.set('players_in_2048_playing', {guildId, userId}, {money})
      } else {
        // 在游玩表中创建玩家
        await ctx.database.create('players_in_2048_playing', {guildId, userId, username, money});
      }

      // 获取当前玩家数量
      const numberOfPlayers = (await ctx.database.get('players_in_2048_playing', {guildId})).length;
      const stringWhenMoneyIs0 = `\n这个小游戏可以赚钱哦~\n当前倍率为：【${config.rewardMultiplier2048Win}】倍！
想要投入金额的话...
那就带上投入的金额数字！
再加入一次游戏吧~`
      const stringWhenMoneyIsNot0 = `\n投入金额：【${money}】
当前倍率为：【${config.rewardMultiplier2048Win}】！
想要修改金额的话...
那就再加入一次咯~
努力达到2048！
为你加油~ 祝您好运捏~`

      if (isChange) {
        return await sendMessage(session, `【@${username}】
金额修改成功了呢！
当前您投入的金额为：【${money}】
倍率为：【${config.rewardMultiplier2048Win}】！
一定要达到2048哦~加油！
当前玩家人数：${numberOfPlayers} 名！`);
      }
      return await sendMessage(session, `【@${username}】
您成功加入游戏了!${money === 0 ? stringWhenMoneyIs0 : stringWhenMoneyIsNot0}
当前玩家人数：${numberOfPlayers} 名！`);
      // .action
    })
  // q* tc*
  ctx.command('2048Game.退出', '退出游戏')
    .action(async ({session}) => {
      // 判断游戏是否已经开始，开始就无法退出 没开始判断玩家在不在游戏中，不在也无法退出 如果在游戏中，帮他退出，如果他投入钱了，那就把钱还给他
      // 判断游戏是否已经开始，若开始，则不给你退出。
      let {guildId, userId, username, user} = session;
      if (!guildId) {
        // 在这里为私聊场景赋予一个 guildId
        guildId = `privateChat_${userId}`;
      }
      // 游戏记录表操作
      const gameInfo = await getGameInfo(guildId);
      if (gameInfo.gameStatus !== '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n不许逃跑！要认真对待呐~`);
      }
      const getPlayer = await ctx.database.get('players_in_2048_playing', {guildId, userId})
      if (getPlayer.length === 0) {
        return await sendMessage(session, `【@${username}】\n诶呀，你都没加入游戏！那你可退出不了~`);
      }
      // 先还钱，再退出 0.0
      // @ts-ignore
      const uid = user.id;
      await ctx.monetary.gain(uid, getPlayer[0].money);
      await ctx.database.remove('players_in_2048_playing', {guildId, userId})
      const getUserMonetary = await ctx.database.get('monetary', {uid});
      const userMonetary = getUserMonetary[0]
      const numberOfPlayers = (await ctx.database.get('players_in_2048_playing', {guildId})).length;
      return await sendMessage(session, `【@${username}】\n您要走了嘛...\n那就下次再来玩吧~再见！\n别担心~如果你投了钱，我已经还给你啦！\n您当前的余额为：【${userMonetary.value}】\n剩余玩家人数：${numberOfPlayers} 名！`);
    })
  // s* ks*
  ctx.command('2048Game.开始 [gridSize:number]', '开始游戏')
    .action(async ({session}, gridSize = config.defaultGridSize2048) => {
      // 娱乐模式退钱给他们
      let {guildId, userId, username, user, platform} = session;
      if (typeof gridSize !== 'number' || gridSize < 4 || gridSize > 8) {
        return await sendMessage(session, `【@${username}】\n请输入有效的数字，范围应在 4 到 8 之间。`);
      }
      // 判断游戏是否已经开始，没开始才能开始 判断玩家是否足够1，没玩家不开始 没开始且有玩家，那就开始吧，修改游戏状态并返回一张游戏初始状态图
      if (!guildId) {
        // 在这里为私聊场景赋予一个 guildId
        guildId = `privateChat_${userId}`;
      }
      // 游戏记录表操作
      const gameInfo = await getGameInfo(guildId);
      if (gameInfo.gameStatus !== '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏已经开始了哦~\n难道你想开始两次？\n那可不行！`);
      }
      const numberOfPlayers = (await ctx.database.get('players_in_2048_playing', {guildId})).length;
      if (numberOfPlayers <= 0) {
        return await sendMessage(session, `【@${username}】\n笨蛋，还没有玩家加入游戏呢！才不给你开始~略略略~`);
      }
      const emptyGrid = createEmptyGrid(gridSize)
      const initialState = insertRandomElement(emptyGrid, 2);
      const htmlGridContainer = generateGridHTML(gridSize);
      const tilePositionHtml = generate2048TilePositionHtml(gridSize);
      const gameContainerHtml = generate2048GameContainerHtml(gridSize);
      const width = 107 * gridSize + 15 * (gridSize + 1) + 50
      const height = 107 * gridSize + 15 * (gridSize + 1) + 50
      await ctx.database.set('game_2048_records', {guildId}, {progress: initialState, gameStatus: '已开始', gridSize})
      // console.log(JSON.stringify(initialState, null, 2));
      const stateHtml = convertStateToHTML(initialState)
      const page = await ctx.puppeteer.page()
      await page.goto(path.join(__dirname, 'emptyHtml.html'))
      await page.setViewport({width, height})
      // const zs = `        <div class="game-message game-over">
      //       <p>Game Over!</p>
      //       <div class="lower">
      //           <a class="keep-playing-button">Keep going</a>
      //           <a class="retry-button">Try again</a>
      //       </div>
      //   </div>`
      const html = `${htmlHead}
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
            <div class="score-container">0</div>
            <div class="best-container">${gameInfo.best}</div>
        </div>
    </div>
    <div class="game-container">
        ${htmlGridContainer}

        <div class="tile-container">
            ${stateHtml}
        </div>
    </div>
</div>
</body>
</html>`
      await page.setContent(html, {waitUntil: 'load'})
      const imageBuffer = await page.screenshot({fullPage: true, type: config.imageType})
      if (gridSize !== 4) {
        const getUsers = await ctx.database.get('players_in_2048_playing', {})
        for (const player of getUsers) {
          const {userId, username, money} = player;
          const uid = (await ctx.database.getUser(platform, userId)).id
          await ctx.monetary.gain(uid, money)
        }
      }
      const gameModeMessage = gridSize === 4 ? '该局游戏是经典模式会记分哦~' : '该局游戏是娱乐模式不记分哦~\n投入的钱已经还给你们惹！';

      const instructionMessage = `您现在可以输入指令进行移动啦~\n${h.image(imageBuffer, `image/${config.imageType}`)}\n可选指令参数有：\n【上/s/u】\n【下/x/d】\n【左/z/l】\n【右/y/r】\n可以一次性输入多个参数哦~\n指令使用示例：\n【移动指令名】 上下左右sxzyudlr`;

      await sendMessage(session, `游戏开始咯！\n${gameModeMessage}\n${instructionMessage}`);
    })
  // r* ck*
  ctx.command('2048Game.重置', '强制重置游戏')
    .action(async ({session}) => {
      // 游戏开了再重开 清空游戏中玩家 重置游戏状态 不退钱
      let {guildId, userId, username, user} = session;
      if (!guildId) {
        // 在这里为私聊场景赋予一个 guildId
        guildId = `privateChat_${userId}`;
      }
      // 游戏记录表操作
      const gameInfo = await getGameInfo(guildId);
      if (gameInfo.gameStatus === '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏还没开始呢...\n好像不用重置吧~`);
      }
      await reset2048Game(guildId)
      return await sendMessage(session, `【@${username}】\n既然你想要重置游戏的话...\n那就重来咯~不过呢...\n投的钱都归我咯~！`);
    })
  // yd*
  ctx.command('2048Game.移动 [operation:text]', '进行移动操作')
    .action(async ({session}, operation) => {
      // 游戏是开始的 玩家是加入的 操作输入是正确的 操作是可行的
      let {guildId, userId, username, user, platform} = session;
      if (!guildId) {
        // 在这里为私聊场景赋予一个 guildId
        guildId = `privateChat_${userId}`;
      }
      const gameInfo = await getGameInfo(guildId);
      if (gameInfo.isWon && !gameInfo.isKeepPlaying) {
        return await sendMessage(session, `【@${username}】\n你们已经赢了哦！\n等待最后操作者做出选择吧~`);
      }
      if (gameInfo.gameStatus === '未开始') {
        return await sendMessage(session, `【@${username}】\n游戏还没开始呢~`);
      }
      const getPlayer = await ctx.database.get('players_in_2048_playing', {guildId, userId})
      if (getPlayer.length === 0) {
        return await sendMessage(session, `【@${username}】\n没加入游戏的话~移动不了哦！`);
      }
      if (!operation) {
        await sendMessage(session, `【@${username}】\n请输入你想要进行的【移动操作】：\n可以一次输入多个操作~\n例如：左右上下左左右`)
        const userInput = await session.prompt()
        if (!userInput) return await sendMessage(session, `输入超时。`);
        operation = userInput
      }
      let state = gameInfo.progress
      for (let i = 0; i < operation.length; i++) {
        let currentChar = operation[i];
        const originalState = JSON.parse(JSON.stringify(state)) as Cell[][]; // 创建 state 的深层副本，以避免对原始数据的修改
        if (currentChar === '上' || currentChar === 's' || currentChar === 'u') {
          // 执行上的操作
          await moveAndMergeUp(state, guildId)
        } else if (currentChar === '下' || currentChar === 'x' || currentChar === 'd') {
          // 执行下的操作
          await moveAndMergeDown(state, guildId)
        } else if (currentChar === '左' || currentChar === 'z' || currentChar === 'l') {
          // 执行左的操作
          await moveAndMergeLeft(state, guildId)
        } else if (currentChar === '右' || currentChar === 'y' || currentChar === 'r') {
          // 执行右的操作
          await moveAndMergeRight(state, guildId)
        }
        if (!compareStates(originalState, state)) {
          // console.log(Math.pow(2, gameInfo.gridSize - 4))
          state = insertNewElements(state, Math.pow(2, gameInfo.gridSize - 4))
        }
      }

      const theHighestNumber = findHighestValue(state)
      // 经典模式才记分才能赢
      let isWon: boolean = false
      if (gameInfo.gridSize === 4) {
        isWon = hasValue2048(state) || theHighestNumber > 2048;
        if (isWon) {
          await ctx.database.set('game_2048_records', {guildId}, {isWon: true})
        }
      }

      // 如果游戏没有继续的情况下才判断赢
      const isOver = isGameOver(state)
      await ctx.database.set('game_2048_records', {guildId}, {progress: state})
      const newGameInfo = await getGameInfo(guildId);
      const stateHtml = convertStateToHTML(state)
      const htmlGridContainer = generateGridHTML(gameInfo.gridSize);
      const tilePositionHtml = generate2048TilePositionHtml(gameInfo.gridSize);
      const gameContainerHtml = generate2048GameContainerHtml(gameInfo.gridSize);
      const width = 107 * gameInfo.gridSize + 15 * (gameInfo.gridSize + 1) + 50
      const height = 107 * gameInfo.gridSize + 15 * (gameInfo.gridSize + 1) + 50
      const page = await ctx.puppeteer.page()
      await page.goto(path.join(__dirname, 'emptyHtml.html'))
      await page.setViewport({width, height})
      const gameOverHtml: string = `
<div class="game-message game-over">
    <p>你们输了!</p>
    <div class="lower">
          <a class="retry-button">下次一定</a>
    </div>
</div>`
      const gameWonHtml: string = `
<div class="game-message game-won">
    <p>你们赢了!</p>
    <div class="lower">
        <a class="keep-playing-button">继续游戏</a>
        <a class="retry-button">到此为止</a>
    </div>
</div>`
      const html = `${htmlHead}
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
            <div class="score-container">${newGameInfo.score}</div>
            <div class="best-container">${newGameInfo.best}</div>
        </div>
    </div>
    <div class="game-container">
        ${isOver ? gameOverHtml : ''}
        ${isWon && !gameInfo.isKeepPlaying ? gameWonHtml : ''}
        ${htmlGridContainer}
        <div class="tile-container">
            ${stateHtml}
        </div>
    </div>
</div>
</body>
</html>`

      await page.setContent(html, {waitUntil: 'load'})
      const imageBuffer = await page.screenshot({fullPage: true, type: config.imageType})
      const getUsers = await ctx.database.get('players_in_2048_playing', {guildId})
      const theBest = newGameInfo.best
      if (gameInfo.gridSize === 4) {
        if (theHighestNumber > gameInfo.highestNumber) {
          await ctx.database.set('game_2048_records', {guildId}, {highestNumber: theHighestNumber})
        }
        if (theBest > gameInfo.best) {
          // 根据getUsers的所有元素生成一个新的json格式的数组
          const bestPlayers: BestPlayer[] = getUsers.map((player) => {
            const {userId, username} = player;
            return {userId, username};
          });
          await ctx.database.set('game_2048_records', {guildId}, {bestPlayers})
        }
        for (const player of getUsers) {
          const {userId, username, money} = player;
          const [userRecord] = await ctx.database.get('player_2048_records', {userId})
          if (userRecord.best < theBest) {
            await ctx.database.set('player_2048_records', {userId}, {
              best: theBest,
            })
          }
          if (userRecord.highestNumber < theHighestNumber) {
            await ctx.database.set('player_2048_records', {userId}, {
              highestNumber: theHighestNumber,
            })
          }
        }
      }

      // 输了就结束
      if (!gameInfo.isKeepPlaying && isOver) {
        // 判断游戏是否赢 赢了之后询问该最后一次操作的玩家 是否继续 继续的话就不重置游戏 不继续的话重置游戏状态
        // 遍历 getUsers，对 money 不为 0 的玩家进行结算，为他们增加 money*2
        if (gameInfo.gridSize === 4) {
          for (const player of getUsers) {
            const {userId, username, money} = player;
            const [userRecord] = await ctx.database.get('player_2048_records', {userId})
            await ctx.database.set('player_2048_records', {userId}, {
              lose: userRecord.lose + 1,
              moneyChange: userRecord.moneyChange - money,
            })
          }
        }
        // 重置游戏状态 发送游戏结束消息
        await reset2048Game(guildId)
        return await sendMessage(session, `游戏结束！\n你们输惹...\n但没关系，下次一定能行！${h.image(imageBuffer, `image/${config.imageType}`)}`)
      }
      if (gameInfo.isKeepPlaying && isOver) {
        for (const player of getUsers) {
          const {userId, username, money} = player;
          const [userRecord] = await ctx.database.get('player_2048_records', {userId})
          const highestValue = findHighestValue(state)

          if (config.rewardHighNumbers) {
            if (config.incrementalRewardForHighNumbers) {
              const uid = (await ctx.database.getUser(platform, userId)).id
              await ctx.monetary.gain(uid, money * config.rewardMultiplier2048Win * (highestValue / 2048 - 1));
              await ctx.database.set('player_2048_records', {userId}, {
                moneyChange: userRecord.moneyChange + money * config.rewardMultiplier2048Win * (highestValue / 2048 - 1),
              })
              await ctx.database.set('players_in_2048_playing', {userId}, {money: money * config.rewardMultiplier2048Win * (highestValue / 2048 - 1)})
            } else {
              const uid = (await ctx.database.getUser(platform, userId)).id
              await ctx.monetary.gain(uid, money);
              await ctx.database.set('player_2048_records', {userId}, {
                moneyChange: userRecord.moneyChange + money * (highestValue / 2048 - 1),
              })
              await ctx.database.set('players_in_2048_playing', {userId}, {money: money * (highestValue / 2048 - 1)})
            }
          }

        }
        const getNewUsers = await ctx.database.get('players_in_2048_playing', {guildId})
        // 生成结算字符串
        let settlementResult = '';
        for (const player of getNewUsers) {
          if (player.money !== 0) {
            const {username, money} = player;
            settlementResult += `【${username}】：【+${money}】\n`;
          }
        }
        await reset2048Game(guildId)
        return await sendMessage(session, `游戏结束了哦！${h.image(imageBuffer, `image/${config.imageType}\n继续游戏后的结算结果如下：\n${settlementResult}`)}\n欢迎下次再来玩哦~`)
      }
      if (!gameInfo.isKeepPlaying && isWon) {
        // 判断游戏是否赢 赢了之后询问该最后一次操作的玩家 是否继续 继续的话就不重置游戏 不继续的话重置游戏状态
        // 遍历 getUsers，对 money 不为 0 的玩家进行结算，为他们增加 money*2
        for (const player of getUsers) {
          const {userId, username, money} = player;
          const [userRecord] = await ctx.database.get('player_2048_records', {userId})
          await ctx.database.set('player_2048_records', {userId}, {
            win: userRecord.win + 1,
            moneyChange: userRecord.moneyChange + money * config.rewardMultiplier2048Win,
          })
          const uid = (await ctx.database.getUser(platform, userId)).id
          await ctx.monetary.gain(uid, money * config.rewardMultiplier2048Win);
        }

        // 生成结算字符串
        let settlementResult = '';
        for (const player of getUsers) {
          if (player.money !== 0) {
            const {username, money} = player;
            settlementResult += `【${username}】：【+${money * config.rewardMultiplier2048Win}】\n`;
          }
        }

        if (!config.enableContinuedPlayAfter2048Win) {
          await reset2048Game(guildId)
          return await sendMessage(session, `2048！\n恭喜🎉你们赢了！\n${h.image(imageBuffer, `image/${config.imageType}`)}\n结算结果如下：\n${settlementResult}\n下次再见哦~`)
        } else {
          await sendMessage(session, `2048！\n恭喜🎉你们赢了！\n${h.image(imageBuffer, `image/${config.imageType}`)}\n结算结果如下：\n${settlementResult}`)
        }
        await sendMessage(session, `【@${username}】\n作为赢得游戏的最后操作者！\n您有权决定是否继续游戏，请选择：
【继续游戏】或【到此为止】
输入次数为：【3】
注意：不选择的话游戏会自动结束哦~`)
        let userInput = ''
        let inputNum = 0
        let isChoose: boolean = false
        while (userInput !== '继续游戏' && userInput !== '到此为止' && inputNum < 3) {
          userInput = await session.prompt()
          ++inputNum
          if (userInput === '继续游戏') {
            isChoose = true
            await ctx.database.set('game_2048_records', {guildId}, {isKeepPlaying: true})
            const html = `${htmlHead}
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
            <div class="score-container">${newGameInfo.score}</div>
            <div class="best-container">${newGameInfo.best}</div>
        </div>
    </div>
    <div class="game-container">
        ${htmlGridContainer}
        <div class="tile-container">
            ${stateHtml}
        </div>
    </div>
</div>
</body>
</html>`
            await page.setContent(html, {waitUntil: 'load'})
            const imageBuffer = await page.screenshot({fullPage: true, type: config.imageType})
            return await sendMessage(session, `【@${username}】\n您选择了【继续游戏】！让我看看你们能走多远！\n祝你们接下来一路顺利呀~\n${h.image(imageBuffer, `image/${config.imageType}`)}`)
          } else if (userInput === '到此为止') {
            isChoose = true
            await reset2048Game(guildId)
            return await sendMessage(session, `【@${username}】\n您选择了【到此为止】！\n该局游戏结束咯~\n那就让我们下次再见吧~`)
          }
        }
        if (!isChoose) {
          await reset2048Game(guildId)
          await sendMessage(session, `最后操作者未做出选择，该局游戏结束咯~`)
        }

      }
      // 返回游戏状态图
      return await sendMessage(session, `${h.image(imageBuffer, `image/${config.imageType}`)}`)
    })
  // lszg*
  ctx.command('2048Game.历史最高', '查看历史最高记录')
    .option('across', '-a 跨群')
    .action(async ({session, options}) => {
      let result: string = ''
      if (options.across) {
        const getGamesAcross: GameRecord[] = await ctx.database.get('game_2048_records', {})
        if (getGamesAcross.length === 0) {
          return await sendMessage(session, `未找到任何游戏记录。`)
        }
        // 根据 getGamesAcross 得到 best 最大的那个元素
        const highestBest = getGamesAcross.reduce((prev, current) => (prev.best > current.best) ? prev : current, {} as GameRecord);

        // 获取最高分所在的索引
        // const indexOfHighestBest = getGamesAcross.findIndex(game => game.best === highestBest.best);

        // 动态生成 bestPlayers 部分
        const bestPlayersList = highestBest.bestPlayers.map(player => `【${player.username}】`).join('\n');

        // 整合到结果字符串中
        result = `跨群历史最高数：【${highestBest.highestNumber}】
跨群历史最高分为：【${highestBest.best}】
参与的玩家如下：
${bestPlayersList}`;
      } else {
        const gameInfo: GameRecord = await getGameInfo(session.guildId)
        // 动态生成 bestPlayers 部分
        const bestPlayersList = gameInfo.bestPlayers.map(player => `【${player.username}】`).join('\n');
        result = `历史最高数：【${gameInfo.highestNumber}】
历史最高分为：【${gameInfo.best}】
参与的玩家如下：
${bestPlayersList}`;
      }

      return await sendMessage(session, result)
      // .action
    })

  // r*
  ctx.command('2048Game.排行榜 [number:number]', '查看排行榜相关指令')
    .action(async ({session}, number = config.defaultMaxLeaderboardEntries) => {
      if (typeof number !== 'number' || isNaN(number) || number < 0) {
        return '请输入大于等于 0 的数字作为排行榜的参数。';
      }
      const leaderboards = {
        "1": `2048Game.排行榜.胜场 ${number}`,
        "2": `2048Game.排行榜.输场 ${number}`,
        "3": `2048Game.排行榜.最高分数 ${number}`,
        "胜场排行榜": `2048Game.排行榜.胜场 ${number}`,
        "输场排行榜": `2048Game.排行榜.输场 ${number}`,
        "最高分数排行榜": `2048Game.排行榜.最高分数 ${number}`,
      };

      await sendMessage(session, `当前可查看排行榜如下：
1. 胜场排行榜
2. 输场排行榜
3. 最高分数排行榜
请输入想要查看的【排行榜名】或【序号】：`);

      const userInput = await session.prompt();
      if (!userInput) return sendMessage(session, `输入超时。`);

      const selectedLeaderboard = leaderboards[userInput];
      if (selectedLeaderboard) {
        await session.execute(selectedLeaderboard);
      } else {
        return sendMessage(session, `无效的输入。`);
      }
    });


  ctx.command('2048Game.排行榜.胜场 [number:number]', '查看玩家胜场排行榜')
    .action(async ({session}, number = config.defaultMaxLeaderboardEntries) => {
      if (typeof number !== 'number' || isNaN(number) || number < 0) {
        return '请输入大于等于 0 的数字作为排行榜的参数。';
      }
      return await getLeaderboard(session, 'win', 'win', '玩家胜场排行榜');
    });

  ctx.command('2048Game.排行榜.输场 [number:number]', '查看玩家输场排行榜')
    .action(async ({session}, number = config.defaultMaxLeaderboardEntries) => {
      if (typeof number !== 'number' || isNaN(number) || number < 0) {
        return '请输入大于等于 0 的数字作为排行榜的参数。';
      }
      return await getLeaderboard(session, 'lose', 'lose', '玩家输场排行榜');
    });

  ctx.command('2048Game.排行榜.最高分数 [number:number]', '查看玩家最高分排行榜')
    .action(async ({session}, number = config.defaultMaxLeaderboardEntries) => {
      if (typeof number !== 'number' || isNaN(number) || number < 0) {
        return '请输入大于等于 0 的数字作为排行榜的参数。';
      }
      return await getLeaderboard(session, 'best', 'best', '玩家最高分排行榜');
    });

  ctx.command('2048Game.查询玩家记录 [targetUser:text]', '查询玩家记录')
    .action(async ({session}, targetUser) => {
      let {guildId, userId, username} = session
      if (targetUser) {
        const userIdRegex = /<at id="([^"]+)"(?: name="([^"]+)")?\/>/;
        const match = targetUser.match(userIdRegex);
        userId = match?.[1] ?? userId;
        username = match?.[2] ?? username;
      }
      const targetUserRecord = await ctx.database.get('player_2048_records', {userId})
      if (targetUserRecord.length === 0) {
        await ctx.database.create('player_2048_records', {
          userId,
          username,
          lose: 0,
          win: 0,
          moneyChange: 0,
          best: 0,
          highestNumber: 0
        })
        return sendMessage(session, `查询对象：${username}
无任何游戏记录。`)
      }
      const {win, lose, moneyChange, best, highestNumber} = targetUserRecord[0]
      return sendMessage(session, `查询对象：${username}
最高数字为：${highestNumber}
最高分数为：${best} 分
胜场次数为：${win} 次
输场次数为：${lose} 次
损益为：${moneyChange} 点
`)
    });

  // ch*

  // 生成排行榜
  async function getLeaderboard(session: any, type: string, sortField: string, title: string) {
    const getPlayers: PlayerRecord[] = await ctx.database.get('player_2048_records', {})
    const sortedPlayers = getPlayers.sort((a, b) => b[sortField] - a[sortField])
    const topPlayers = sortedPlayers.slice(0, config.defaultMaxLeaderboardEntries)

    let result = `${title}：\n`;
    topPlayers.forEach((player, index) => {
      result += `${index + 1}. ${player.username}：${player[sortField]} ${type === 'best' ? '分' : '次'}\n`
    })
    return await sendMessage(session, result);
  }

  async function reset2048Game(guildId: string): Promise<void> {
    await ctx.database.remove('players_in_2048_playing', {guildId});
    await ctx.database.set('game_2048_records', {guildId}, {
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


  // 向上移动并合并
  async function moveAndMergeUp(state: Cell[][], guildId) {
    // const newState = JSON.parse(JSON.stringify(state)); // 创建 state 的深层副本，以避免对原始数据的修改

    for (let col = 0; col < state[0].length; col++) {
      let mergeIndex = -1; // 用于记录合并位置的索引

      for (let row = 1; row < state.length; row++) {
        if (state[row][col]) {
          let currentRow = row;

          while (currentRow > 0) {
            if (!state[currentRow - 1][col]) {
              // 如果上方格子为空，则移动当前格子到上方
              --state[currentRow][col].position.x
              state[currentRow - 1][col] = state[currentRow][col];
              state[currentRow][col] = null;
              currentRow--;
            } else if (state[currentRow - 1][col].value === state[currentRow][col].value && currentRow - 1 !== mergeIndex) {
              // 如果上方格子的值与当前格子相等且上方格子未参与过合并，则合并两个格子的值
              state[currentRow - 1][col].value *= 2;
              const gameInfo = await getGameInfo(guildId)
              const score = gameInfo.score + state[currentRow - 1][col].value
              if (score > gameInfo.best) {
                await ctx.database.set('game_2048_records', {guildId}, {score, best: score})
              } else {
                await ctx.database.set('game_2048_records', {guildId}, {score})
              }
              state[currentRow][col] = null;
              mergeIndex = currentRow - 1;
              break;
            } else {
              // 如果上方格子的值与当前格子不相等或者上方格子已参与过合并，则停止移动
              break;
            }
          }
        }
      }
    }

    return state;
  }

  // 向下移动并合并
  async function moveAndMergeDown(state, guildId) {
    // const newState = JSON.parse(JSON.stringify(state)); // 创建 state 的深层副本，以避免对原始数据的修改

    for (let col = 0; col < state[0].length; col++) {
      let mergeIndex = -1; // 用于记录合并位置的索引

      for (let row = state.length - 2; row >= 0; row--) {
        if (state[row][col]) {
          let currentRow = row;

          while (currentRow < state.length - 1) {
            if (!state[currentRow + 1][col]) {
              // 如果下方格子为空，则移动当前格子到下方
              ++state[currentRow][col].position.x
              state[currentRow + 1][col] = state[currentRow][col];
              state[currentRow][col] = null;
              currentRow++;
            } else if (state[currentRow + 1][col].value === state[currentRow][col].value && currentRow + 1 !== mergeIndex) {
              // 如果下方格子的值与当前格子相等且下方格子未参与过合并，则合并两个格子的值
              state[currentRow + 1][col].value *= 2;

              const gameInfo = await getGameInfo(guildId)
              const score = gameInfo.score + state[currentRow + 1][col].value
              if (score > gameInfo.best) {
                await ctx.database.set('game_2048_records', {guildId}, {score, best: score})
              } else {
                await ctx.database.set('game_2048_records', {guildId}, {score})
              }

              state[currentRow][col] = null;
              mergeIndex = currentRow + 1;
              break;
            } else {
              // 如果下方格子的值与当前格子不相等或者下方格子已参与过合并，则停止移动
              break;
            }
          }
        }
      }
    }

    return state;
  }

  // 向左移动并合并
  async function moveAndMergeLeft(state, guildId) {
    // const newState = JSON.parse(JSON.stringify(state)); // 创建 state 的深层副本，以避免对原始数据的修改

    for (let row = 0; row < state.length; row++) {
      let mergeIndex = -1; // 用于记录合并位置的索引

      for (let col = 1; col < state[row].length; col++) {
        if (state[row][col]) {
          let currentCol = col;

          while (currentCol > 0) {
            if (!state[row][currentCol - 1]) {
              // 如果左侧格子为空，则移动当前格子到左侧
              --state[row][currentCol].position.y
              state[row][currentCol - 1] = state[row][currentCol];
              state[row][currentCol] = null;
              currentCol--;
            } else if (state[row][currentCol - 1].value === state[row][currentCol].value && currentCol - 1 !== mergeIndex) {
              // 如果左侧格子的值与当前格子相等且左侧格子未参与过合并，则合并两个格子的值
              state[row][currentCol - 1].value *= 2;

              const gameInfo = await getGameInfo(guildId)
              const score = gameInfo.score + state[row][currentCol - 1].value
              if (score > gameInfo.best) {
                await ctx.database.set('game_2048_records', {guildId}, {score, best: score})
              } else {
                await ctx.database.set('game_2048_records', {guildId}, {score})
              }

              state[row][currentCol] = null;
              mergeIndex = currentCol - 1;
              break;
            } else {
              // 如果左侧格子的值与当前格子不相等或者左侧格子已参与过合并，则停止移动
              break;
            }
          }
        }
      }
    }

    return state;
  }

  // 向右移动并合并
  async function moveAndMergeRight(state, guildId) {
    // const newState = JSON.parse(JSON.stringify(state)); // 创建 state 的深层副本，以避免对原始数据的修改

    for (let row = 0; row < state.length; row++) {
      let mergeIndex = -1; // 用于记录合并位置的索引

      for (let col = state[row].length - 2; col >= 0; col--) {
        if (state[row][col]) {
          let currentCol = col;

          while (currentCol < state[row].length - 1) {
            if (!state[row][currentCol + 1]) {
              // 如果右侧格子为空，则移动当前格子到右侧
              ++state[row][currentCol].position.y
              state[row][currentCol + 1] = state[row][currentCol];
              state[row][currentCol] = null;
              currentCol++;
            } else if (state[row][currentCol + 1].value === state[row][currentCol].value && currentCol + 1 !== mergeIndex) {
              // 如果右侧格子的值与当前格子相等且右侧格子未参与过合并，则合并两个格子的值
              state[row][currentCol + 1].value *= 2;

              const gameInfo = await getGameInfo(guildId)
              const score = gameInfo.score + state[row][currentCol + 1].value
              if (score > gameInfo.best) {
                await ctx.database.set('game_2048_records', {guildId}, {score, best: score})
              } else {
                await ctx.database.set('game_2048_records', {guildId}, {score})
              }

              state[row][currentCol] = null;
              mergeIndex = currentCol + 1;
              break;
            } else {
              // 如果右侧格子的值与当前格子不相等或者右侧格子已参与过合并，则停止移动
              break;
            }
          }
        }
      }
    }

    return state;
  }

  async function getGameInfo(guildId: string): Promise<GameRecord> {
    let gameRecord = await ctx.database.get('game_2048_records', {guildId});
    if (gameRecord.length === 0) {
      await ctx.database.create('game_2048_records', {
        guildId,
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
      gameRecord = await ctx.database.get('game_2048_records', {guildId});
    }
    return gameRecord[0];
  }

  // sh*
  async function sendMessage(session: any, message: any): Promise<void> {
    await session.send(message);
  }

  // apply
}

// hs*

function generate2048GameContainerHtml(gridSize: number): string {
  const cellSize = 107;
  const marginSize = 15;
  const containerWidth = cellSize * gridSize + marginSize * (gridSize + 1);
  const containerHeight = cellSize * gridSize + marginSize * (gridSize + 1);

  const style = `
    .game-container {
      margin-top: 20px;
      position: relative;
      padding: 15px;
      cursor: default;
      -webkit-touch-callout: none;
      -ms-touch-callout: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      -ms-touch-action: none;
      user-select: none;
      touch-action: none;
      background: #bbada0;
      border-radius: 6px;
      width: ${containerWidth}px;
      height: ${containerHeight}px;
      -webkit-box-sizing: border-box;
      -moz-box-sizing: border-box;
      box-sizing: border-box;
    }
  `;

  return style;
}

function generate2048TilePositionHtml(gridSize: number): string {
  let styleString = "";

  for (let i = 1; i <= gridSize; i++) {
    for (let j = 1; j <= gridSize; j++) {
      const transformX = (i - 1) * 121;
      const transformY = (j - 1) * 121;
      const className = `.tile.tile-position-${i}-${j}`;

      const tileStyle = `
                ${className} {
                    -webkit-transform: translate(${transformX}px, ${transformY}px);
                    -moz-transform: translate(${transformX}px, ${transformY}px);
                    transform: translate(${transformX}px, ${transformY}px);
                }
            `;

      styleString += tileStyle;
    }
  }

  return styleString;
}


// 生成指定大小的网格的 HTML 元素
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
  // 找到所有空位置
  for (let i = 0; i < state.length; i++) {
    for (let j = 0; j < state[i].length; j++) {
      if (state[i][j] === null || state[i][j].value === null || state[i][j].position === null) {
        emptyCells.push({x: i, y: j});
      }
    }
  }

  // 如果没有空位置，不进行任何操作
  if (emptyCells.length === 0) {
    return state;
  }

  // 根据elementCount确定要插入的元素个数
  const insertCount = Math.min(elementCount, emptyCells.length);

  // 从空位置中随机选取位置并插入新元素
  const newState = state.map(row => [...row]);
  for (let k = 0; k < insertCount; k++) {
    const randomIndex = Math.floor(Math.random() * emptyCells.length);
    const randomPosition = emptyCells[randomIndex];

    // 随机生成新元素的值
    const value = Math.random() < 0.9 ? 2 : 4;

    // 在选定的位置插入新元素
    newState[randomPosition.x][randomPosition.y] = {
      position: {x: randomPosition.x, y: randomPosition.y},
      value: value
    };

    // 移除已经插入的位置，避免重复插入
    emptyCells.splice(randomIndex, 1);
  }

  return newState;
}


function compareStates(originalState: any, state: any): boolean {
  // 如果两个state的维度不同，则返回false
  if (originalState.length !== state.length || originalState[0].length !== state[0].length) {
    return false;
  }

  // 逐个比较数组中的元素是否相等
  for (let i = 0; i < originalState.length; i++) {
    for (let j = 0; j < originalState[i].length; j++) {
      const originalItem = originalState[i][j];
      const item = state[i][j];

      // 如果元素不相等，则返回false
      if (JSON.stringify(originalItem) !== JSON.stringify(item)) {
        return false;
      }
    }
  }

  // 所有的元素都相等，返回true
  return true;
}

function findHighestValue(state: Cell[][]): number | null {
  let highestValue: number | null = null;

  for (let row of state) {
    for (let cell of row) {
      if (cell && cell.value !== null) {
        if (highestValue === null || cell.value > highestValue) {
          highestValue = cell.value;
        }
      }
    }
  }

  return highestValue;
}

function isGameOver(state: Cell[][]): boolean {
  // 判断是否还有空位
  for (let row of state) {
    for (let cell of row) {
      if (cell === null || cell.position === null) { // 先判断 cell 是否为 null
        return false; // 游戏未结束
      }
    }
  }

  // 判断上下左右移动是否还能合并
  for (let i = 0; i < state.length; i++) {
    for (let j = 0; j < state[i].length; j++) {
      const currentCell = state[i][j];
      if (currentCell !== null && j < state[i].length - 1 && currentCell.value === state[i][j + 1].value) { // 先判断 currentCell 是否为 null
        return false; // 可以向右移动
      }
      if (currentCell !== null && i < state.length - 1 && currentCell.value === state[i + 1][j].value) { // 先判断 currentCell 是否为 null
        return false; // 可以向下移动
      }
    }
  }

  return true; // 游戏结束
}

// 创建一个空的二维数组网格
function createEmptyGrid(size: number): number[][] {
  const cells = [];

  for (let x = 0; x < size; x++) {
    const row = cells[x] = [];

    for (let y = 0; y < size; y++) {
      row.push(null);
    }
  }

  return cells;
}

// const state = [
//   [{ position: { x: 0, y: 0 }, value: 2 }, { position: { x: 0, y: 1 }, value: 4 }],
//   [{ position: { x: 1, y: 0 }, value: 8 }, { position: { x: 1, y: 1 }, value: 16 }]
// ];

interface Position {
  x: number;
  y: number;
}

interface Cell {
  position: Position | null;
  value: number | null;
}

function getRandomPosition(grid: number[][]): { x: number, y: number } {
  const availablePositions: { x: number, y: number }[] = [];
  grid.forEach((row, x) => {
    row.forEach((cell, y) => {
      if (cell === null) {
        availablePositions.push({x, y});
      }
    });
  });

  if (availablePositions.length === 0) {
    throw new Error("Grid is full");
  }

  const randomIndex = Math.floor(Math.random() * availablePositions.length);
  return availablePositions[randomIndex];
}

function insertRandomElement(grid: number[][], insertNumber: number): Cell[][] {
  const newGrid: Cell[][] = grid.map(row => row.map(cell => cell !== null ? {
    position: {x: 0, y: 0},
    value: cell
  } : null));

  for (let i = 0; i < insertNumber; i++) {
    const {x, y} = getRandomPosition(grid);
    const value = Math.random() < 0.9 ? 2 : 4;
    newGrid[x][y] = {position: {x, y}, value};
  }

  return newGrid;
}

// 生成 tilesHtml
function generateTileElement(cell) {
  if (cell !== null) {
    const {value, position} = cell;
    const tileClass = `tile tile-${value > 2048 ? 'super' : value} tile-position-${position.y + 1}-${position.x + 1}`;
    const tileInner = `<div class="tile-inner">${value}</div>`;
    return `<div class="${tileClass}">${tileInner}</div>`;
  }
  return '';
}

function convertStateToHTML(state) {
  let html = '';
  state.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      html += generateTileElement(cell);
    });
  });
  return html;
}

// 判断 value 中是否有 2048
function hasValue2048(state: Cell[][]): boolean {
  for (let row of state) {
    for (let cell of row) {
      if (cell && cell.value === 2048) {
        return true;
      }
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
            src: url("ClearSans-Light-webfont.eot");
            src: url("ClearSans-Light-webfont.eot?#iefix") format("embedded-opentype"),
            url("ClearSans-Light-webfont.svg#clear_sans_lightregular") format("svg"),
            url("ClearSans-Light-webfont.woff") format("woff");
            font-weight: 200;
            font-style: normal;
        }

        @font-face {
            font-family: "Clear Sans";
            src: url("ClearSans-Regular-webfont.eot");
            src: url("ClearSans-Regular-webfont.eot?#iefix") format("embedded-opentype"),
            url("ClearSans-Regular-webfont.svg#clear_sansregular") format("svg"),
            url("ClearSans-Regular-webfont.woff") format("woff");
            font-weight: normal;
            font-style: normal;
        }

        @font-face {
            font-family: "Clear Sans";
            src: url("ClearSans-Bold-webfont.eot");
            src: url("ClearSans-Bold-webfont.eot?#iefix") format("embedded-opentype"),
            url("ClearSans-Bold-webfont.svg#clear_sansbold") format("svg"),
            url("ClearSans-Bold-webfont.woff") format("woff");
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

        body {
            margin: 20px 0;
        }

        div.otherGames p {
            display: inline-block;
            margin: 20px 30px !important;
        }

        .heading:after {
            content: "";
            display: block;
            clear: both;
        }

        .title {
            font-size: 50px;
            font-weight: bold;
            margin: 0;
            display: block;
            float: left;
        }

        /*@-webkit-keyframes move-up {*/
        /*    0% {*/
        /*        top: 25px;*/
        /*        opacity: 1;*/
        /*    }*/

        /*    100% {*/
        /*        top: -50px;*/
        /*        opacity: 0;*/
        /*    }*/
        /*}*/

        /*@-moz-keyframes move-up {*/
        /*    0% {*/
        /*        top: 25px;*/
        /*        opacity: 1;*/
        /*    }*/

        /*    100% {*/
        /*        top: -50px;*/
        /*        opacity: 0;*/
        /*    }*/
        /*}*/

        /*@keyframes move-up {*/
        /*    0% {*/
        /*        top: 25px;*/
        /*        opacity: 1;*/
        /*    }*/

        /*    100% {*/
        /*        top: -50px;*/
        /*        opacity: 0;*/
        /*    }*/
        /*}*/

        .scores-container {
            float: right;
            text-align: right;
        }

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

        .score-container:after, .best-container:after {
            position: absolute;
            width: 100%;
            top: 10px;
            left: 0;
            text-transform: uppercase;
            font-size: 13px;
            line-height: 13px;
            text-align: center;
            color: #eee4da;
        }

        .score-container .score-addition, .best-container .score-addition {
            position: absolute;
            right: 30px;
            color: red;
            font-size: 25px;
            line-height: 25px;
            font-weight: bold;
            color: rgba(119, 110, 101, 0.9);
            z-index: 100;
            -webkit-animation: move-up 600ms ease-in;
            -moz-animation: move-up 600ms ease-in;
            animation: move-up 600ms ease-in;
            -webkit-animation-fill-mode: both;
            -moz-animation-fill-mode: both;
            animation-fill-mode: both;
        }

        p {
            margin-top: 0;
            margin-bottom: 10px;
            line-height: 1.65;
        }

        a {
            text-decoration: underline;
            cursor: pointer;
        }

        strong.important {
            text-transform: uppercase;
        }

        hr {
            border: none;
            border-bottom: 1px solid #d8d4d0;
            margin-top: 20px;
            margin-bottom: 30px;
        }

        /*@-webkit-keyframes fade-in {*/
        /*    0% {*/
        /*        opacity: 0;*/
        /*    }*/

        /*    100% {*/
        /*        opacity: 1;*/
        /*    }*/
        /*}*/

        /*@-moz-keyframes fade-in {*/
        /*    0% {*/
        /*        opacity: 0;*/
        /*    }*/

        /*    100% {*/
        /*        opacity: 1;*/
        /*    }*/
        /*}*/

        /*@keyframes fade-in {*/
        /*    0% {*/
        /*        opacity: 0;*/
        /*    }*/

        /*    100% {*/
        /*        opacity: 1;*/
        /*    }*/
        /*}*/

        .game-container .game-message {
            display: none;
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            left: 0;
            background: rgba(238, 228, 218, 0.5);
            z-index: 100;
            text-align: center;
            -webkit-animation: fade-in 800ms ease 1200ms;
            -moz-animation: fade-in 800ms ease 1200ms;
            animation: fade-in 800ms ease 1200ms;
            -webkit-animation-fill-mode: both;
            -moz-animation-fill-mode: both;
            animation-fill-mode: both;
        }

        .game-container .game-message p {
            font-size: 60px;
            font-weight: bold;
            height: 60px;
            line-height: 60px;
            margin-top: 222px;
        }

        .game-container .game-message .lower {
            display: block;
            margin-top: 59px;
        }

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

        .game-container .game-message a.keep-playing-button {
            display: none;
        }

        .game-container .game-message.game-won {
            background: rgba(237, 194, 46, 0.5);
            color: #f9f6f2;
        }

        .game-container .game-message.game-won a.keep-playing-button {
            display: inline-block;
        }

        .game-container .game-message.game-won, .game-container .game-message.game-over {
            display: block;
        }

        .grid-container {
            position: absolute;
            z-index: 1;
        }

        .grid-row {
            margin-bottom: 15px;
        }

        .grid-row:last-child {
            margin-bottom: 0;
        }

        .grid-row:after {
            content: "";
            display: block;
            clear: both;
        }

        .grid-cell {
            width: 106.25px;
            height: 106.25px;
            margin-right: 15px;
            float: left;
            border-radius: 3px;
            background: rgba(238, 228, 218, 0.35);
        }

        .grid-cell:last-child {
            margin-right: 0;
        }

        .tile-container {
            position: absolute;
            z-index: 2;
        }

        .tile, .tile .tile-inner {
            width: 107px;
            height: 107px;
            line-height: 107px;
        }

        .tile {
            position: absolute;
            -webkit-transition: 100ms ease-in-out;
            -moz-transition: 100ms ease-in-out;
            transition: 100ms ease-in-out;
            -webkit-transition-property: -webkit-transform;
            -moz-transition-property: -moz-transform;
            transition-property: transform;
        }

        .tile .tile-inner {
            border-radius: 3px;
            background: #eee4da;
            text-align: center;
            font-weight: bold;
            z-index: 10;
            font-size: 55px;
        }

        .tile.tile-2 .tile-inner {
            background: #eee4da;
            box-shadow: 0 0 30px 10px rgba(243, 215, 116, 0), inset 0 0 0 1px rgba(255, 255, 255, 0);
        }

        .tile.tile-4 .tile-inner {
            background: #ede0c8;
            box-shadow: 0 0 30px 10px rgba(243, 215, 116, 0), inset 0 0 0 1px rgba(255, 255, 255, 0);
        }

        .tile.tile-8 .tile-inner {
            color: #f9f6f2;
            background: #f2b179;
        }

        .tile.tile-16 .tile-inner {
            color: #f9f6f2;
            background: #f59563;
        }

        .tile.tile-32 .tile-inner {
            color: #f9f6f2;
            background: #f67c5f;
        }

        .tile.tile-64 .tile-inner {
            color: #f9f6f2;
            background: #f65e3b;
        }

        .tile.tile-128 .tile-inner {
            color: #f9f6f2;
            background: #edcf72;
            box-shadow: 0 0 30px 10px rgba(243, 215, 116, 0.2381), inset 0 0 0 1px rgba(255, 255, 255, 0.14286);
            font-size: 45px;
        }

        @media screen and (max-width: 520px) {
            .tile.tile-128 .tile-inner {
                font-size: 25px;
            }
        }

        .tile.tile-256 .tile-inner {
            color: #f9f6f2;
            background: #edcc61;
            box-shadow: 0 0 30px 10px rgba(243, 215, 116, 0.31746), inset 0 0 0 1px rgba(255, 255, 255, 0.19048);
            font-size: 45px;
        }

        @media screen and (max-width: 520px) {
            .tile.tile-256 .tile-inner {
                font-size: 25px;
            }
        }

        .tile.tile-512 .tile-inner {
            color: #f9f6f2;
            background: #edc850;
            box-shadow: 0 0 30px 10px rgba(243, 215, 116, 0.39683), inset 0 0 0 1px rgba(255, 255, 255, 0.2381);
            font-size: 45px;
        }

        @media screen and (max-width: 520px) {
            .tile.tile-512 .tile-inner {
                font-size: 25px;
            }
        }

        .tile.tile-1024 .tile-inner {
            color: #f9f6f2;
            background: #edc53f;
            box-shadow: 0 0 30px 10px rgba(243, 215, 116, 0.47619), inset 0 0 0 1px rgba(255, 255, 255, 0.28571);
            font-size: 35px;
        }

        @media screen and (max-width: 520px) {
            .tile.tile-1024 .tile-inner {
                font-size: 15px;
            }
        }

        .tile.tile-2048 .tile-inner {
            color: #f9f6f2;
            background: #edc22e;
            box-shadow: 0 0 30px 10px rgba(243, 215, 116, 0.55556), inset 0 0 0 1px rgba(255, 255, 255, 0.33333);
            font-size: 35px;
        }

        @media screen and (max-width: 520px) {
            .tile.tile-2048 .tile-inner {
                font-size: 15px;
            }
        }

        .tile.tile-super .tile-inner {
            color: #f9f6f2;
            background: #3c3a32;
            font-size: 30px;
        }

        @media screen and (max-width: 520px) {
            .tile.tile-super .tile-inner {
                font-size: 10px;
            }
        }

        /*@-webkit-keyframes appear {*/
        /*    0% {*/
        /*        opacity: 0;*/
        /*        -webkit-transform: scale(0);*/
        /*        -moz-transform: scale(0);*/
        /*        transform: scale(0);*/
        /*    }*/

        /*    100% {*/
        /*        opacity: 1;*/
        /*        -webkit-transform: scale(1);*/
        /*        -moz-transform: scale(1);*/
        /*        transform: scale(1);*/
        /*    }*/
        /*}*/

        /*@-moz-keyframes appear {*/
        /*    0% {*/
        /*        opacity: 0;*/
        /*        -webkit-transform: scale(0);*/
        /*        -moz-transform: scale(0);*/
        /*        transform: scale(0);*/
        /*    }*/

        /*    100% {*/
        /*        opacity: 1;*/
        /*        -webkit-transform: scale(1);*/
        /*        -moz-transform: scale(1);*/
        /*        transform: scale(1);*/
        /*    }*/
        /*}*/

        /*@keyframes appear {*/
        /*    0% {*/
        /*        opacity: 0;*/
        /*        -webkit-transform: scale(0);*/
        /*        -moz-transform: scale(0);*/
        /*        transform: scale(0);*/
        /*    }*/

        /*    100% {*/
        /*        opacity: 1;*/
        /*        -webkit-transform: scale(1);*/
        /*        -moz-transform: scale(1);*/
        /*        transform: scale(1);*/
        /*    }*/
        /*}*/

        /*.tile-new .tile-inner {*/
        /*    -webkit-animation: appear 200ms ease 100ms;*/
        /*    -moz-animation: appear 200ms ease 100ms;*/
        /*    animation: appear 200ms ease 100ms;*/
        /*    -webkit-animation-fill-mode: backwards;*/
        /*    -moz-animation-fill-mode: backwards;*/
        /*    animation-fill-mode: backwards;*/
        /*}*/

        /*@-webkit-keyframes pop {*/
        /*    0% {*/
        /*        -webkit-transform: scale(0);*/
        /*        -moz-transform: scale(0);*/
        /*        transform: scale(0);*/
        /*    }*/

        /*    50% {*/
        /*        -webkit-transform: scale(1.2);*/
        /*        -moz-transform: scale(1.2);*/
        /*        transform: scale(1.2);*/
        /*    }*/

        /*    100% {*/
        /*        -webkit-transform: scale(1);*/
        /*        -moz-transform: scale(1);*/
        /*        transform: scale(1);*/
        /*    }*/
        /*}*/

        /*@-moz-keyframes pop {*/
        /*    0% {*/
        /*        -webkit-transform: scale(0);*/
        /*        -moz-transform: scale(0);*/
        /*        transform: scale(0);*/
        /*    }*/

        /*    50% {*/
        /*        -webkit-transform: scale(1.2);*/
        /*        -moz-transform: scale(1.2);*/
        /*        transform: scale(1.2);*/
        /*    }*/

        /*    100% {*/
        /*        -webkit-transform: scale(1);*/
        /*        -moz-transform: scale(1);*/
        /*        transform: scale(1);*/
        /*    }*/
        /*}*/

        /*@keyframes pop {*/
        /*    0% {*/
        /*        -webkit-transform: scale(0);*/
        /*        -moz-transform: scale(0);*/
        /*        transform: scale(0);*/
        /*    }*/

        /*    50% {*/
        /*        -webkit-transform: scale(1.2);*/
        /*        -moz-transform: scale(1.2);*/
        /*        transform: scale(1.2);*/
        /*    }*/

        /*    100% {*/
        /*        -webkit-transform: scale(1);*/
        /*        -moz-transform: scale(1);*/
        /*        transform: scale(1);*/
        /*    }*/
        /*}*/

        /*.tile-merged .tile-inner {*/
        /*    z-index: 20;*/
        /*    -webkit-animation: pop 200ms ease 100ms;*/
        /*    -moz-animation: pop 200ms ease 100ms;*/
        /*    animation: pop 200ms ease 100ms;*/
        /*    -webkit-animation-fill-mode: backwards;*/
        /*    -moz-animation-fill-mode: backwards;*/
        /*    animation-fill-mode: backwards;*/
        /*}*/

        .above-game:after {
            content: "";
            display: block;
            clear: both;
        }

        .game-intro {
            float: left;
            line-height: 42px;
            margin-bottom: 0;
        }

        .restart-button {
            background: #8f7a66;
            border-radius: 3px;
            padding: 0 20px;
            text-decoration: none;
            color: #f9f6f2;
            height: 40px;
            line-height: 42px;
            display: block;
            text-align: center;
            float: right;
        }

        .game-explanation {
            margin-top: 30px;
        }

        @media screen and (max-width: 520px) {
            html, body {
                font-size: 15px;
            }

            body {
                margin: 20px 0;
                padding: 0 20px;
            }

            h1.title {
                font-size: 24px;
                margin-top: 15px;
            }

            .container {
                width: 280px;
                margin: 0 auto;
            }

            .score-container, .best-container {
                margin-top: 0;
                padding: 15px 10px;
                min-width: 40px;
            }

            .heading {
                margin-bottom: 10px;
            }

            .game-intro {
                width: 55%;
                display: block;
                box-sizing: border-box;
                line-height: 1.65;
            }

            .restart-button {
                width: 42%;
                padding: 0;
                display: block;
                box-sizing: border-box;
                margin-top: 2px;
            }

            .game-container {
                margin-top: 17px;
                position: relative;
                padding: 10px;
                cursor: default;
                -webkit-touch-callout: none;
                -ms-touch-callout: none;
                -webkit-user-select: none;
                -moz-user-select: none;
                -ms-user-select: none;
                -ms-touch-action: none;
                user-select: none;
                touch-action: none;
                background: #bbada0;
                border-radius: 6px;
                width: 280px;
                height: 280px;
                -webkit-box-sizing: border-box;
                -moz-box-sizing: border-box;
                box-sizing: border-box;
            }

            .game-container .game-message {
                display: none;
                position: absolute;
                top: 0;
                right: 0;
                bottom: 0;
                left: 0;
                background: rgba(238, 228, 218, 0.5);
                z-index: 100;
                text-align: center;
                -webkit-animation: fade-in 800ms ease 1200ms;
                -moz-animation: fade-in 800ms ease 1200ms;
                animation: fade-in 800ms ease 1200ms;
                -webkit-animation-fill-mode: both;
                -moz-animation-fill-mode: both;
                animation-fill-mode: both;
            }

            .game-container .game-message p {
                font-size: 60px;
                font-weight: bold;
                height: 60px;
                line-height: 60px;
                margin-top: 222px;
            }

            .game-container .game-message .lower {
                display: block;
                margin-top: 59px;
            }

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

            .game-container .game-message a.keep-playing-button {
                display: none;
            }

            .game-container .game-message.game-won {
                background: rgba(237, 194, 46, 0.5);
                color: #f9f6f2;
            }

            .game-container .game-message.game-won a.keep-playing-button {
                display: inline-block;
            }

            .game-container .game-message.game-won, .game-container .game-message.game-over {
                display: block;
            }

            .grid-container {
                position: absolute;
                z-index: 1;
            }

            .grid-row {
                margin-bottom: 10px;
            }

            .grid-row:last-child {
                margin-bottom: 0;
            }

            .grid-row:after {
                content: "";
                display: block;
                clear: both;
            }

            .grid-cell {
                width: 57.5px;
                height: 57.5px;
                margin-right: 10px;
                float: left;
                border-radius: 3px;
                background: rgba(238, 228, 218, 0.35);
            }

            .grid-cell:last-child {
                margin-right: 0;
            }

            .tile-container {
                position: absolute;
                z-index: 2;
            }

            .tile, .tile .tile-inner {
                width: 58px;
                height: 58px;
                line-height: 58px;
            }

            .tile.tile-position-1-1 {
                -webkit-transform: translate(0px, 0px);
                -moz-transform: translate(0px, 0px);
                transform: translate(0px, 0px);
            }

            .tile.tile-position-1-2 {
                -webkit-transform: translate(0px, 67px);
                -moz-transform: translate(0px, 67px);
                transform: translate(0px, 67px);
            }

            .tile.tile-position-1-3 {
                -webkit-transform: translate(0px, 135px);
                -moz-transform: translate(0px, 135px);
                transform: translate(0px, 135px);
            }

            .tile.tile-position-1-4 {
                -webkit-transform: translate(0px, 202px);
                -moz-transform: translate(0px, 202px);
                transform: translate(0px, 202px);
            }

            .tile.tile-position-2-1 {
                -webkit-transform: translate(67px, 0px);
                -moz-transform: translate(67px, 0px);
                transform: translate(67px, 0px);
            }

            .tile.tile-position-2-2 {
                -webkit-transform: translate(67px, 67px);
                -moz-transform: translate(67px, 67px);
                transform: translate(67px, 67px);
            }

            .tile.tile-position-2-3 {
                -webkit-transform: translate(67px, 135px);
                -moz-transform: translate(67px, 135px);
                transform: translate(67px, 135px);
            }

            .tile.tile-position-2-4 {
                -webkit-transform: translate(67px, 202px);
                -moz-transform: translate(67px, 202px);
                transform: translate(67px, 202px);
            }

            .tile.tile-position-3-1 {
                -webkit-transform: translate(135px, 0px);
                -moz-transform: translate(135px, 0px);
                transform: translate(135px, 0px);
            }

            .tile.tile-position-3-2 {
                -webkit-transform: translate(135px, 67px);
                -moz-transform: translate(135px, 67px);
                transform: translate(135px, 67px);
            }

            .tile.tile-position-3-3 {
                -webkit-transform: translate(135px, 135px);
                -moz-transform: translate(135px, 135px);
                transform: translate(135px, 135px);
            }

            .tile.tile-position-3-4 {
                -webkit-transform: translate(135px, 202px);
                -moz-transform: translate(135px, 202px);
                transform: translate(135px, 202px);
            }

            .tile.tile-position-4-1 {
                -webkit-transform: translate(202px, 0px);
                -moz-transform: translate(202px, 0px);
                transform: translate(202px, 0px);
            }

            .tile.tile-position-4-2 {
                -webkit-transform: translate(202px, 67px);
                -moz-transform: translate(202px, 67px);
                transform: translate(202px, 67px);
            }

            .tile.tile-position-4-3 {
                -webkit-transform: translate(202px, 135px);
                -moz-transform: translate(202px, 135px);
                transform: translate(202px, 135px);
            }

            .tile.tile-position-4-4 {
                -webkit-transform: translate(202px, 202px);
                -moz-transform: translate(202px, 202px);
                transform: translate(202px, 202px);
            }

            .tile .tile-inner {
                font-size: 35px;
            }

            .game-message p {
                font-size: 30px !important;
                height: 30px !important;
                line-height: 30px !important;
                margin-top: 90px !important;
            }

            .game-message .lower {
                margin-top: 30px !important;
            }
        }

    </style>
    <style>
        .score-container:after {
            content: "Score";
        }

        .best-container:after {
            content: "Best";
        }
    </style>

    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no">
    <style data-id="immersive-translate-input-injected-css">
    .immersive-translate-input {
        position: absolute;
        top: 0;
        right: 0;
        left: 0;
        bottom: 0;
        z-index: 2147483647;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .immersive-translate-loading-spinner {
        vertical-align: middle !important;
        width: 10px !important;
        height: 10px !important;
        display: inline-block !important;
        margin: 0 4px !important;
        border: 2px rgba(221, 244, 255, 0.6) solid !important;
        border-top: 2px rgba(0, 0, 0, 0.375) solid !important;
        border-left: 2px rgba(0, 0, 0, 0.375) solid !important;
        border-radius: 50% !important;
        padding: 0 !important;
        -webkit-animation: immersive-translate-loading-animation 0.6s infinite linear !important;
        animation: immersive-translate-loading-animation 0.6s infinite linear !important;
    }

    /*@-webkit-keyframes immersive-translate-loading-animation {*/
    /*    from {*/
    /*        -webkit-transform: rotate(0deg);*/
    /*    }*/

    /*    to {*/
    /*        -webkit-transform: rotate(359deg);*/
    /*    }*/
    /*}*/

    /*@keyframes immersive-translate-loading-animation {*/
    /*    from {*/
    /*        transform: rotate(0deg);*/
    /*    }*/

    /*    to {*/
    /*        transform: rotate(359deg);*/
    /*    }*/
    /*}*/


    .immersive-translate-input-loading {
        --loading-color: #f78fb6;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: block;
        margin: 12px auto;
        position: relative;
        color: white;
        left: -100px;
        box-sizing: border-box;
        animation: immersiveTranslateShadowRolling 1.5s linear infinite;
    }

    /*@keyframes immersiveTranslateShadowRolling {*/
    /*    0% {*/
    /*        box-shadow: 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0);*/
    /*    }*/

    /*    12% {*/
    /*        box-shadow: 100px 0 var(--loading-color), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0);*/
    /*    }*/

    /*    25% {*/
    /*        box-shadow: 110px 0 var(--loading-color), 100px 0 var(--loading-color), 0px 0 rgba(255, 255, 255, 0), 0px 0 rgba(255, 255, 255, 0);*/
    /*    }*/

    /*    36% {*/
    /*        box-shadow: 120px 0 var(--loading-color), 110px 0 var(--loading-color), 100px 0 var(--loading-color), 0px 0 rgba(255, 255, 255, 0);*/
    /*    }*/

    /*    50% {*/
    /*        box-shadow: 130px 0 var(--loading-color), 120px 0 var(--loading-color), 110px 0 var(--loading-color), 100px 0 var(--loading-color);*/
    /*    }*/

    /*    62% {*/
    /*        box-shadow: 200px 0 rgba(255, 255, 255, 0), 130px 0 var(--loading-color), 120px 0 var(--loading-color), 110px 0 var(--loading-color);*/
    /*    }*/

    /*    75% {*/
    /*        box-shadow: 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 130px 0 var(--loading-color), 120px 0 var(--loading-color);*/
    /*    }*/

    /*    87% {*/
    /*        box-shadow: 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 130px 0 var(--loading-color);*/
    /*    }*/

    /*    100% {*/
    /*        box-shadow: 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0), 200px 0 rgba(255, 255, 255, 0);*/
    /*    }*/
    /*}*/


    .immersive-translate-search-recomend {
        border: 1px solid #dadce0;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
        position: relative;
        font-size: 16px;
    }

    .immersive-translate-search-enhancement-en-title {
        color: #4d5156;
    }

    /* dark */
    @media (prefers-color-scheme: dark) {
        .immersive-translate-search-recomend {
            border: 1px solid #3c4043;
        }

        .immersive-translate-close-action svg {
            fill: #bdc1c6;
        }

        .immersive-translate-search-enhancement-en-title {
            color: #bdc1c6;
        }
    }


    .immersive-translate-search-settings {
        position: absolute;
        top: 16px;
        right: 16px;
        cursor: pointer;
    }

    .immersive-translate-search-recomend::before {
        /* content: " "; */
        /* width: 20px; */
        /* height: 20px; */
        /* top: 16px; */
        /* position: absolute; */
        /* background: center / contain url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAxlBMVEUAAADpTInqTIjpSofnSIfqS4nfS4XqS4nqTIjsTYnrTInqTIroS4jvQIDqTIn////+/v7rSYjpTIn8/v7uaZzrTIr9/f3wfansWJL88/b85e73qc39+/v3xNnylrvrVI/98fb62Obva5/8+fr76vH4y9zpSIj74e353Oj1ocTzm77xhK/veKbtYpjsXJTqU47oTInxjrXyh7L99fj40eH2ttH1udD3sc31ssz1rMnykLXucqPtbqD85e/1xdn2u9DzqcXrUY6FaJb8AAAADnRSTlMA34BgIM8Q37/fz7+/EGOHcVQAAAGhSURBVDjLhZPncuowEEZFTW7bXVU7xsYYTO/p7bb3f6lICIOYJOT4h7/VnFmvrBFjrF3/CR/SajBHswafctG0Qg3O8O0Xa8BZ6uw7eLjqr30SofCDVSkemMinfL1ecy20r5ygR5zz3ArcAqJExPTPKhDENEmS30Q9+yo4lEQkqVTiIEAHCT10xWERRdH0Bq0aCOPZNDV3s0xaYce1lHEoDHU8wEh3qRJypNcTAeKUIjgKMeGLDoRCLVLTVf+Ownj8Kk6H9HM6QXPgYjQSB0F00EJEu10ILQrs/QeP77BSSr0MzLOyuJJQbnUoOOIUI/A8EeJk9E4YUHUWiRyTVKGgQUB8/3e/NpdGlfI+FMQyWsCBWyz4A/ZyHXyiiz0Ne5aGZssoxRmcChw8/EFKQ5JwwkUo3FRT5yXS7q+Y/rHDZmFktzpGMvO+5QofA4FPpEmGw+EWRCFvnaof7Zhe8NuYSLR0xErKLThUSs8gnODh87ssy6438yzbLzxl012HS19vfCf3CNhnbWOL1eEsDda+gDPUvri8tSZzNFrwIZf1NmNvqC1I/t8j7nYAAAAASUVORK5CYII='); */
    }

    .immersive-translate-search-title {
    }

    .immersive-translate-search-title-wrapper {
    }

    .immersive-translate-search-time {
        font-size: 12px;
        margin: 4px 0 24px;
        color: #70757a;
    }

    .immersive-translate-expand-items {
        display: none;
    }

    .immersive-translate-search-more {
        margin-top: 16px;
        font-size: 14px;
    }

    .immersive-translate-modal {
        display: none;
        position: fixed;
        z-index: 2147483647;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        overflow: auto;
        background-color: rgb(0, 0, 0);
        background-color: rgba(0, 0, 0, 0.4);
        font-size: 15px;
    }

    .immersive-translate-modal-content {
        background-color: #fefefe;
        margin: 15% auto;
        padding: 20px;
        border: 1px solid #888;
        border-radius: 10px;
        width: 80%;
        max-width: 500px;
        font-family: system-ui, -apple-system, "Segoe UI", "Roboto", "Ubuntu",
        "Cantarell", "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji",
        "Segoe UI Symbol", "Noto Color Emoji";
    }

    .immersive-translate-modal-title {
        font-size: 1.3rem;
        font-weight: 500;
        margin-bottom: 20px;
        color: hsl(205, 20%, 32%);
    }

    .immersive-translate-modal-body {
        color: hsl(205, 20%, 32%);
        word-break: break-all;
    }

    .immersive-translate-close {
        color: #aaa;
        float: right;
        font-size: 28px;
        font-weight: bold;
    }

    .immersive-translate-close:hover,
    .immersive-translate-close:focus {
        color: black;
        text-decoration: none;
        cursor: pointer;
    }

    .immersive-translate-modal-footer {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        margin-top: 20px;
    }

    .immersive-translate-btn {
        width: fit-content;
        color: #fff;
        background-color: #ea4c89;
        border: none;
        font-size: 14px;
        margin: 5px;
        padding: 10px 20px;
        font-size: 1rem;
        border-radius: 5px;
        display: flex;
        align-items: center;
        cursor: pointer;
        transition: background-color 0.3s ease;
    }

    .immersive-translate-btn:hover {
        background-color: #f082ac;
    }

    .immersive-translate-cancel-btn {
        /* gray color */
        background-color: rgb(89, 107, 120);
    }


    .immersive-translate-cancel-btn:hover {
        background-color: hsl(205, 20%, 32%);
    }


    .immersive-translate-btn svg {
        margin-right: 5px;
    }

    .immersive-translate-link {
        cursor: pointer;
        user-select: none;
        -webkit-user-drag: none;
        text-decoration: none;
        color: #007bff;
        -webkit-tap-highlight-color: rgba(0, 0, 0, .1);
    }

    .immersive-translate-primary-link {
        cursor: pointer;
        user-select: none;
        -webkit-user-drag: none;
        text-decoration: none;
        color: #ea4c89;
        -webkit-tap-highlight-color: rgba(0, 0, 0, .1);
    }

    .immersive-translate-modal input[type="radio"] {
        margin: 0 6px;
        cursor: pointer;
    }

    .immersive-translate-modal label {
        cursor: pointer;
    }

    .immersive-translate-close-action {
        position: absolute;
        top: 2px;
        right: 0px;
        cursor: pointer;
    }
`
