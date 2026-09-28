# 2048

Koishi 插件：2048 数字合并小游戏，支持同频道对局、生涯战绩与排行榜

[![GitHub](https://img.shields.io/badge/GitHub-araea%2Fkoishi--plugin--number--merge--game-181717?logo=github&logoColor=white)](https://github.com/araea/koishi-plugin-number-merge-game)
[![npm](https://img.shields.io/npm/v/koishi-plugin-number-merge-game?logo=npm&logoColor=white&color=CB3837)](https://www.npmjs.com/package/koishi-plugin-number-merge-game)

## 安装

```sh
npm i koishi-plugin-number-merge-game
```

启用插件，并安装 `database` 服务。棋盘图片需要 `puppeteer` 服务，不可用时使用文本棋盘。

## 快速使用

发送 `2048` 开一局，之后直接发送 上 / 下 / 左 / 右（或 WASD、方向串），多个方向可连续输入。达到 2048 会记录成就，游戏可继续。

| 指令 | 说明 |
| --- | --- |
| `2048` | 开始游戏；已有对局时查看棋盘 |
| `2048.移动 <方向串>` | 移动方块，例如 `2048.移动 左左上` |
| `2048.战绩 [target:user]` | 查看生涯战绩 |
| `2048.排行榜 [count:posint]` | 查看综合排行榜 |
| `2048.结束` | 由发起者结束当前对局 |

## 配置

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `defaultMaxLeaderboardEntries` | number | `10` | 排行榜默认显示的人数 |
| `disableImages` | boolean | `false` | 全部改用文本，不发送棋盘图片 |
| `retractDelay` | number | `0` | 自动撤回延迟（秒），0 表示不撤回 |
| `imageType` | `png` / `jpeg` / `webp` | `png` | 发送的图片格式 |
| `enableDirectInput` | boolean | `true` | 对局中直接发送方向串即可移动 |

## 限制 / 风险

需要 `database` 服务。棋盘图片依赖 `puppeteer`，未安装或渲染失败时自动回退到文本棋盘。自动撤回仅对两分钟内的消息有效。

## 链接

- [设计系统](DESIGN_SYSTEM.md)
- [更新日志](CHANGELOG.md)
- [MIT](LICENSE-MIT) / [Apache-2.0](LICENSE-APACHE)
