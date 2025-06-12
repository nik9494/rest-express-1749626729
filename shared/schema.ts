import { 
  pgTable, 
  text, 
  serial, 
  integer, 
  boolean, 
  timestamp, 
  uuid, 
  bigint, 
  numeric, 
  unique, 
  primaryKey,
  foreignKey
} from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  telegram_id: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username").notNull(),
  balance_stars: numeric("balance_stars").notNull().default("0"), // Stars - внутриигровая наградная валюта
  has_ton_wallet: boolean("has_ton_wallet").notNull().default(false),
  photo_url: text("photo_url"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  referral_code: text("referral_code").notNull().unique(),
  
});

// Users relations
export const usersRelations = relations(users, ({ many }) => ({
  wallets: many(wallets),
  participations: many(participants),
  createdRooms: many(rooms, { relationName: 'creator' }),
  wonGames: many(games, { relationName: 'winner' }),
  taps: many(taps),
  transactions: many(transactions),
  referrals: many(referrals),
  bonusProgress: many(bonusProgress),
}));

// Wallets table
export const wallets = pgTable("wallets", {
  id: uuid("id").primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  ton_address: text("ton_address").notNull().unique(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Wallets relations
export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, { fields: [wallets.user_id], references: [users.id] }),
}));

// Rooms table
export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey(),
  creator_id: uuid("creator_id").notNull().references(() => users.id),
  type: text("type").notNull().default("standard"),
  entry_fee: numeric("entry_fee").notNull(),
  max_players: integer("max_players").notNull().default(4),
  status: text("status").notNull().default("waiting"),
  code: text("code").unique(),
  waiting_time: integer("waiting_time"),
  duration: integer("duration"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Rooms relations
export const roomsRelations = relations(rooms, ({ one, many }) => ({
  creator: one(users, { fields: [rooms.creator_id], references: [users.id], relationName: 'creator' }),
  participants: many(participants),
  games: many(games),
}));

// Participants table
export const participants = pgTable("participants", {
  room_id: uuid("room_id").notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  joined_at: timestamp("joined_at").notNull().defaultNow(),
  is_observer: boolean("is_observer").notNull().default(false),
  entry_fee: numeric("entry_fee").notNull()
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.room_id, table.user_id] }),
  };
});

// Participants relations
export const participantsRelations = relations(participants, ({ one }) => ({
  room: one(rooms, { fields: [participants.room_id], references: [rooms.id] }),
  user: one(users, { fields: [participants.user_id], references: [users.id] }),
}));

// Games table
export const games = pgTable("games", {
  id: uuid("id").primaryKey(),
  room_id: uuid("room_id").notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  start_time: timestamp("start_time").notNull(),
  end_time: timestamp("end_time"),
  winner_id: uuid("winner_id").references(() => users.id),
  prize_pool: numeric("prize_pool").notNull(),
  duration: integer("duration").notNull().default(60),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Games relations
export const gamesRelations = relations(games, ({ one, many }) => ({
  room: one(rooms, { fields: [games.room_id], references: [rooms.id] }),
  winner: one(users, { fields: [games.winner_id], references: [users.id], relationName: 'winner' }),
  taps: many(taps),
}));

// Taps table
export const taps = pgTable("taps", {
  id: uuid("id").primaryKey(),
  game_id: uuid("game_id").notNull().references(() => games.id, { onDelete: 'cascade' }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  count: integer("count").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Taps relations
export const tapsRelations = relations(taps, ({ one }) => ({
  game: one(games, { fields: [taps.game_id], references: [games.id] }),
  user: one(users, { fields: [taps.user_id], references: [users.id] }),
}));

// Transactions table
export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: numeric("amount").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Transactions relations
export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.user_id], references: [users.id] }),
}));

// Referrals table
export const referrals = pgTable("referrals", {
  code: text("code").primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  bonus_amount: numeric("bonus_amount").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// Referrals relations
export const referralsRelations = relations(referrals, ({ one, many }) => ({
  user: one(users, { fields: [referrals.user_id], references: [users.id] }),
  uses: many(referralUses),
}));

// Referral uses table
export const referralUses = pgTable("referral_uses", {
  id: uuid("id").primaryKey(),
  code: text("code").notNull().references(() => referrals.code),
  referred_user: uuid("referred_user").notNull().references(() => users.id, { onDelete: 'cascade' }),
  used_at: timestamp("used_at").notNull().defaultNow(),
});

// Referral uses relations
export const referralUsesRelations = relations(referralUses, ({ one }) => ({
  referral: one(referrals, { fields: [referralUses.code], references: [referrals.code] }),
  user: one(users, { fields: [referralUses.referred_user], references: [users.id] }),
}));

// Bonus progress table
export const bonusProgress = pgTable("bonus_progress", {
  id: uuid("id").primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  taps_so_far: bigint("taps_so_far", { mode: "number" }).notNull().default(0),
  start_time: timestamp("start_time").notNull(),
  end_time: timestamp("end_time").notNull(),
  completed: boolean("completed").notNull().default(false),
});

// Bonus progress relations
export const bonusProgressRelations = relations(bonusProgress, ({ one }) => ({
  user: one(users, { fields: [bonusProgress.user_id], references: [users.id] }),
}));

// Define insert schemas
export const insertUserSchema = createInsertSchema(users);
export const insertWalletSchema = createInsertSchema(wallets);
export const insertRoomSchema = createInsertSchema(rooms);
export const insertParticipantSchema = createInsertSchema(participants);
export const insertGameSchema = createInsertSchema(games);
export const insertTapSchema = createInsertSchema(taps);
export const insertTransactionSchema = createInsertSchema(transactions);
export const insertReferralSchema = createInsertSchema(referrals);
export const insertReferralUseSchema = createInsertSchema(referralUses);
export const insertBonusProgressSchema = createInsertSchema(bonusProgress);

// Define select schemas
export const selectUserSchema = createSelectSchema(users);
export const selectWalletSchema = createSelectSchema(wallets);
export const selectRoomSchema = createSelectSchema(rooms);
export const selectParticipantSchema = createSelectSchema(participants);
export const selectGameSchema = createSelectSchema(games);
export const selectTapSchema = createSelectSchema(taps);
export const selectTransactionSchema = createSelectSchema(transactions);
export const selectReferralSchema = createSelectSchema(referrals);
export const selectReferralUseSchema = createSelectSchema(referralUses);
export const selectBonusProgressSchema = createSelectSchema(bonusProgress);

// Таблица для обменного курса валют
export const exchangeRates = pgTable("exchange_rates", {
  id: uuid("id").primaryKey(),
  from_currency: text("from_currency").notNull(), // TON, SCH, STARS
  to_currency: text("to_currency").notNull(), // TON, SCH, STARS
  rate: numeric("rate").notNull(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// Таблица для настроек пользователей
export const userSettings = pgTable("user_settings", {
  user_id: uuid("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  notification_enabled: boolean("notification_enabled").notNull().default(true),
  sound_enabled: boolean("sound_enabled").notNull().default(true),
  haptic_enabled: boolean("haptic_enabled").notNull().default(true),
  theme: text("theme").notNull().default("auto"),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// Связи для настроек пользователей
export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.user_id], references: [users.id] }),
}));

// Таблица для блокировок читеров
export const cheatBlocks = pgTable("cheat_blocks", {
  id: uuid("id").primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  game_id: uuid("game_id").references(() => games.id),
  reason: text("reason").notNull(),
  evidence: text("evidence"),
  tap_rate: numeric("tap_rate"),
  is_permanent: boolean("is_permanent").notNull().default(false),
  duration: integer("duration"), // блокировка в минутах (null для постоянной)
  expires_at: timestamp("expires_at"),
  created_at: timestamp("created_at").notNull().defaultNow(),
  resolved: boolean("resolved").notNull().default(false),
});

// Связи для блокировок читеров
export const cheatBlocksRelations = relations(cheatBlocks, ({ one }) => ({
  user: one(users, { fields: [cheatBlocks.user_id], references: [users.id] }),
  game: one(games, { fields: [cheatBlocks.game_id], references: [games.id] }),
}));

// Добавляем схемы для блокировок читеров
export const insertCheatBlockSchema = createInsertSchema(cheatBlocks);
export const selectCheatBlockSchema = createSelectSchema(cheatBlocks);

// Добавляем схемы для настроек пользователей
export const insertUserSettingsSchema = createInsertSchema(userSettings);
export const selectUserSettingsSchema = createSelectSchema(userSettings);

// Добавляем схемы для обменного курса
export const insertExchangeRateSchema = createInsertSchema(exchangeRates);
export const selectExchangeRateSchema = createSelectSchema(exchangeRates);

// Define types
export type User = z.infer<typeof selectUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Wallet = z.infer<typeof selectWalletSchema>;
export type InsertWallet = z.infer<typeof insertWalletSchema>;

export type Room = z.infer<typeof selectRoomSchema>;
export type InsertRoom = z.infer<typeof insertRoomSchema>;

export type Participant = z.infer<typeof selectParticipantSchema>;
export type InsertParticipant = z.infer<typeof insertParticipantSchema>;

export type Game = z.infer<typeof selectGameSchema>;
export type InsertGame = z.infer<typeof insertGameSchema>;

export type Tap = z.infer<typeof selectTapSchema>;
export type InsertTap = z.infer<typeof insertTapSchema>;

export type Transaction = z.infer<typeof selectTransactionSchema>;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;

export type Referral = z.infer<typeof selectReferralSchema>;
export type InsertReferral = z.infer<typeof insertReferralSchema>;

export type ReferralUse = z.infer<typeof selectReferralUseSchema>;
export type InsertReferralUse = z.infer<typeof insertReferralUseSchema>;

export type BonusProgress = z.infer<typeof selectBonusProgressSchema>;
export type InsertBonusProgress = z.infer<typeof insertBonusProgressSchema>;

export type CheatBlock = z.infer<typeof selectCheatBlockSchema>;
export type InsertCheatBlock = z.infer<typeof insertCheatBlockSchema>;
