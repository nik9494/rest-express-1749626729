import { db } from "../db";
import { cheatBlocks, taps } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

interface UserWindow {
  buckets: number[];
  currentIndex: number;
  lastUpdate: number;
  totalTaps: number;
}

export class AntiCheatService {
  private windows = new Map<string, UserWindow>();
  private readonly WINDOW_MS = 60_000;          // окно 1 минута
  private readonly BUCKET_MS = 1_000;            // размер бакета 1 секунда
  private readonly NUM_BUCKETS = this.WINDOW_MS / this.BUCKET_MS; // 60
  private readonly MAX_PER_MINUTE = 100;       // допустимо до 3 000 тапов/мин
  private readonly MAX_IN_PACKET = 2;          // допустимо до 200 тапов в одном пакете

  constructor() {
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private initWindow(userId: string): UserWindow {
    return {
      buckets: Array(this.NUM_BUCKETS).fill(0),
      currentIndex: 0,
      lastUpdate: Date.now(),
      totalTaps: 0,
    };
  }

  async checkForCheating(userId: string, gameId: string, count: number): Promise<boolean> {
    // 1. Получили ванильное состояние или создали новое
    if (!this.windows.has(userId)) {
      this.windows.set(userId, this.initWindow(userId));
    }
    const state = this.windows.get(userId)!;
    const now = Date.now();

    // 2. Прокрутка бакетов, если прошло время
    const elapsed = Math.floor((now - state.lastUpdate) / this.BUCKET_MS);
    for (let i = 0; i < Math.min(elapsed, this.NUM_BUCKETS); i++) {
      state.currentIndex = (state.currentIndex + 1) % this.NUM_BUCKETS;
      state.totalTaps -= state.buckets[state.currentIndex];
      state.buckets[state.currentIndex] = 0;
    }
    state.lastUpdate = now - ((now - state.lastUpdate) % this.BUCKET_MS);

    // 3. Добавляем текущий пакет
    state.buckets[state.currentIndex] += count;
    state.totalTaps += count;

    // 4. Логирование подозрительных, но не критичных случаев
    if (count > 0.8 * this.MAX_IN_PACKET && count <= this.MAX_IN_PACKET) {
      console.warn(`[antiCheat][WARN] user=${userId} game=${gameId}: почти лимит в пакете (${count} / ${this.MAX_IN_PACKET})`);
    }
    if (state.totalTaps > 0.8 * this.MAX_PER_MINUTE && state.totalTaps <= this.MAX_PER_MINUTE) {
      console.warn(`[antiCheat][WARN] user=${userId} game=${gameId}: почти лимит за минуту (${state.totalTaps} / ${this.MAX_PER_MINUTE})`);
    }

    // 5. Анализ равномерности (слишком много одинаковых бакетов подряд)
    // Например, если подряд >=5 бакетов с одинаковым значением и оно велико (>=80% от MAX_IN_PACKET)
    const suspiciousBucketValue = Math.floor(0.8 * this.MAX_IN_PACKET);
    let streak = 0;
    let lastValue = null;
    for (let i = 0; i < this.NUM_BUCKETS; i++) {
      const idx = (state.currentIndex - i + this.NUM_BUCKETS) % this.NUM_BUCKETS;
      const val = state.buckets[idx];
      if (val >= suspiciousBucketValue) {
        if (lastValue === val) {
          streak++;
        } else {
          streak = 1;
          lastValue = val;
        }
        if (streak >= 5) {
          console.warn(`[antiCheat][SUS] user=${userId} game=${gameId}: ${streak} одинаковых бакетов подряд (${val}) — подозрение на бота`);
          break;
        }
      } else {
        streak = 0;
        lastValue = null;
      }
    }

    // 6. Проверки по порогам
    if (count > this.MAX_IN_PACKET || state.totalTaps > this.MAX_PER_MINUTE) {
      await this.blockCheater(userId, gameId, `Чит-триггер: пакет=${count}, окно=${state.totalTaps}`);
      return true;
    }
    return false;
  }

  private async blockCheater(userId: string, gameId: string, reason: string): Promise<void> {
    // как в вашем коде: записываем в БД и сбрасываем состояние
    const exists = await db.select().from(cheatBlocks)
      .where(and(eq(cheatBlocks.user_id, userId), eq(cheatBlocks.game_id, gameId)))
      .limit(1);
    if (exists.length === 0) {
      await db.insert(cheatBlocks).values({
        id: uuidv4(),
        user_id: userId,
        game_id: gameId,
        reason,
        created_at: new Date(),
      });
    }
    // Аннулируем все тапы пользователя в этой игре
    await db.delete(taps).where(and(eq(taps.user_id, userId), eq(taps.game_id, gameId)));
    this.windows.delete(userId);
    console.warn(`Заблокирован ${userId} в ${gameId}: ${reason} (все тапы аннулированы)`);
  }

  async isUserBlocked(userId: string, gameId: string): Promise<boolean> {
    // ваш оригинал
    const rows = await db.select().from(cheatBlocks)
      .where(and(eq(cheatBlocks.user_id, userId), eq(cheatBlocks.game_id, gameId)))
      .limit(1);
    return rows.length > 0;
  }

  async getUserTapCount(userId: string, gameId: string): Promise<number> {
    // ваш оригинал
    const res = await db.select({ total: sql<number>`sum(${taps.count})` })
      .from(taps)
      .where(and(eq(taps.user_id, userId), eq(taps.game_id, gameId)));
    return res[0]?.total || 0;
  }

  private cleanup(): void {
    const now = Date.now();
    const timeout = 10 * 60 * 1000; // 10 минут
    for (const [userId, st] of this.windows.entries()) {
      if (now - st.lastUpdate > timeout) {
        this.windows.delete(userId);
      }
    }
  }
}

export const antiCheatService = new AntiCheatService();
