/**
 * Shared type definitions used in both client and server
 */

// User type (public facing)
export interface User {
  id: string;
  telegram_id: number;
  username: string;
  balance_stars: number;
  has_ton_wallet: boolean;
  photo_url?: string;
  created_at: Date;
  referral_code?: string;
}

// Player type (simplified user for game context)
export interface Player {
  id: string;
  username: string;
  photo_url?: string;
  taps?: number;
  stars_won?: number;
  total_taps?: number;
  is_observer?: boolean;
}

// Room type
export interface Room {
  id: string;
  creator_id: string;
  type: 'standard' | 'bonus' | 'hero';
  entry_fee: number;
  max_players: number;
  status: 'waiting' | 'active' | 'finished';
  code?: string;
  waiting_time?: number;
  duration?: number;
  created_at: Date;
  participants_count?: number;
  creator?: Player;
}

// Participant type
export interface Participant {
  user_id: string;
  is_observer: boolean;
  joined_at: Date;
  entry_fee: string;
}

// Game type
export interface Game {
  id: string;
  room_id: string;
  start_time: Date;
  end_time?: Date;
  winner_id?: string;
  prize_pool: number;
  duration: number;
  created_at: Date;
}

// Transaction type
export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'entry' | 'payout' | 'fee' | 'referral' | 'payment' | 'refund' | 'bonus';
  description?: string;
  created_at: Date;
}

// Wallet type
export interface Wallet {
  id: string;
  user_id: string;
  ton_address: string;
  created_at: Date;
}

// Bonus progress type
export interface BonusProgress {
  id: string;
  user_id: string;
  taps_so_far: number;
  start_time: Date;
  end_time: Date;
  completed: boolean;
  active?: boolean;
  remaining_time?: number;
}

// WebSocket message types
export enum WebSocketMessageType {
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  TAP = 'tap',
  GAME_START = 'game_start',
  GAME_END = 'game_end',
  PLAYER_REACTION = 'player_reaction',
  PLAYER_JOIN = 'player_join',
  PLAYER_LEAVE = 'player_leave',
  ROOM_UPDATE = 'room_update',
  ERROR = 'error',
  ROOM_DELETED = 'room_deleted' // добавлено для поддержки удаления комнаты
}

// WebSocket message interface
export interface WebSocketMessage {
  type: WebSocketMessageType;
  user_id?: string;
  room_id?: string;
  game_id?: string;
  data?: any;
  timestamp?: number;
}

// Leaderboard entry type
export interface LeaderboardEntry {
  user_id: string;
  username: string;
  photo_url?: string;
  total_taps: number;
  stars_won: number;
}

// Utility types
export type RoomType = 'standard' | 'bonus' | 'hero';
export type RoomStatus = 'waiting' | 'active' | 'finished';
export type TransactionType = 'entry' | 'payout' | 'fee' | 'referral' | 'payment' | 'refund' | 'bonus';
export type LeaderboardPeriod = 'today' | 'week' | 'alltime';
