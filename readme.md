# koishi-plugin-number-merge-game 🎲

[![npm](https://img.shields.io/npm/v/koishi-plugin-number-merge-game?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-number-merge-game)

## 🎐 简介

`koishi-plugin-number-merge-game` 是一个基于 Koishi 框架的插件，它可以让您的机器人主持 2048 游戏。

您可以邀请您的好友一起加入游戏，互动操作，争夺最高分，甚至还可以赚取虚拟货币！

## 🎉 安装

您可以通过 Koishi 插件市场搜索并安装该插件。

## 🌈 使用

- 启动必要的服务。您需要启用 `monetary`，`database` 和 `puppeteer` 插件，以实现货币系统，数据存储和图片生成的功能。
- 建议自行添加指令别名，以方便您和您的用户使用。

## ⚙️ 配置项

### 游戏投入设置

- `maxInvestmentCurrency`：加入游戏时可投入的最大货币数额，默认为 `50`。

### 排行榜设置

- `defaultMaxLeaderboardEntries`：显示排行榜时默认的最大人数，默认为 `10`。

### 2048 游戏奖励设置

- `rewardMultiplier2048Win`：达成 2048 赢了之后可得到的货币倍数，默认为 `2`。
- `defaultGridSize2048`：开始 2048 游戏时默认的游戏网格大小，范围 `4~8`，值为 `4` 时为经典模式，才会记分和奖励，默认为 `4`。

### 消息发送设置

- `retractDelay`：自动撤回等待的时间，默认值为 0，单位是秒。值为 0 时不启用自动撤回功能。
- `imageType`：发送的图片类型，可选 `png`，`jpeg` 或 `webp`，默认为 `png`。
- `isTextToImageConversionEnabled`：是否开启将文本转为图片的功能（可选），如需启用，需要启用 `markdownToImage`
  服务，默认为 `false`。

### 2048 游戏操作设置

- `allowNonPlayersToMove2048Tiles`：是否允许未加入游戏的人进行 2048 游戏的移动操作（无法投入货币），开启后可以 0
  玩家开始游戏，默认为 `false`。
- `isMobileCommandMiddlewarePrefixFree`：是否开启移动指令无前缀的中间件，默认为 `false`。
- `enableContinuedPlayAfter2048Win`：是否开启赢得 2048 后的继续游戏功能，默认为 `true`。

### 数字奖励设置

- `rewardHighNumbers`：是否对后续的高数字进行奖励，默认为 `true`。
- `incrementalRewardForHighNumbers`：高数字奖励是否依次递增，默认为 `true`。

## 🌼 指令

### 游戏操作

- `2048Game`：显示 2048 游戏的指令帮助。
- `2048Game.加入 [money:number]`：加入游戏，可选参数为投入的货币数额。
- `2048Game.退出`：退出游戏，如果游戏未开始，会退还投入的货币。
- `2048Game.开始 [gridSize:number]`：开始游戏，需要至少有一个玩家加入。
- `2048Game.重置`：强制重置游戏，不会退还投入的货币。
- `2048Game.移动 [operation:text]`：进行移动操作，参数为方向，可选 `上/s/u`，`下/x/d`，`左/z/l`，`右/y/r`，也可以一次输入多个方向。

### 游戏记录

- `2048Game.历史最高`：查看历史最高记录，可选参数 `-a` 跨群查询。
- `2048Game.排行榜 [number:number]`：查看排行榜相关指令，可选 `胜场`，`输场`，`最高分数`，`最高数字`，`损益`。
- `2048Game.查询玩家记录 [targetUser:text]`：查询玩家游戏记录信息，可选参数为目标玩家的 at 信息，没有参数则默认为指令发送者。

## 🍧 致谢

* [Koishi](https://koishi.chat/) - 机器人框架

* https://www.2048.org/ - 2048 游戏资源

* https://forum.koishi.xyz/t/topic/6595 - 求插件的帖子（该插件的动力来源） 感谢楼主 xhz （原神大人~）

## ✨ License

MIT License © 2023
