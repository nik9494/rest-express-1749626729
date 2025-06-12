import { 
  users, type User, type InsertUser,
  rooms, type Room, type InsertRoom,
  participants, type Participant, type InsertParticipant,
  games, type Game, type InsertGame,
  taps, type Tap, type InsertTap,
  transactions, type Transaction, type InsertTransaction,
  wallets, type Wallet, type InsertWallet,
  referrals, type Referral, type InsertReferral,
  referralUses, type ReferralUse, type InsertReferralUse,
  bonusProgress, type BonusProgress, type InsertBonusProgress
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, or, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByTelegramId(telegramId: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<Omit<User, "id">>): Promise<User | undefined>;

  // Wallet operations
  getWallet(userId: string): Promise<Wallet | undefined>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;

  // Room operations
  getRoom(id: string): Promise<Room | undefined>;
  getRoomByCode(code: string): Promise<Room | undefined>;
  getActiveRooms(type?: string, limit?: number): Promise<Room[]>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, data: Partial<Omit<Room, "id">>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<boolean>;

  // Participant operations
  getParticipant(roomId: string, userId: string): Promise<Participant | undefined>;
  getRoomParticipants(roomId: string): Promise<Participant[]>;
  addParticipant(participant: InsertParticipant): Promise<Participant>;
  removeParticipant(roomId: string, userId: string): Promise<boolean>;

  // Game operations
  getGame(id: string): Promise<Game | undefined>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(id: string, data: Partial<Omit<Game, "id">>): Promise<Game | undefined>;
  getActiveGame(roomId: string): Promise<Game | undefined>;
  getGamesByRoomId(roomId: string, limit?: number): Promise<Game[]>;

  // Tap operations
  addTaps(tap: InsertTap): Promise<Tap>;
  getGameTaps(gameId: string): Promise<Tap[]>;
  getUserTapCount(gameId: string, userId: string): Promise<number>;

  // Transaction operations
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: string): Promise<Transaction[]>;

  // Referral operations
  getReferral(code: string): Promise<Referral | undefined>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  createReferralUse(referralUse: InsertReferralUse): Promise<ReferralUse>;

  // Bonus progress operations
  getBonusProgress(userId: string): Promise<BonusProgress | undefined>;
  createBonusProgress(bonus: InsertBonusProgress): Promise<BonusProgress>;
  updateBonusProgress(userId: string, data: Partial<Omit<BonusProgress, "id" | "user_id">>): Promise<BonusProgress | undefined>;

  // Leaderboard operations
  getLeaderboard(period: 'today' | 'week' | 'alltime', limit?: number): Promise<any[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByTelegramId(telegramId: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.telegram_id, telegramId));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [createdUser] = await db.insert(users).values(user).returning();
    return createdUser;
  }

  async updateUser(id: string, data: Partial<Omit<User, "id">>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  // Новый метод: getOrCreateUserByTelegramId
  async getOrCreateUserByTelegramId(
    telegramId: number,
    username: string,
    defaults: Partial<InsertUser> = {}
  ): Promise<User> {
    // 1) Пытаемся получить существующего
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.telegram_id, telegramId));
    if (existing) {
      return existing;
    }

    // 2) Если нет — создаём нового
    // Гарантируем, что referral_code всегда есть
    const referral_code = defaults.referral_code || Math.random().toString(36).substring(2, 10).toUpperCase();
    const insertData: InsertUser = {
      id: defaults.id!,
      telegram_id: telegramId,
      username,
      balance_stars: typeof defaults.balance_stars === 'string' ? defaults.balance_stars : String(defaults.balance_stars ?? '100'),
      has_ton_wallet: defaults.has_ton_wallet ?? false,
      photo_url: defaults.photo_url ?? null,
      created_at: defaults.created_at ?? new Date(),
      referral_code,
    };

    const [created] = await db.insert(users).values(insertData).returning();
    return created;
  }

  // Wallet operations
  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db.select().from(wallets).where(eq(wallets.user_id, userId));
    return wallet;
  }

  async createWallet(wallet: InsertWallet): Promise<Wallet> {
    const [createdWallet] = await db.insert(wallets).values(wallet).returning();
    return createdWallet;
  }

  // Room operations
  async getRoom(id: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room;
  }

  async getRoomByCode(code: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.code, code));
    return room;
  }

  async getActiveRooms(type?: string, limit = 10): Promise<Room[]> {
    let query = db.select().from(rooms).where(eq(rooms.status, 'waiting'));
    if (type) {
      // Если type задан, добавляем фильтр через and()
      query = db.select().from(rooms).where(and(eq(rooms.status, 'waiting'), eq(rooms.type, type)));
    }
    return await query.limit(limit).orderBy(rooms.created_at);
  }

  async createRoom(room: InsertRoom): Promise<Room> {
    const [createdRoom] = await db.insert(rooms).values(room).returning();
    return createdRoom;
  }

  async updateRoom(id: string, data: Partial<Omit<Room, "id">>): Promise<Room | undefined> {
    const [updatedRoom] = await db
      .update(rooms)
      .set(data)
      .where(eq(rooms.id, id))
      .returning();
    return updatedRoom;
  }

  async deleteRoom(id: string): Promise<boolean> {
    console.log(`[Storage] Deleting room ${id}`);
    try {
      // Сначала удаляем всех участников
      await db
        .delete(participants)
        .where(eq(participants.room_id, id));
      console.log(`[Storage] Deleted participants for room ${id}`);

      // Затем удаляем саму комнату
      const result = await db
        .delete(rooms)
        .where(eq(rooms.id, id));
      console.log(`[Storage] Deleted room ${id}, result:`, result);

      return true;
    } catch (error) {
      console.error(`[Storage] Error deleting room ${id}:`, error);
      return false;
    }
  }

  // Participant operations
  async getParticipant(roomId: string, userId: string): Promise<Participant | undefined> {
    const [participant] = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.room_id, roomId),
          eq(participants.user_id, userId)
        )
      );
    return participant;
  }

  async getRoomParticipants(roomId: string): Promise<Participant[]> {
    return await db
      .select()
      .from(participants)
      .where(eq(participants.room_id, roomId));
  }

  async addParticipant(participant: InsertParticipant): Promise<Participant> {
    const [createdParticipant] = await db
      .insert(participants)
      .values(participant)
      .returning();
    return createdParticipant;
  }

  async removeParticipant(roomId: string, userId: string): Promise<boolean> {
    const result = await db
      .delete(participants)
      .where(
        and(
          eq(participants.room_id, roomId),
          eq(participants.user_id, userId)
        )
      );
    return !!result.rowCount;
  }

  // Game operations
  async getGame(id: string): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game;
  }

  async getActiveGame(roomId: string): Promise<Game | undefined> {
    const [game] = await db
      .select()
      .from(games)
      .where(
        and(
          eq(games.room_id, roomId),
          eq(games.end_time, null)
        )
      )
      .orderBy(desc(games.created_at))
      .limit(1);
    return game;
  }

  async createGame(game: InsertGame): Promise<Game> {
    const [createdGame] = await db.insert(games).values(game).returning();
    return createdGame;
  }

  async updateGame(id: string, data: Partial<Omit<Game, "id">>): Promise<Game | undefined> {
    const [updatedGame] = await db
      .update(games)
      .set(data)
      .where(eq(games.id, id))
      .returning();
    return updatedGame;
  }

  async getGamesByRoomId(roomId: string, limit = 5): Promise<Game[]> {
    return await db
      .select()
      .from(games)
      .where(eq(games.room_id, roomId))
      .orderBy(desc(games.created_at))
      .limit(limit);
  }

  // Tap operations
  async addTaps(tap: InsertTap): Promise<Tap> {
    const [createdTap] = await db.insert(taps).values(tap).returning();
    return createdTap;
  }

  async getGameTaps(gameId: string): Promise<Tap[]> {
    return await db
      .select()
      .from(taps)
      .where(eq(taps.game_id, gameId));
  }

  async getUserTapCount(gameId: string, userId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`sum(${taps.count})` })
      .from(taps)
      .where(
        and(
          eq(taps.game_id, gameId),
          eq(taps.user_id, userId)
        )
      );

    return result[0]?.count || 0;
  }

  // Transaction operations
  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [createdTransaction] = await db
      .insert(transactions)
      .values(transaction)
      .returning();
    return createdTransaction;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.user_id, userId))
      .orderBy(desc(transactions.created_at));
  }

  // Referral operations
  async getReferral(code: string): Promise<Referral | undefined> {
    const [referral] = await db
      .select()
      .from(referrals)
      .where(eq(referrals.code, code));
    return referral;
  }

  async createReferral(referral: InsertReferral): Promise<Referral> {
    const [createdReferral] = await db
      .insert(referrals)
      .values(referral)
      .returning();
    return createdReferral;
  }

  async createReferralUse(referralUse: InsertReferralUse): Promise<ReferralUse> {
    const [createdReferralUse] = await db
      .insert(referralUses)
      .values(referralUse)
      .returning();
    return createdReferralUse;
  }

  // Bonus progress operations
  async getBonusProgress(userId: string): Promise<BonusProgress | undefined> {
    const [progress] = await db
      .select()
      .from(bonusProgress)
      .where(eq(bonusProgress.user_id, userId));
    return progress;
  }

  async createBonusProgress(bonus: InsertBonusProgress): Promise<BonusProgress> {
    const [createdBonus] = await db
      .insert(bonusProgress)
      .values(bonus)
      .returning();
    return createdBonus;
  }

  async updateBonusProgress(
    userId: string,
    data: Partial<Omit<BonusProgress, "id" | "user_id">>
  ): Promise<BonusProgress | undefined> {
    const [updatedBonus] = await db
      .update(bonusProgress)
      .set(data)
      .where(eq(bonusProgress.user_id, userId))
      .returning();
    return updatedBonus;
  }

  // Leaderboard operations
  async getLeaderboard(period: 'today' | 'week' | 'alltime' = 'today', limit = 10): Promise<any[]> {
    let startDate;
    const now = new Date();
    if (period === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      const dayOfWeek = now.getDay();
      const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      startDate = new Date(now.getFullYear(), now.getMonth(), diff);
      startDate.setHours(0, 0, 0, 0);
    }

    // Создаем базовый запрос
    const query = db
      .select({
        user_id: users.id,
        username: users.username,
        photo_url: users.photo_url,
        total_taps: sql<number>`sum(${taps.count})`,
        stars_won: sql<number>`sum(${games.prize_pool})`
      })
      .from(taps)
      .innerJoin(games, eq(taps.game_id, games.id))
      .innerJoin(users, eq(taps.user_id, users.id))
      .groupBy(users.id, users.username, users.photo_url);

    // Добавляем условия если нужно
    if (startDate) {
      query.where(gte(games.created_at, startDate));
    }
    query.where(sql`${games.end_time} IS NOT NULL`);

    // Возвращаем результаты с сортировкой и лимитом
    return await query
      .orderBy(desc(sql<number>`sum(${games.prize_pool})`), desc(sql<number>`sum(${taps.count})`))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();