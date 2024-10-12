# koishi-plugin-number-merge-game

[![npm](https://img.shields.io/npm/v/koishi-plugin-number-merge-game?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-number-merge-game)

## 简介

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
- https://www.2048.org/ - 游戏资源
- https://forum.koishi.xyz/t/topic/6595 - 插件动力来源

## QQ 群

- 956758505

## License

MIT License © 2024
