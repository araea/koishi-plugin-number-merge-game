import { Schema } from 'koishi'

export interface Config {
  maxInvestmentCurrency: number
  defaultMaxLeaderboardEntries: number
  rewardMultiplier2048Win: number
  defaultGridSize2048: number
  retractDelay: number
  imageType: 'png' | 'jpeg' | 'webp'
  isTextToImageConversionEnabled: boolean
  allowNonPlayersToMove2048Tiles: boolean
  isMobileCommandMiddlewarePrefixFree: boolean
  enableContinuedPlayAfter2048Win: boolean
  rewardHighNumbers: boolean
  incrementalRewardForHighNumbers: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    maxInvestmentCurrency: Schema.natural().default(50).description('加入游戏时可投入的最大货币数额。'),
  }).description('游戏投入设置'),

  Schema.object({
    defaultMaxLeaderboardEntries: Schema.natural().min(1).default(10).description('排行榜默认显示的人数。'),
  }).description('排行榜设置'),

  Schema.object({
    rewardMultiplier2048Win: Schema.number().min(0).default(2).description('达成 2048 后的奖励倍数。'),
    defaultGridSize2048: Schema.natural().min(4).max(8).default(4)
      .description('默认网格大小（4 ~ 8）。只有 4 是经典模式，才记分与发奖。'),
  }).description('2048 游戏奖励设置'),

  Schema.object({
    retractDelay: Schema.natural().default(0).description('自动撤回延迟（秒），0 表示不撤回。'),
    imageType: Schema.union(['png', 'jpeg', 'webp']).default('png').description('发送的图片格式。'),
    isTextToImageConversionEnabled: Schema.boolean().default(false)
      .description('把文本回复转成图片，需要 `markdownToImage` 服务。'),
  }).description('消息发送设置'),

  Schema.object({
    allowNonPlayersToMove2048Tiles: Schema.boolean().default(false)
      .description('允许未加入的人移动方块（他们无法投入货币），开启后可以零玩家开局。'),
    isMobileCommandMiddlewarePrefixFree: Schema.boolean().default(false)
      .description('开启后，游戏中直接发送方向字符（如 `左左上`）即可移动，无需指令前缀。'),
    enableContinuedPlayAfter2048Win: Schema.boolean().default(true)
      .description('达成 2048 后询问是否继续游戏。'),
  }).description('2048 游戏操作设置'),

  Schema.object({
    rewardHighNumbers: Schema.boolean().default(true).description('继续游戏后按最高数字追加奖励。'),
    incrementalRewardForHighNumbers: Schema.boolean().default(true).description('追加奖励是否再乘上获胜倍数。'),
  }).description('数字奖励设置'),
])
