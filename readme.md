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

- `maxInvestmentCurrency`：加入游戏时可投入的最大货币数额，默认为 50。
- `defaultMaxLeaderboardEntries`：显示排行榜时默认的最大人数，默认为 10。
- `rewardMultiplier2048Win`：达成 2048 赢了之后可得到的货币倍数，默认为 2。
- `imageType`：发送的图片类型，可选 `png`，`jpeg` 或 `webp`，默认为 `png`。
- `enableContinuedPlayAfter2048Win`：是否开启赢得 2048 后的继续游戏功能，默认为 `true`。
- `rewardHighNumbers`：是否对后续的高数字进行奖励，默认为 `true`。
- `incrementalRewardForHighNumbers`：高数字奖励是否依次递增，默认为 `true`。

## 🌼 指令

- `2048Game`：显示 2048 游戏的指令帮助。
- `2048Game.加入 [money:number]`：加入游戏，可选参数为投入的货币数额。
- `2048Game.退出`：退出游戏，如果游戏未开始，会退还投入的货币。
- `2048Game.开始`：开始游戏，需要至少有一个玩家加入。
- `2048Game.重置`：强制重置游戏，不会退还投入的货币。
- `2048Game.移动 [operation:text]`：进行移动操作，参数为方向，可选 `上`，`下`，`左`，`右`，也可以一次输入多个方向。
- `2048Game.历史最高`：查看历史最高记录，可选参数 `-a` 跨群查询。
- `2048Game.排行榜`：查看排行榜相关指令，可选 `胜场`，`输场`，`最高分数`。
- `2048Game.查询玩家记录 [targetUser:text]`：查询玩家游戏记录信息，可选参数为目标玩家的 at 信息。

## 🍧 致谢

* [Koishi](https://koishi.chat/) - 机器人框架

* https://www.2048.org/ - 2048 游戏资源

* https://forum.koishi.xyz/t/topic/6595 - 求插件的帖子（该插件的动力来源） 感谢楼主 xhz （原神大人~）

## ✨ License

MIT License © 2023
