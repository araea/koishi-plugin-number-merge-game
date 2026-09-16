import { Schema } from 'koishi'

export interface Config {
  defaultMaxLeaderboardEntries: number
  disableImages: boolean
  retractDelay: number
  imageType: 'png' | 'jpeg' | 'webp'
  enableDirectInput: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    defaultMaxLeaderboardEntries: Schema.natural().min(1).default(10).description('排行榜默认显示的人数。'),
  }).description('排行榜设置'),

  Schema.object({
    disableImages: Schema.boolean().default(false).description('全部改用文本，不发送棋盘图片。'),
    retractDelay: Schema.natural().default(0).description('自动撤回延迟（秒），0 表示不撤回。'),
    imageType: Schema.union(['png', 'jpeg', 'webp']).default('png').description('发送的图片格式。'),
  }).description('消息发送设置'),

  Schema.object({
    enableDirectInput: Schema.boolean().default(true)
      .description('对局中直接发送方向串（如 `左左上`）即可移动，无需指令前缀。'),
  }).description('操作设置'),
])
