import { v4 as uuidv4 } from "uuid";
import { storage } from "../storage";
import { generateRoomCode } from "./helpers";
import {
  broadcastGameStart,
  broadcastGameEnd,
  broadcastRoomDeleted,
  broadcastRoomCountsUpdate,
} from "../websocket";

/**
 * Менеджер Hero-комнат
 * Особенности:
 * - Организатор = НАБЛЮДАТЕЛЬ (не может играть)
 * - Организатор НЕ платит за вход
 * - Организатор получает 10% от призового фонда
 * - Только игроки участвуют в игре
 * - Таймер ожидания: настраивается организатором (30-600 сек)
 * - Уникальный код для присоединения
 * - Возможность удаления комнаты организатором
 */
export class HeroRoomManager {
  private waitingTimers: Map<string, NodeJS.Timeout> = new Map();
  private gameTimers: Map<string, NodeJS.Timeout> = new Map();
  private autoDeleteTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly MIN_PLAYERS = 2;
  private readonly ORGANIZER_SHARE = 0.1; // 10% для организатора
  private readonly MIN_BALANCE_FOR_CREATION = 50; // Минимальный баланс для создания комнаты

  /**
   * Создает новую Hero-комнату
   * @param organizerId ID организатора (который будет наблюдателем)
   * @param entryFee Стоимость входа для игроков
   * @param maxPlayers Максимальное количество игроков
   * @param gameDuration Длительность игры в секундах
   * @param waitingTime Время ожидания в секундах
   * @returns ID созданной комнаты
   */
  async createRoom(
    organizerId: string,
    entryFee: number,
    maxPlayers: number,
    gameDuration: number,
    waitingTime: number,
  ): Promise<string> {
    try {
      console.log(
        `[HeroRoomManager] Creating hero room by organizer ${organizerId}`,
        { entryFee, maxPlayers, gameDuration, waitingTime }
      );

      // Проверяем баланс организатора
      const organizer = await storage.getUser(organizerId);
      if (!organizer) {
        console.log(`[HeroRoomManager] Organizer ${organizerId} not found`);
        throw new Error("Organizer not found");
      }

      if (Number(organizer.balance_stars) < this.MIN_BALANCE_FOR_CREATION) {
        console.log(
          `[HeroRoomManager] Organizer ${organizerId} has insufficient balance: ${organizer.balance_stars} stars`
        );
        throw new Error("Insufficient balance for room creation");
      }

      const roomId = uuidv4();
      const code = generateRoomCode();

      console.log(
        `[HeroRoomManager] Creating room with ID ${roomId} and code ${code}`
      );

      // Создаем комнату
      await storage.createRoom({
        id: roomId,
        creator_id: organizerId,
        type: "hero",
        entry_fee: String(entryFee),
        max_players: maxPlayers,
        status: "waiting",
        code,
        waiting_time: waitingTime,
        duration: gameDuration,
        created_at: new Date(),
      });

      console.log(
        `[HeroRoomManager] Hero room created: ${roomId} with code: ${code}`
      );

      // Добавляем организатора как НАБЛЮДАТЕЛЯ (не игрока)
      await storage.addParticipant({
        room_id: roomId,
        user_id: organizerId,
        joined_at: new Date(),
        is_observer: true, // Организатор всегда наблюдатель
        entry_fee: "0", // Организатор не платит
      });

      console.log(
        `[HeroRoomManager] Organizer ${organizerId} added as observer`
      );

      // Запускаем таймер автоматического удаления
      this.startAutoDeleteTimer(roomId, waitingTime);

      return roomId;
    } catch (error) {
      console.error("[HeroRoomManager] Error creating hero room:", error);
      throw error;
    }
  }

  /**
   * Присоединяет пользователя к Hero-комнате
   * @param roomId ID комнаты
   * @param userId ID пользователя
   * @param isObserver Флаг наблюдателя
   * @returns true если успешно присоединился
   */
  async joinRoom(
    roomId: string,
    userId: string,
    isObserver: boolean = false,
  ): Promise<boolean> {
    try {
      console.log(
        `[HeroRoomManager] User ${userId} joining hero room ${roomId} as ${isObserver ? "observer" : "player"}`,
      );

      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "hero") {
        console.error(`Hero room ${roomId} not found`);
        return false;
      }

      if (room.status !== "waiting") {
        console.error(`Room ${roomId} is not in waiting state`);
        return false;
      }

      // Организатор не может присоединиться как игрок
      if (room.creator_id === userId && !isObserver) {
        console.error(`Organizer ${userId} cannot join as player`);
        return false;
      }

      // Проверяем, не присоединился ли пользователь уже к комнате
      const existingParticipant = await storage.getParticipant(roomId, userId);
      if (existingParticipant) {
        console.log(`User ${userId} already in room ${roomId}`);
        return true;
      }

      // Проверяем, не заполнена ли комната (только для игроков)
      if (!isObserver) {
        const participants = await storage.getRoomParticipants(roomId);
        const playerCount = participants.filter((p) => !p.is_observer).length;
        if (playerCount >= room.max_players) {
          console.error(`Room ${roomId} is full`);
          return false;
        }
      }

      // Обрабатываем плату за вход (только для игроков, не для наблюдателей)
      let entryFee = 0;
      if (!isObserver && room.creator_id !== userId) {
        entryFee = Number(room.entry_fee);
        await this.processEntryFee(userId, roomId, entryFee);
      }

      // Добавляем пользователя в комнату
      await storage.addParticipant({
        room_id: roomId,
        user_id: userId,
        joined_at: new Date(),
        is_observer: isObserver,
        entry_fee: String(entryFee),
      });

      console.log(
        `[HeroRoomManager] User ${userId} joined hero room ${roomId} as ${isObserver ? "observer" : "player"}`,
      );

      // Широковещание обновления счетчиков комнат
      console.log(
        `🔄 Broadcasting room counts update after user ${userId} joined hero room ${roomId}`,
      );
      await broadcastRoomCountsUpdate();

      return true;
    } catch (error) {
      console.error(
        `[HeroRoomManager] Error joining hero room ${roomId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Запускает игру в Hero-комнате (только организатор)
   * @param roomId ID комнаты
   */
  async startGame(roomId: string): Promise<void> {
    try {
      console.log(`[HeroRoomManager] Starting game in hero room ${roomId}`);

      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "hero") {
        throw new Error(`Hero room ${roomId} not found`);
      }

      // Получаем участников (только игроков, исключая наблюдателей)
      const participants = await storage.getRoomParticipants(roomId);
      const players = participants.filter((p) => !p.is_observer);

      if (players.length < this.MIN_PLAYERS) {
        throw new Error("Not enough players to start the game");
      }

      // Отменяем таймер автоудаления
      const autoDeleteTimer = this.autoDeleteTimers.get(roomId);
      if (autoDeleteTimer) {
        clearTimeout(autoDeleteTimer);
        this.autoDeleteTimers.delete(roomId);
      }

      // Меняем статус комнаты на 'active'
      await storage.updateRoom(roomId, { status: "active" });

      // Создаем игру
      const gameId = uuidv4();
      const now = new Date();
      const game = await storage.createGame({
        id: gameId,
        room_id: roomId,
        start_time: now,
        end_time: new Date(Date.now() + (room.duration || 60) * 1000),
        winner_id: null,
        prize_pool: String(Number(room.entry_fee) * players.length),
      });

      // Отправляем сообщение всем участникам о начале игры
      broadcastGameStart(roomId, {
        game_id: gameId,
        start_time: now,
        duration: room.duration || 60,
        prize_pool: Number(room.entry_fee) * players.length,
        participants: players.map((p) => ({
          id: p.user_id,
          joined_at: p.joined_at,
        })),
      });

      // Запускаем таймер игры
      this.startGameTimer(roomId, room.duration || 60);

      console.log(`[HeroRoomManager] Game started in hero room ${roomId}`);
    } catch (error) {
      console.error(
        `[HeroRoomManager] Error starting game in hero room ${roomId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Удаляет Hero-комнату (только организатор)
   * @param roomId ID комнаты
   * @returns true если успешно удалена
   */
  async deleteRoom(roomId: string): Promise<boolean> {
    try {
      console.log(`[HeroRoomManager] Deleting hero room ${roomId}`);

      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "hero") {
        console.error(`Hero room ${roomId} not found`);
        return false;
      }

      // Получаем всех участников для возврата средств
      const participants = await storage.getRoomParticipants(roomId);

      // Возвращаем деньги всем игрокам (не наблюдателям)
      for (const participant of participants) {
        if (!participant.is_observer && Number(participant.entry_fee) > 0) {
          await this.refundEntryFee(
            participant.user_id,
            roomId,
            Number(participant.entry_fee),
          );
        }
      }

      // Отменяем все таймеры
      const waitingTimer = this.waitingTimers.get(roomId);
      if (waitingTimer) {
        clearTimeout(waitingTimer);
        this.waitingTimers.delete(roomId);
      }

      const gameTimer = this.gameTimers.get(roomId);
      if (gameTimer) {
        clearTimeout(gameTimer);
        this.gameTimers.delete(roomId);
      }

      const autoDeleteTimer = this.autoDeleteTimers.get(roomId);
      if (autoDeleteTimer) {
        clearTimeout(autoDeleteTimer);
        this.autoDeleteTimers.delete(roomId);
      }

      // Удаляем комнату
      const success = await storage.deleteRoom(roomId);

      if (success) {
        // Уведомляем всех участников через WebSocket
        broadcastRoomDeleted(roomId, "manual");

        // Широковещание обновления счетчиков комнат
        await broadcastRoomCountsUpdate();

        console.log(
          `[HeroRoomManager] Hero room ${roomId} deleted successfully`,
        );
      }

      return success;
    } catch (error) {
      console.error(
        `[HeroRoomManager] Error deleting hero room ${roomId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Обрабатывает плату за вход в Hero-комнату
   * @param userId ID игрока
   * @param roomId ID комнаты
   * @param amount Сумма платы
   */
  private async processEntryFee(
    userId: string,
    roomId: string,
    amount: number,
  ): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Проверяем баланс
      if (Number(user.balance_stars) < amount) {
        throw new Error(
          `Insufficient balance: ${user.balance_stars} < ${amount}`,
        );
      }

      // Снимаем плату
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) - amount),
      });

      // Записываем транзакцию
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(-amount),
        type: "entry",
        description: `Entry fee for hero room ${roomId}`,
        created_at: new Date(),
      });

      console.log(
        `[HeroRoomManager] Processed entry fee ${amount} for user ${userId}`,
      );
    } catch (error) {
      console.error("[HeroRoomManager] Error processing entry fee:", error);
      throw error;
    }
  }

  /**
   * Возвращает плату за вход
   * @param userId ID игрока
   * @param roomId ID комнаты
   * @param amount Сумма возврата
   */
  private async refundEntryFee(
    userId: string,
    roomId: string,
    amount: number,
  ): Promise<void> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      // Возвращаем плату
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) + amount),
      });

      // Записываем транзакцию
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(amount),
        type: "refund",
        description: `Refund for hero room ${roomId} deletion`,
        created_at: new Date(),
      });

      console.log(
        `[HeroRoomManager] Refunded entry fee ${amount} to user ${userId}`,
      );
    } catch (error) {
      console.error("[HeroRoomManager] Error refunding entry fee:", error);
      throw error;
    }
  }

  /**
   * Запускает таймер автоматического удаления комнаты
   * @param roomId ID комнаты
   * @param waitingTime Время ожидания в секундах
   */
  private async startAutoDeleteTimer(
    roomId: string,
    waitingTime: number,
  ): Promise<void> {
    try {
      console.log(
        `[HeroRoomManager] Starting auto-delete timer for hero room ${roomId} (${waitingTime}s)`,
      );

      const timer = setTimeout(async () => {
        try {
          const room = await storage.getRoom(roomId);
          // Удаляем комнату только если она все еще в статусе "waiting"
          if (!room || room.status !== "waiting") {
            return;
          }

          console.log(
            `[HeroRoomManager] Hero room ${roomId} waiting time expired, auto-deleting`,
          );
          await this.deleteRoom(roomId);
        } catch (error) {
          console.error(
            `[HeroRoomManager] Error in auto-delete timer for hero room ${roomId}:`,
            error,
          );
        } finally {
          this.autoDeleteTimers.delete(roomId);
        }
      }, waitingTime * 1000);

      this.autoDeleteTimers.set(roomId, timer);
    } catch (error) {
      console.error(
        `[HeroRoomManager] Error starting auto-delete timer for hero room ${roomId}:`,
        error,
      );
    }
  }

  /**
   * Запускает таймер окончания игры
   * @param roomId ID комнаты
   * @param duration Длительность игры в секундах
   */
  private startGameTimer(roomId: string, duration: number): void {
    // Отменяем существующий таймер, если есть
    if (this.gameTimers.has(roomId)) {
      clearTimeout(this.gameTimers.get(roomId)!);
    }

    // Устанавливаем новый таймер
    const timer = setTimeout(async () => {
      try {
        await this.endGame(roomId);
      } catch (error) {
        console.error(
          `[HeroRoomManager] Error ending hero game ${roomId}:`,
          error,
        );
      } finally {
        this.gameTimers.delete(roomId);
      }
    }, duration * 1000);

    this.gameTimers.set(roomId, timer);
  }

  /**
   * Завершает игру и определяет победителя
   * @param roomId ID комнаты
   */
  private async endGame(roomId: string): Promise<void> {
    try {
      console.log(`[HeroRoomManager] Ending game in hero room ${roomId}`);

      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "hero") {
        throw new Error(`Hero room ${roomId} not found`);
      }

      // Получаем активную игру для комнаты
      const activeGame = await storage.getActiveGame(roomId);
      if (!activeGame) {
        throw new Error(`Active game for hero room ${roomId} not found`);
      }

      // Получаем тапы всех игроков
      const gameTaps = await storage.getGameTaps(activeGame.id);

      // Находим победителя (игрока с наибольшим количеством тапов)
      let winnerId = null;
      let maxTaps = 0;

      const tapsByUser: Record<string, number> = {};
      for (const tap of gameTaps) {
        tapsByUser[tap.user_id] = (tapsByUser[tap.user_id] || 0) + tap.count;
      }

      for (const [userId, taps] of Object.entries(tapsByUser)) {
        if (taps > maxTaps) {
          maxTaps = taps;
          winnerId = userId;
        }
      }

      if (winnerId) {
        // Рассчитываем призовой фонд
        const participants = await storage.getRoomParticipants(roomId);
        const players = participants.filter((p) => !p.is_observer);
        const totalPrize = players.length * Number(room.entry_fee);

        // Распределяем призовой фонд: 90% победителю, 10% организатору
        const winnerPrize = Math.floor(totalPrize * (1 - this.ORGANIZER_SHARE));
        const organizerPrize = totalPrize - winnerPrize;

        // Обновляем баланс победителя
        const winner = await storage.getUser(winnerId);
        if (winner) {
          await storage.updateUser(winnerId, {
            balance_stars: String(Number(winner.balance_stars) + winnerPrize),
          });

          // Записываем транзакцию для победителя
          await storage.createTransaction({
            id: uuidv4(),
            user_id: winnerId,
            amount: String(winnerPrize),
            type: "prize",
            description: `Prize for winning hero room ${room.code}`,
            created_at: new Date(),
          });
        }

        // Обновляем баланс организатора
        const organizer = await storage.getUser(room.creator_id);
        if (organizer) {
          await storage.updateUser(room.creator_id, {
            balance_stars: String(
              Number(organizer.balance_stars) + organizerPrize,
            ),
          });

          // Записываем транзакцию для организатора
          await storage.createTransaction({
            id: uuidv4(),
            user_id: room.creator_id,
            amount: String(organizerPrize),
            type: "organizer_share",
            description: `Organizer share for hero room ${room.code}`,
            created_at: new Date(),
          });
        }
      }

      // Обновляем статус игры
      await storage.updateGame(activeGame.id, {
        winner_id: winnerId,
        end_time: new Date(),
      });

      // Обновляем статус комнаты
      await storage.updateRoom(roomId, {
        status: "finished",
      });

      // Отправляем уведомление о завершении игры
      const winner = winnerId ? await storage.getUser(winnerId) : null;
      broadcastGameEnd(
        roomId,
        activeGame,
        winner
          ? {
              id: winner.id,
              username: winner.username,
              photo_url: winner.photo_url,
              taps: maxTaps,
            }
          : null,
      );

      console.log(
        `[HeroRoomManager] Game ended in hero room ${roomId}, winner: ${winnerId}`,
      );
    } catch (error) {
      console.error(
        `[HeroRoomManager] Error ending hero game ${roomId}:`,
        error,
      );
      throw error;
    }
  }
}

// Создаем и экспортируем экземпляр менеджера Hero-комнат
export const heroRoomManager = new HeroRoomManager();
