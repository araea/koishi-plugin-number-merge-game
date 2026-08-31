import { Context } from 'koishi'
import { Cell } from './game'

declare module 'koishi' {
  interface Tables {
    game_2048_records: GameRecord
    players_in_2048_playing: GamingPlayer
    player_2048_records: PlayerRecord
  }
}

export interface BestPlayer {
  userId: string
  username: string
}

/** 每个频道一局。 */
export interface GameRecord {
  id: number
  channelId: string
  gameStatus: string
  progress: Cell[][]
  score: number
  isWon: boolean
  isKeepPlaying: boolean
  best: number
  highestNumber: number
  bestPlayers: BestPlayer[]
  gridSize: number
}

/** 本局参与者。开始者和进行过移动的玩家会自动加入。 */
export interface GamingPlayer {
  id: number
  channelId: string
  userId: string
  username: string
}

export interface PlayerRecord {
  id: number
  userId: string
  username: string
  win: number
  best: number
  highestNumber: number
}

export function defineTables(ctx: Context) {
  const key = { primary: 'id', autoInc: true } as const

  ctx.model.extend('game_2048_records', {
    id: 'unsigned',
    channelId: 'string',
    gameStatus: { type: 'string', initial: '未开始' },
    score: 'unsigned',
    best: 'unsigned',
    isWon: { type: 'boolean', initial: false },
    isKeepPlaying: { type: 'boolean', initial: false },
    bestPlayers: { type: 'json', initial: [] },
    progress: { type: 'json', initial: [] },
    highestNumber: 'unsigned',
    gridSize: 'unsigned',
  }, key)

  ctx.model.extend('players_in_2048_playing', {
    id: 'unsigned',
    channelId: 'string',
    userId: 'string',
    username: 'string',
  }, key)

  ctx.model.extend('player_2048_records', {
    id: 'unsigned',
    userId: 'string',
    username: 'string',
    win: 'unsigned',
    best: 'unsigned',
    highestNumber: 'unsigned',
  }, key)
}
