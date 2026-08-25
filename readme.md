koishi-plugin-number-merge-game
========================

[<img alt="github" src="https://img.shields.io/badge/github-araea/2048_game-8da0cb?style=for-the-badge&labelColor=555555&logo=github" height="20">](https://github.com/araea/koishi-plugin-number-merge-game)
[<img alt="npm" src="https://img.shields.io/npm/v/koishi-plugin-number-merge-game.svg?style=for-the-badge&color=fc8d62&logo=npm" height="20">](https://www.npmjs.com/package/koishi-plugin-number-merge-game)

Koishi 的 2048 游戏插件。

## 使用

1. 安装 `monetary`、`database` 和 `puppeteer` 插件。
2. `2048Game.加入` 加入，`2048Game.开始` 开局，然后 `2048Game.移动 左左上`。

## 指令

| 指令 | 说明 |
| --- | --- |
| `2048Game.加入 [投入金额]` | 加入游戏，再次执行可修改投入 |
| `2048Game.退出` | 退出并退还投入 |
| `2048Game.开始 [网格大小]` | 开局。网格 4 ~ 8，只有 4 是经典模式，才记分发奖 |
| `2048Game.移动 <方向串>` | `上/s/u`、`下/x/d`、`左/z/l`、`右/y/r`，可连写如 `左左上` |
| `2048Game.重置` | 强制重置本局 |
| `2048Game.历史最高 [-a]` | 本群最高记录，`-a` 为跨群 |
| `2048Game.排行榜 [类型] [人数]` | 类型：胜场 / 输场 / 最高分数 / 最高数字 / 损益 |
| `2048Game.查询玩家记录 [@某人]` | 查询记录，默认查自己 |

开启配置项 `isMobileCommandMiddlewarePrefixFree` 后，游戏中直接发送 `左左上` 即可移动，
无需指令前缀（整条消息必须全部由方向字符组成，普通聊天不会被误触发）。

## 致谢

- [Koishi](https://koishi.chat/) - 机器人框架
- [2048.org](https://www.2048.org/) - 游戏资源
- [Koishi 论坛](https://forum.koishi.xyz/t/topic/6595) - 插件动力来源

## QQ 群

- 956758505

<br>

#### License

<sup>
Licensed under either of <a href="LICENSE-APACHE">Apache License, Version
2.0</a> or <a href="LICENSE-MIT">MIT license</a> at your option.
</sup>

<br>

<sub>
Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this crate by you, as defined in the Apache-2.0 license, shall
be dual licensed as above, without any additional terms or conditions.
</sub>
