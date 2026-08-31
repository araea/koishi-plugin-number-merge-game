koishi-plugin-number-merge-game
========================

[<img alt="github" src="https://img.shields.io/badge/github-araea/2048_game-8da0cb?style=for-the-badge&labelColor=555555&logo=github" height="20">](https://github.com/araea/koishi-plugin-number-merge-game)
[<img alt="npm" src="https://img.shields.io/npm/v/koishi-plugin-number-merge-game.svg?style=for-the-badge&color=fc8d62&logo=npm" height="20">](https://www.npmjs.com/package/koishi-plugin-number-merge-game)

Koishi 的 2048 游戏插件。

## 使用

1. 安装并启用 `database` 和 `puppeteer` 插件。
2. 发送 `2048`，立即开始游戏。
3. 直接发送 `上、下、左、右` 或 `W、A、S、D` 移动方块；方向可以连续输入。

插件只依赖数据库与 Puppeteer。文本消息保持原生发送，棋盘由 Puppeteer 渲染，无需安装货币或
Markdown 转图片服务。

## 指令

| 指令 | 说明 |
| --- | --- |
| `2048` | 开始游戏；已有游戏时查看当前棋盘 |
| `2048.移动 <方向串>` | 显式移动，例如 `2048.移动 左左上` |
| `2048.记录 [@某人]` | 查看个人生涯成就，默认查看自己 |
| `2048.排行 [人数]` | 查看综合成就榜 |
| `2048.结束` | 由本局发起者结束当前游戏 |

游戏无需加入或退出，也没有投入、退款与货币奖励。开始者以及进行过移动的成员会自动成为本局参与者；
达成 2048 后，最高分、最高数字和达成次数会作为生涯成就保存，并可继续挑战更高数字。

直接输入方向默认开启，也可以通过 `enableDirectInput` 配置关闭。插件只接管完全由方向字符组成的消息，
不会误触普通聊天。

## 致谢

- [Koishi](https://koishi.chat/)
- [2048.org](https://www.2048.org/)
- [Koishi 论坛](https://forum.koishi.xyz/t/topic/6595)

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
