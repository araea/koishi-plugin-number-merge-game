koishi-plugin-number-merge-game
========================

[<img alt="github" src="https://img.shields.io/badge/github-araea/2048_game-8da0cb?style=for-the-badge&labelColor=555555&logo=github" height="20">](https://github.com/araea/koishi-plugin-number-merge-game)
[<img alt="npm" src="https://img.shields.io/npm/v/koishi-plugin-number-merge-game.svg?style=for-the-badge&color=fc8d62&logo=npm" height="20">](https://www.npmjs.com/package/koishi-plugin-number-merge-game)

Koishi 的 2048 游戏插件。

## 使用

1. 安装 `monetary`，`database` 和 `puppeteer` 插件。
2. 设置指令别名。

## 特殊指令

- `2048Game.移动 [操作方向]`：移动操作，可选 `上/s/u`，`下/x/d`，`左/z/l`，`右/y/r`。可同时输入多个方向。
- `2048Game.历史最高`：查看历史最高记录，可选参数 `-a` 跨群查询。
- `2048Game.查询玩家记录 [@指定用户]`：查询玩家游戏记录信息，无参数则默认为指令发送者。

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
