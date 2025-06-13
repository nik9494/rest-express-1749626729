import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useTelegram } from "@/hooks/useTelegram";
import { apiRequest } from "@/lib/queryClient";
import { Player, Room } from "@shared/types";
import { useUnifiedTimer } from "@/hooks/useUnifiedTimer";

interface UseStandardRoomOptions {
  roomId?: string;
  userId?: string;
}

export const useStandardRoom = ({
  roomId,
  userId,
}: UseStandardRoomOptions = {}) => {
  const { connected, subscribe, joinRoom, leaveRoom } = useWebSocket();
  const { toast } = useToast();
  const { triggerHapticFeedback } = useTelegram();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);

  const isMounted = useRef(false);

  // Используем унифицированный таймер
  const {
    remainingTime,
    formattedTime,
    isActive: isTimerActive,
    startTimer,
    stopTimer,
  } = useUnifiedTimer({
    roomId,
    timerType: "waiting",
    onTimerEnd: () => {
      console.log(
        `[StandardRoom] Timer ended for room ${roomId}, players: ${players.length}`,
      );
      // Автостарт при окончании таймера ожидания
      if (players.length >= 2) {
        console.log("Timer ended, starting game automatically");
      } else {
        console.log("Timer ended, but not enough players to start game");
      }
    },
  });

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Load room data с защитой от повторных вызовов
  const loadRoom = useCallback(async () => {
    if (!roomId || isLoading || hasLoadedOnce) return;

    console.log(`[StandardRoom] Loading room data for ${roomId}`);
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/standard-rooms/${roomId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to load room");
      }

      const data = await response.json();

      setRoom(data.room);
      setPlayers(data.players || []);

      // Запускаем таймер если комната в режиме ожидания и время еще не истекло
      if (
        data.room?.status === "waiting" &&
        data.room?.created_at &&
        data.room?.waiting_time
      ) {
        const createdTime = new Date(data.room.created_at).getTime();
        const waitingTime = data.room.waiting_time || 60;
        const now = Date.now();
        const endTime = createdTime + waitingTime * 1000;
        const remainingMs = endTime - now;

        console.log(
          `[StandardRoom] Timer check: created=${new Date(createdTime).toISOString()}, waiting=${waitingTime}s, now=${new Date(now).toISOString()}, remaining=${remainingMs}ms`,
        );

        // Запускаем таймер только если время еще не истекло (с запасом в 2 секунды)
        if (remainingMs > 2000) {
          startTimer(createdTime, waitingTime);
        } else {
          console.log(
            `[StandardRoom] Timer already expired or too close to expiry, not starting`,
          );
        }
      }

      setIsCreator(data.room?.creator_id === userId);
      setHasLoadedOnce(true);
    } catch (error) {
      console.error("Error loading standard room:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить данные комнаты",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [roomId, userId, toast, startTimer, isLoading, hasLoadedOnce]);

  // Join room
  const handleJoinRoom = useCallback(async () => {
    if (!roomId || !userId || !connected) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/standard-rooms/${roomId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to join room");
      }

      // Join via WebSocket
      joinRoom(roomId, userId);
      loadRoom();
    } catch (error) {
      console.error("Error joining standard room:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось присоединиться к комнате",
        variant: "destructive",
      });
    }
  }, [roomId, userId, connected, joinRoom, loadRoom, toast]);

  // Leave room
  const handleLeaveRoom = useCallback(async () => {
    if (!roomId || !userId || !connected) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/standard-rooms/${roomId}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to leave room");
      }

      // Leave via WebSocket
      leaveRoom(roomId, userId);
    } catch (error) {
      console.error("Error leaving standard room:", error);
    }
  }, [roomId, userId, connected, leaveRoom]);

  // Subscribe to WebSocket messages (оптимизированная версия)
  useEffect(() => {
    if (!connected || !roomId) return;

    console.log(
      `[StandardRoom] Setting up WebSocket subscriptions for room ${roomId}`,
    );

    const unsubscribeJoin = subscribe(
      WsMessageType.PLAYER_JOIN,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          setPlayers((prev) => {
            const player = message.data.player;
            if (!prev.some((p) => p.id === player.id)) {
              return [...prev, player];
            }
            return prev;
          });
        }
      },
    );

    const unsubscribeLeave = subscribe(
      WsMessageType.PLAYER_LEAVE,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          setPlayers((prev) =>
            prev.filter((player) => player.id !== message.user_id),
          );
        }
      },
    );

    const unsubscribeRoomUpdate = subscribe(
      WsMessageType.ROOM_UPDATE,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          setRoom(message.data.room);
          setPlayers(message.data.players || []);
        }
      },
    );

    const unsubscribeGameStart = subscribe(
      WsMessageType.GAME_START,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          setRoom((prev) => (prev ? { ...prev, status: "active" } : null));
        }
      },
    );

    return () => {
      console.log(
        `[StandardRoom] Cleaning up WebSocket subscriptions for room ${roomId}`,
      );
      unsubscribeJoin();
      unsubscribeLeave();
      unsubscribeRoomUpdate();
      unsubscribeGameStart();
    };
  }, [connected, roomId]); // Убираем subscribe из зависимостей

  // Автоматический запуск таймера только когда все данные готовы и компонент смонтирован
  useEffect(() => {
    if (
      isMounted.current &&
      room &&
      players &&
      userId &&
      room.status === "waiting" &&
      room.created_at &&
      room.waiting_time
    ) {
      const createdTime = new Date(room.created_at).getTime();
      const waitingTime = room.waiting_time;
      const now = Date.now();
      const endTime = createdTime + waitingTime * 1000;
      const remainingMs = endTime - now;
      if (remainingMs > 2000) {
        startTimer(createdTime, waitingTime);
      }
    }
  }, [room, players, userId, startTimer]);

  return {
    room,
    players,
    remainingTime,
    formattedTime,
    isLoading,
    connected,
    isCreator,
    handleJoinRoom,
    handleLeaveRoom,
    loadRoom,
  };
};
