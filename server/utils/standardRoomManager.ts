import { v4 as uuidv4 } from "uuid";
import { storage } from "../storage";
import {
  broadcastGameStart,
  broadcastGameEnd,
  broadcastRoomCountsUpdate,
} from "../websocket";

/**
 * Менеджер стандартных комнат
 * Особенности:
 * - Создатель = ИГРОК (не наблюдатель)
 * - Создатель платит за вход как обычный игрок
 * - Все участники - игроки
 * - Весь призовой фонд идет победителю
 * - Таймер ожидания: 60 секунд
 * - Автоматическое создание/присоединение
 */
export class StandardRoomManager {
  private waitingTimers: Map<string, NodeJS.Timeout> = new Map();
  private gameTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly MIN_PLAYERS = 2;
  private readonly WAITING_TIME = 60; // 60 секунд ожидания
  private readonly GAME_DURATION = 60; // 60 секунд игры

  /**
   * Создает новую стандартную комнату
   * @param creatorId ID создателя (который будет игроком)
   * @param entryFee Стоимость входа
   * @param maxPlayers Максимальное количество игроков
   * @returns ID созданной комнаты
   */
  async createRoom(
    creatorId: string,
    entryFee: number,
    maxPlayers: number = 10,
  ): Promise<string> {
    try {
      console.log(`[StandardRoomManager] Creating room by user ${creatorId}`);

      const roomId = uuidv4();

      // Создаем комнату
      await storage.createRoom({
        id: roomId,
        creator_id: creatorId,
        type: "standard",
        entry_fee: String(entryFee),
        max_players: maxPlayers,
        status: "waiting",
        waiting_time: this.WAITING_TIME,
        duration: this.GAME_DURATION,
        created_at: new Date(),
      });

      console.log(`[StandardRoomManager] Room created: ${roomId}`);

      // Добавляем создателя как ИГРОКА (не наблюдателя)
      await this.joinRoom(roomId, creatorId);

      // Запускаем таймер ожидания
      this.startWaitingTimer(roomId);

      return roomId;
    } catch (error) {
      console.error("[StandardRoomManager] Error creating room:", error);
      throw error;
    }
  }

  /**
   * Присоединяет игрока к стандартной комнате
   * @param roomId ID комнаты
   * @param userId ID игрока
   * @returns true если успешно присоединился
   */
  async joinRoom(roomId: string, userId: string): Promise<boolean> {
    try {
      console.log(
        `[StandardRoomManager] User ${userId} joining room ${roomId}`,
      );

      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "standard") {
        console.error(`Standard room ${roomId} not found`);
        return false;
      }

      if (room.status !== "waiting") {
        console.error(`Room ${roomId} is not in waiting state`);
        return false;
      }

      // Проверяем, не заполнена ли комната
      const participants = await storage.getRoomParticipants(roomId);
      if (participants.length >= room.max_players) {
        console.error(`Room ${roomId} is full`);
        return false;
      }

      // Проверяем, не присоединился ли игрок уже к комнате
      const existingParticipant = await storage.getParticipant(roomId, userId);
      if (existingParticipant) {
        console.log(`User ${userId} already in room ${roomId}`);
        return true;
      }

      // Проверяем баланс и списываем плату за вход
      const entryFee = Number(room.entry_fee);
      await this.processEntryFee(userId, roomId, entryFee);

      // Добавляем игрока в комнату как ИГРОКА (не наблюдателя)
      await storage.addParticipant({
        room_id: roomId,
        user_id: userId,
        joined_at: new Date(),
        is_observer: false, // Всегда игрок в стандартной комнате
        entry_fee: String(entryFee),
      });

      console.log(
        `[StandardRoomManager] User ${userId} joined room ${roomId} as player`,
      );

      // Широковещание обновления счетчиков комнат
      console.log(
        `🔄 Broadcasting room counts update after user ${userId} joined room ${roomId}`,
      );
      await broadcastRoomCountsUpdate();

      // Если комната заполнилась, начинаем игру немедленно
      const newParticipantCount = participants.length + 1;
      if (newParticipantCount >= room.max_players) {
        console.log(
          `[StandardRoomManager] Room ${roomId} is full, starting game`,
        );

        // Отменяем таймер ожидания
        const waitingTimer = this.waitingTimers.get(roomId);
        if (waitingTimer) {
          clearTimeout(waitingTimer);
          this.waitingTimers.delete(roomId);
        }

        // Начинаем игру
        await this.startGame(roomId);
      }

      return true;
    } catch (error) {
      console.error(
        `[StandardRoomManager] Error joining room ${roomId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Выход игрока из стандартной комнаты
   * @param roomId ID комнаты
   * @param userId ID игрока
   * @returns true если успешно вышел
   */
  async leaveRoom(roomId: string, userId: string): Promise<boolean> {
    try {
      console.log(
        `[StandardRoomManager] User ${userId} leaving room ${roomId}`,
      );

      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "standard") {
        console.error(`Standard room ${roomId} not found`);
        return false;
      }

      // Если комната уже активна или завершена, выход не имеет смысла
      if (room.status !== "waiting") {
        console.error(`Cannot leave room ${roomId} - not in waiting state`);
        return false;
      }

      // Проверяем, является ли пользователь участником
      const existingParticipant = await storage.getParticipant(roomId, userId);
      if (!existingParticipant) {
        console.error(`User ${userId} is not a participant in room ${roomId}`);
        return false;
      }

      // Возвращаем плату за вход
      const entryFee = Number(room.entry_fee);
      await this.refundEntryFee(userId, roomId, entryFee);

      // Удаляем игрока из комнаты
      await storage.removeParticipant(roomId, userId);

      // Проверяем, остались ли игроки в комнате
      const participants = await storage.getRoomParticipants(roomId);

      // Если комната пуста, закрываем её
      if (participants.length === 0) {
        console.log(`[StandardRoomManager] Room ${roomId} is empty, closing`);
        await storage.updateRoom(roomId, { status: "finished" });
        // ВАЖНО: обновляем счетчики после закрытия комнаты
        await import("../websocket").then(m => m.broadcastRoomCountsUpdate());
        return true;
      }

      console.log(`[StandardRoomManager] User ${userId} left room ${roomId}`);

      // Широковещание обновления счетчиков комнат
      console.log(
        `🔄 Broadcasting room counts update after user ${userId} left room ${roomId}`,
      );
      await broadcastRoomCountsUpdate();

      return true;
    } catch (error) {
      console.error(
        `[StandardRoomManager] Error leaving room ${roomId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Поиск доступной стандартной комнаты по стоимости входа
   * @param entryFee Стоимость входа
   * @returns ID доступной комнаты или null
   */
  async findAvailableRoom(entryFee: number): Promise<string | null> {
    try {
      const activeRooms = await storage.getActiveRooms("standard");

      for (const room of activeRooms) {
        if (room.status === "waiting" && Number(room.entry_fee) === entryFee) {
          // Проверяем, есть ли свободные места
          const participants = await storage.getRoomParticipants(room.id);
          if (participants.length < room.max_players) {
            return room.id;
          }
        }
      }

      return null;
    } catch (error) {
      console.error(
        "[StandardRoomManager] Error finding available room:",
        error,
      );
      return null;
    }
  }

  /**
   * Обрабатывает плату за вход в комнату
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
        description: `Entry fee for standard room ${roomId}`,
        created_at: new Date(),
      });

      console.log(
        `[StandardRoomManager] Processed entry fee ${amount} for user ${userId}`,
      );
    } catch (error) {
      console.error("[StandardRoomManager] Error processing entry fee:", error);
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
        description: `Refund for leaving standard room ${roomId}`,
        created_at: new Date(),
      });

      console.log(
        `[StandardRoomManager] Refunded entry fee ${amount} to user ${userId}`,
      );
    } catch (error) {
      console.error("[StandardRoomManager] Error refunding entry fee:", error);
      throw error;
    }
  }

  /**
   * Запускает таймер ожидания для комнаты
   * @param roomId ID комнаты
   */
  private async startWaitingTimer(roomId: string): Promise<void> {
    try {
      console.log(
        `[StandardRoomManager] Starting waiting timer for room ${roomId}`,
      );

      const timer = setTimeout(async () => {
        try {
          const room = await storage.getRoom(roomId);
          if (!room || room.status !== "waiting") {
            return;
          }

          const participants = await storage.getRoomParticipants(roomId);
          if (participants.length < this.MIN_PLAYERS) {
            console.log(
              `[StandardRoomManager] Room ${roomId} has insufficient players, closing`,
            );

            // Возвращаем деньги всем участникам
            for (const participant of participants) {
              await this.refundEntryFee(
                participant.user_id,
                roomId,
                Number(participant.entry_fee),
              );
              await storage.removeParticipant(roomId, participant.user_id);
            }

            await storage.updateRoom(roomId, { status: "finished" });
            // ВАЖНО: обновляем счетчики после закрытия комнаты
            await import("../websocket").then(m => m.broadcastRoomCountsUpdate());
            return;
          }

          // Начинаем игру
          await this.startGame(roomId);
        } catch (error) {
          console.error(
            `[StandardRoomManager] Error in waiting timer for room ${roomId}:`,
            error,
          );
        } finally {
          this.waitingTimers.delete(roomId);
        }
      }, this.WAITING_TIME * 1000);

      this.waitingTimers.set(roomId, timer);
    } catch (error) {
      console.error(
        `[StandardRoomManager] Error starting waiting timer for room ${roomId}:`,
        error,
      );
    }
  }

  /**
   * Запускает игру в стандартной комнате
   * @param roomId ID комнаты
   */
  async startGame(roomId: string): Promise<void> {
    try {
      console.log(`[StandardRoomManager] Starting game in room ${roomId}`);

      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "standard") {
        throw new Error(`Standard room ${roomId} not found`);
      }

      // Получаем участников
      const participants = await storage.getRoomParticipants(roomId);
      if (participants.length < this.MIN_PLAYERS) {
        throw new Error("Not enough players to start the game");
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
        end_time: new Date(Date.now() + this.GAME_DURATION * 1000),
        winner_id: null,
        prize_pool: String(Number(room.entry_fee) * participants.length),
      });

      // Отправляем сообщение всем участникам о начале игры
      broadcastGameStart(roomId, {
        game_id: gameId,
        start_time: now,
        duration: this.GAME_DURATION,
        prize_pool: Number(room.entry_fee) * participants.length,
        participants: participants.map((p) => ({
          id: p.user_id,
          joined_at: p.joined_at,
        })),
      });

      // Запускаем таймер игры
      this.startGameTimer(roomId);

      console.log(`[StandardRoomManager] Game started in room ${roomId}`);
    } catch (error) {
      console.error(
        `[StandardRoomManager] Error starting game in room ${roomId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Запускает таймер окончания игры
   * @param roomId ID комнаты
   */
  private startGameTimer(roomId: string): void {
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
          `[StandardRoomManager] Error ending game ${roomId}:`,
          error,
        );
      } finally {
        this.gameTimers.delete(roomId);
      }
    }, this.GAME_DURATION * 1000);

    this.gameTimers.set(roomId, timer);
  }

  /**
   * Завершает игру и определяет победителя
   * @param roomId ID комнаты
   */
  private async endGame(roomId: string): Promise<void> {
    try {
      console.log(`[StandardRoomManager] Ending game in room ${roomId}`);

      // Получаем информацию о комнате
      const room = await storage.getRoom(roomId);
      if (!room || room.type !== "standard") {
        throw new Error(`Standard room ${roomId} not found`);
      }

      // Получаем активную игру для комнаты
      const activeGame = await storage.getActiveGame(roomId);
      if (!activeGame) {
        throw new Error(`Active game for room ${roomId} not found`);
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
        // Рассчитываем призовой фонд (100% победителю в стандартной комнате)
        const participants = await storage.getRoomParticipants(roomId);
        const totalPrize = participants.length * Number(room.entry_fee);

        // Обновляем баланс победителя
        const winner = await storage.getUser(winnerId);
        if (winner) {
          await storage.updateUser(winnerId, {
            balance_stars: String(Number(winner.balance_stars) + totalPrize),
          });

          // Записываем транзакцию
          await storage.createTransaction({
            id: uuidv4(),
            user_id: winnerId,
            amount: String(totalPrize),
            type: "prize",
            description: `Prize for winning standard room ${roomId}`,
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
        `[StandardRoomManager] Game ended in room ${roomId}, winner: ${winnerId}`,
      );
    } catch (error) {
      console.error(
        `[StandardRoomManager] Error ending game ${roomId}:`,
        error,
      );
      throw error;
    }
  }
}

// Создаем и экспортируем экземпляр менеджера стандартных комнат
export const standardRoomManager = new StandardRoomManager();
