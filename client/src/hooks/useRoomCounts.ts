import { useState, useEffect, useCallback } from "react";
import { useWebSocket, WsMessageType } from "@/lib/websocket";

interface RoomCountsData {
  standard_counts: Record<number, number>;
  hero_counts: Record<string, number>;
}

/**
 * Хук для управления счетчиками комнат в реальном времени
 * Подписывается на WebSocket обновления и автоматически обновляет UI
 */
export const useRoomCounts = (userId?: string) => {
  const {
    connected,
    subscribe,
    subscribeToHomeUpdates,
    unsubscribeFromHomeUpdates,
  } = useWebSocket();
  const [roomCounts, setRoomCounts] = useState<RoomCountsData>({
    standard_counts: {},
    hero_counts: {},
  });
  const [isLoading, setIsLoading] = useState(true);

  // Обработчик обновлений счетчиков
  const handleRoomCountsUpdate = useCallback((message: any) => {
    console.log("🔄 Received room counts update:", message.data);
    if (message.data) {
      setRoomCounts((prevCounts) => {
        console.log("📊 Updating room counts:", {
          previous: prevCounts,
          new: message.data,
        });
        return message.data;
      });
      setIsLoading(false);
    }
  }, []);

  // Подписка на WebSocket обновления
  useEffect(() => {
    if (!connected || !userId) {
      console.log("⚠️ WebSocket not connected or no userId:", {
        connected,
        userId,
      });
      return;
    }

    console.log("🔔 Subscribing to room counts updates for user:", userId);

    // Подписываемся на обновления счетчиков
    const unsubscribeFromCounts = subscribe(
      WsMessageType.ROOM_COUNTS_UPDATE,
      handleRoomCountsUpdate,
    );

    // Подписываемся на обновления главной страницы
    const subscribeResult = subscribeToHomeUpdates(userId);
    console.log("📡 Subscribe to home updates result:", subscribeResult);

    // Очистка при размонтировании
    return () => {
      console.log(
        "🔕 Unsubscribing from room counts updates for user:",
        userId,
      );
      unsubscribeFromCounts();
      unsubscribeFromHomeUpdates(userId);
    };
  }, [
    connected,
    userId,
    subscribe,
    subscribeToHomeUpdates,
    unsubscribeFromHomeUpdates,
    handleRoomCountsUpdate,
  ]);

  // Получение количества игроков для стандартной комнаты по взносу
  const getStandardRoomCount = useCallback(
    (entryFee: number): number => {
      return roomCounts.standard_counts[entryFee] || 0;
    },
    [roomCounts.standard_counts],
  );

  // Получение количества игроков для hero комнаты по ID
  const getHeroRoomCount = useCallback(
    (roomId: string): number => {
      return roomCounts.hero_counts[roomId] || 0;
    },
    [roomCounts.hero_counts],
  );

  return {
    roomCounts,
    isLoading,
    getStandardRoomCount,
    getHeroRoomCount,
    connected,
  };
};
