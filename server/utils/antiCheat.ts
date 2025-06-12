import { db } from "../db";
import { cheatBlocks, taps } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/**
 * Параметры для проверки тапов на читерство
 */
interface TapCheatParams {
  userId: string;
  gameId: string;
  count: number;
  timestamp: number;
}

/**
 * Класс для обнаружения и управления читерством в играх
 */
class AntiCheatService {
  // История тапов для определения скорости - userId -> { lastTimestamps: number[], totalTaps: number }
  private tapHistory: Map<string, { lastTimestamps: number[], totalTaps: number }> = new Map();
  // Ограничения
  private readonly MAX_TAPS_PER_PERIOD = 50; // Максимум тапов за период
  private readonly MEASUREMENT_PERIOD_MS = 2000; // Период для проверки (2 секунды)
  private readonly HISTORY_SIZE = 100; // Количество тайминг записей для хранения

  constructor() {
    // Очистка истории каждые 5 минут для предотвращения утечек памяти
    setInterval(() => this.cleanupHistory(), 5 * 60 * 1000);
  }

  /**
   * Проверяет тапы на признаки читерства
   * @param params Параметры тапа для проверки
   * @returns true если обнаружено читерство, false в противном случае
   */
  async checkForCheating(params: TapCheatParams): Promise<boolean> {
    const { userId, gameId, count, timestamp } = params;
    
    // Получаем историю тапов пользователя или создаем новую
    if (!this.tapHistory.has(userId)) {
      this.tapHistory.set(userId, { lastTimestamps: [], totalTaps: 0 });
    }
    
    const userHistory = this.tapHistory.get(userId)!;
    
    // Добавляем новый тайминг в историю
    userHistory.lastTimestamps.push(timestamp);
    userHistory.totalTaps += count;
    
    // Обрезаем историю до установленного размера
    if (userHistory.lastTimestamps.length > this.HISTORY_SIZE) {
      userHistory.lastTimestamps = userHistory.lastTimestamps.slice(-this.HISTORY_SIZE);
    }
    
    // Проверяем темп тапов за последний период времени
    const currentTime = Date.now();
    const recentTimestamps = userHistory.lastTimestamps.filter(
      time => currentTime - time < this.MEASUREMENT_PERIOD_MS
    );
    
    // Определяем сколько тапов было в последний период
    let recentTaps = 0;
    for (let i = 0; i < recentTimestamps.length; i++) {
      // Предполагаем, что за каждый тайминг был отправлен минимум 1 тап
      recentTaps += 1;
    }
    
    // Если текущий пакет тапов превышает максимально допустимый за период - это подозрительно
    if (count > this.MAX_TAPS_PER_PERIOD) {
      await this.blockCheater(userId, gameId, `Слишком много тапов в одном пакете: ${count}`);
      return true;
    }
    
    // Если общее количество тапов за период превышает лимит - это читерство
    if (recentTaps > this.MAX_TAPS_PER_PERIOD) {
      await this.blockCheater(userId, gameId, `Подозрительная скорость тапов: ${recentTaps} за ${this.MEASUREMENT_PERIOD_MS / 1000} секунд`);
      return true;
    }
    
    return false;
  }

  /**
   * Блокирует пользователя за читерство в конкретной игре
   * @param userId ID пользователя
   * @param gameId ID игры
   * @param reason Причина блокировки
   */
  async blockCheater(userId: string, gameId: string, reason: string): Promise<void> {
    try {
      console.warn(`Обнаружен читер: ${userId} в игре ${gameId}. Причина: ${reason}`);
      
      // Проверяем, не заблокирован ли уже пользователь в этой игре
      const existingBlock = await db.select()
        .from(cheatBlocks)
        .where(and(
          eq(cheatBlocks.user_id, userId),
          eq(cheatBlocks.game_id, gameId)
        ))
        .limit(1);
      
      // Если блокировка уже существует, не создаем новую
      if (existingBlock.length > 0) {
        return;
      }
      
      // Создаем запись о блокировке
      await db.insert(cheatBlocks).values({
        id: uuidv4(),
        user_id: userId,
        game_id: gameId,
        reason,
        created_at: new Date()
      });
      
      // Очищаем историю тапов для этого пользователя
      this.tapHistory.delete(userId);
      
    } catch (error) {
      console.error('Ошибка при блокировке читера:', error);
    }
  }

  /**
   * Проверяет, заблокирован ли пользователь в конкретной игре
   * @param userId ID пользователя
   * @param gameId ID игры
   * @returns true если пользователь заблокирован, false в противном случае
   */
  async isUserBlocked(userId: string, gameId: string): Promise<boolean> {
    try {
      const blocks = await db.select()
        .from(cheatBlocks)
        .where(and(
          eq(cheatBlocks.user_id, userId),
          eq(cheatBlocks.game_id, gameId)
        ))
        .limit(1);
      
      return blocks.length > 0;
    } catch (error) {
      console.error('Ошибка при проверке блокировки пользователя:', error);
      return false;
    }
  }

  /**
   * Возвращает количество тапов пользователя в игре
   * @param userId ID пользователя
   * @param gameId ID игры
   * @returns Общее количество тапов пользователя в игре
   */
  async getUserTapCount(userId: string, gameId: string): Promise<number> {
    try {
      const result = await db.select({
        total: sql<number>`sum(${taps.count})`
      })
      .from(taps)
      .where(and(
        eq(taps.user_id, userId),
        eq(taps.game_id, gameId)
      ));
      
      return result[0]?.total || 0;
    } catch (error) {
      console.error('Ошибка при получении количества тапов пользователя:', error);
      return 0;
    }
  }

  /**
   * Очищает историю неактивных пользователей для экономии памяти
   */
  private cleanupHistory(): void {
    const currentTime = Date.now();
    const inactiveTimeout = 10 * 60 * 1000; // 10 минут
    
    for (const [userId, history] of this.tapHistory.entries()) {
      // Если последняя активность была более 10 минут назад, удаляем запись
      const lastActivity = Math.max(...history.lastTimestamps, 0);
      if (currentTime - lastActivity > inactiveTimeout) {
        this.tapHistory.delete(userId);
      }
    }
  }
}

// Создаем и экспортируем экземпляр сервиса
export const antiCheatService = new AntiCheatService();