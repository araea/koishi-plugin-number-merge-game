# koishi-plugin-number-merge-game

2048 游戏

## 安装

```sh
yarn add koishi-plugin-number-merge-game
```

在 Koishi 配置中启用，并提供 database 服务；puppeteer 可选，用于图片输出。

## 指令

| 指令 | 说明 |
| --- | --- |
| `2048` | 开始游戏；已有游戏时查看棋盘 |
| `2048.移动 <方向串>` | 移动，例如 `2048.移动 左左上` |
| `2048.战绩 [@某人]` | 生涯成就 |
| `2048.排行榜 [人数]` | 成就排行 |
| `2048.结束` | 由发起者结束当前游戏 |

游戏中可发送上、下、左、右或 W、A、S、D，也可连续输入。达到 2048 后记录成就，并可继续游戏。

## 许可证

可按 [Apache-2.0](LICENSE-APACHE) 或 [MIT](LICENSE-MIT) 使用。
