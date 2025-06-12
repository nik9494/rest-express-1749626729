import { Room, Player } from "@shared/types";

/**
 * Определяет роль пользователя в комнате
 * @param room - данные комнаты
 * @param userId - ID пользователя
 * @param players - список игроков
 * @returns объект с информацией о роли
 */
export function getUserRole(
  room: Room | null,
  userId: string | undefined,
  players: Player[],
) {
  if (!room || !userId) {
    return {
      isOrganizer: false,
      isObserver: false,
      isPlayer: false,
      canPlay: false,
    };
  }

  const isCreator = room.creator_id === userId;
  const participant = players.find((p) => p.id === userId);

  if (room.type === "hero") {
    // В Hero-комнатах:
    // - Организатор (создатель) = наблюдатель, не может играть
    // - Остальные участники = игроки
    const isOrganizer = isCreator;
    const isObserver = isOrganizer || participant?.is_observer || false;
    const isPlayer = !isObserver && !!participant;
    const canPlay = isPlayer;

    return {
      isOrganizer,
      isObserver,
      isPlayer,
      canPlay,
    };
  } else {
    // В стандартных комнатах:
    // - Создатель = обычный игрок
    // - Все участники = игроки
    const isOrganizer = false; // В стандартных комнатах нет организатора
    const isObserver = false; // В стандартных комнатах нет наблюдателей
    const isPlayer = !!participant;
    const canPlay = isPlayer;

    return {
      isOrganizer,
      isObserver,
      isPlayer,
      canPlay,
    };
  }
}

/**
 * Получает правильный endpoint для комнаты в зависимости от типа
 * @param roomType - тип комнаты
 * @param roomId - ID комнаты
 * @returns endpoint для API запроса
 */
export function getRoomEndpoint(roomType: string | undefined, roomId: string) {
  if (roomType === "hero") {
    return `/api/v1/hero-rooms/${roomId}`;
  } else {
    return `/api/v1/standard-rooms/${roomId}`;
  }
}

/**
 * Получает правильный URL для страницы ожидания
 * @param roomType - тип комнаты
 * @param roomId - ID комнаты
 * @returns URL страницы ожидания
 */
export function getWaitingRoomUrl(
  roomType: string | undefined,
  roomId: string,
) {
  if (roomType === "hero") {
    return `/waiting-room/hero/${roomId}`;
  } else {
    return `/waiting-room/standard/${roomId}`;
  }
}
