koishi-plugin-number-merge-game
========================

[<img alt="github" src="https://img.shields.io/badge/github-araea/koishi__plugin__number__merge__game-8da0cb?style=for-the-badge&labelColor=555555&logo=github" height="20">](https://github.com/araea/koishi-plugin-number-merge-game)
[<img alt="npm" src="https://img.shields.io/npm/v/koishi-plugin-number-merge-game.svg?style=for-the-badge&color=fc8d62&logo=npm" height="20">](https://www.npmjs.com/package/koishi-plugin-number-merge-game)

Koishi 的 2048 游戏插件。

## 使用

发送 `2048` 开局。游戏中发送 `上、下、左、右` 或 `W、A、S、D`，支持连续输入。

## 指令

| 指令 | 说明 |
| --- | --- |
| `2048` | 开始游戏；已有游戏时查看棋盘 |
| `2048.移动 <方向串>` | 显式移动，如 `2048.移动 左左上` |
| `2048.记录 [@某人]` | 查看生涯成就 |
| `2048.排行 [人数]` | 成就排行榜 |
| `2048.结束` | 发起者结束本局 |

达成 2048 记入生涯记录，之后可继续挑战更高数字。

## QQ 群

956758505

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
