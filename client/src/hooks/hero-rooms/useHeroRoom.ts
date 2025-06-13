import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useTelegram } from "@/hooks/useTelegram";
import { apiRequest } from "@/lib/queryClient";
import { Player, Room } from "@shared/types";
import { useUnifiedTimer } from "@/hooks/useUnifiedTimer";

interface UseHeroRoomOptions {
  roomId?: string;
  userId?: string;
}

export const useHeroRoom = ({ roomId, userId }: UseHeroRoomOptions = {}) => {
  const { connected, subscribe, joinRoom, leaveRoom } = useWebSocket();
  const { toast } = useToast();
  const { triggerHapticFeedback } = useTelegram();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOrganizer, setIsOrganizer] = useState<boolean>(false);
  const [isObserver, setIsObserver] = useState<boolean>(false);
  const [isPlayer, setIsPlayer] = useState<boolean>(false);
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
        `[HeroRoom] Timer ended for room ${roomId}, players: ${players.length}, room status: ${room?.status}, hasLoadedOnce: ${hasLoadedOnce}`,
      );
      
      // Проверяем все необходимые условия перед показом уведомления
      if (
        room && 
        room.status === "waiting" && 
        players.length < 2 && 
        hasLoadedOnce && 
        !isLoading
      ) {
        console.log(`[HeroRoom] Showing timer expiry notification`);
        toast({
          title: "Время ожидания истекло",
          description:
            "Комната будет удалена, так как не набралось достаточно игроков",
          variant: "destructive",
        });
      } else {
        console.log(`[HeroRoom] Timer ended but conditions not met for notification:`, {
          hasRoom: !!room,
          roomStatus: room?.status,
          playerCount: players.length,
          hasLoadedOnce,
          isLoading
        });
      }
    },
  });

  // Subscribe to WebSocket messages
  useEffect(() => {
    if (!connected || !roomId) return;

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

    const unsubscribeRoomDeleted = subscribe(
      WsMessageType.ROOM_DELETED,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          // Очищаем состояние
          setRoom(null);
          setPlayers([]);
          stopTimer();

          // Показываем уведомление
          toast({
            title: "Комната удалена",
            description: message.data?.reason || "Hero-комната была удалена",
            variant: "destructive",
          });

          // Покидаем комнату
          if (userId) {
            leaveRoom(roomId, userId);
          }
        }
      },
    );

    return () => {
      unsubscribeJoin();
      unsubscribeLeave();
      unsubscribeRoomUpdate();
      unsubscribeGameStart();
      unsubscribeRoomDeleted();
    };
  }, [connected, roomId]); // Убираем лишние зависимости

  // Load room data с защитой от повторных вызовов
  const loadRoom = useCallback(async () => {
    if (!roomId || isLoading || hasLoadedOnce) return;

    console.log(`[HeroRoom] Loading room data for ${roomId}`);
    setIsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/hero-rooms/${roomId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to load room");
      }

      const data = await response.json();
      
      // Сначала устанавливаем все данные
      setRoom(data.room);
      setPlayers(data.players || []);
      
      // Определяем роли пользователя
      const roomOrganizer = data.room?.creator_id === userId;
      const participant = data.players?.find((p: Player) => p.id === userId);

      setIsOrganizer(roomOrganizer);
      setIsObserver(roomOrganizer || participant?.is_observer || false);
      setIsPlayer(!roomOrganizer && !!participant && !participant.is_observer);
      setHasLoadedOnce(true);

      // Только после установки всех данных запускаем таймер
      if (
        data.room?.status === "waiting" &&
        data.room?.created_at &&
        data.room?.waiting_time &&
        data.players
      ) {
        const createdTime = new Date(data.room.created_at).getTime();
        const waitingTime = data.room.waiting_time;
        const now = Date.now();
        const endTime = createdTime + waitingTime * 1000;
        const remainingMs = endTime - now;

        console.log(
          `[HeroRoom] Timer check: created=${new Date(createdTime).toISOString()}, waiting=${waitingTime}s, now=${new Date(now).toISOString()}, remaining=${remainingMs}ms, players=${data.players.length}`,
        );

        // Запускаем таймер только если время еще не истекло (с запасом в 5 секунд)
        if (remainingMs > 5000) {
          // Добавляем небольшую задержку перед запуском таймера
          setTimeout(() => {
            startTimer(createdTime, waitingTime);
          }, 100);
        } else {
          console.log(
            `[HeroRoom] Timer already expired or too close to expiry, not starting`,
          );
        }
      }
    } catch (error) {
      console.error("Error loading hero room:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить данные Hero-комнаты",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [roomId, userId, toast, startTimer, isLoading, hasLoadedOnce]);

  // Автоматический запуск таймера только когда все данные готовы и компонент смонтирован
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

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
      if (remainingMs > 5000) {
        startTimer(createdTime, waitingTime);
      }
    }
  }, [room, players, userId, startTimer]);

  // Start game (organizer only)
  const startGame = useCallback(async () => {
    if (!roomId || !isOrganizer) {
      throw new Error("Only organizer can start the game");
    }

    const token = localStorage.getItem("token");
    const response = await fetch(`/api/v1/hero-rooms/${roomId}/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to start game");
    }
  }, [roomId, isOrganizer]);

  // Delete room (organizer only)
  const deleteRoom = useCallback(async () => {
    if (!roomId || !isOrganizer) {
      throw new Error("Only organizer can delete the room");
    }

    const token = localStorage.getItem("token");
    const response = await fetch(`/api/v1/hero-rooms/${roomId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to delete room");
    }
  }, [roomId, isOrganizer]);

  // Join room as player
  const joinAsPlayer = useCallback(async () => {
    if (!roomId || !userId || !connected || isOrganizer) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/hero-rooms/${roomId}/join`, {
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
      console.error("Error joining hero room as player:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось присоединиться к Hero-комнате",
        variant: "destructive",
      });
    }
  }, [roomId, userId, connected, isOrganizer, joinRoom, loadRoom, toast]);

  // Join room as observer
  const joinAsObserver = useCallback(async () => {
    if (!roomId || !userId || !connected) return;

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/hero-rooms/${roomId}/observe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to join as observer");
      }

      // Join via WebSocket
      joinRoom(roomId, userId);
      loadRoom();
    } catch (error) {
      console.error("Error joining hero room as observer:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось присоединиться как наблюдатель",
        variant: "destructive",
      });
    }
  }, [roomId, userId, connected, joinRoom, loadRoom, toast]);

  return {
    room,
    players,
    remainingTime,
    formattedTime,
    isLoading,
    connected,
    isOrganizer,
    isObserver,
    isPlayer,
    startGame,
    deleteRoom,
    joinAsPlayer,
    joinAsObserver,
    loadRoom,
    isActive: isTimerActive,
  };
};
