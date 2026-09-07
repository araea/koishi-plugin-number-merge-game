# koishi-plugin-number-merge-game

2048 游戏插件。

## 安装

~~~sh
yarn add koishi-plugin-number-merge-game
~~~

在 Koishi 配置中启用 koishi-plugin-number-merge-game，并提供 database 和 puppeteer 服务。

## 指令

| 指令 | 说明 |
| --- | --- |
| 2048 | 开始游戏；已有游戏时查看棋盘 |
| 2048.移动 &lt;方向串&gt; | 移动，例如 2048.移动 左左上 |
| 2048.记录 [@某人] | 查看生涯成就 |
| 2048.排行 [人数] | 查看成就排行 |
| 2048.结束 | 由发起者结束当前游戏 |

游戏中可发送上、下、左、右或 W、A、S、D，也可连续输入。
达到 2048 后会记录成就，并可继续游戏。

## 许可证

可按 [Apache-2.0](LICENSE-APACHE) 或 [MIT](LICENSE-MIT) 使用。
