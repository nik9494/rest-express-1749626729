import { useState, useEffect, useCallback } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useTelegram } from "@/hooks/useTelegram";
import { apiRequest } from "@/lib/queryClient";
import { Player, Room } from "@shared/types";

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
  const [remainingTime, setRemainingTime] = useState<number>(300);
  const [formattedTime, setFormattedTime] = useState<string>("5:00");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isOrganizer, setIsOrganizer] = useState<boolean>(false);
  const [isObserver, setIsObserver] = useState<boolean>(false);
  const [isPlayer, setIsPlayer] = useState<boolean>(false);
  const [serverTime, setServerTime] = useState<number>(Date.now());
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now());

  // Форматирование времени
  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  // Subscribe to WebSocket messages
  useEffect(() => {
    if (!connected || !roomId) return;

    const unsubscribeServerTime = subscribe(
      WsMessageType.SERVER_TIME,
      (message: WebSocketMessage) => {
        if (message.data?.serverTime) {
          setServerTime(message.data.serverTime);
          setLastUpdateTime(Date.now());
        }
      }
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
      }
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
          setRemainingTime(0);
          setFormattedTime("0:00");
          
          // Показываем уведомление
          toast({
            title: "Комната удалена",
            description: message.data?.reason || "Hero-комната была удалена",
            variant: "destructive",
          });

          // Покидаем комнату
          leaveRoom(roomId, userId || "");
        }
      },
    );

    return () => {
      unsubscribeServerTime();
      unsubscribeJoin();
      unsubscribeLeave();
      unsubscribeRoomUpdate();
      unsubscribeGameStart();
      unsubscribeRoomDeleted();
    };
  }, [connected, roomId, subscribe]);

  // Load room data
  const loadRoom = useCallback(async () => {
    if (!roomId) return;

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
      setRoom(data.room);
      setPlayers(data.players || []);

      // Вычисляем оставшееся время на основе времени создания комнаты и серверного времени
      if (data.room?.created_at && data.room?.waiting_time) {
        const createdTime = new Date(data.room.created_at).getTime();
        const waitingTime = data.room.waiting_time * 1000;
        const elapsedTime = serverTime - createdTime;
        const remaining = Math.max(0, waitingTime - elapsedTime);
        setRemainingTime(Math.floor(remaining / 1000));
      } else {
        setRemainingTime(data.waitingTime || 300);
      }

      // Определяем роли пользователя
      const roomOrganizer = data.room?.creator_id === userId;
      const participant = data.players?.find((p: Player) => p.id === userId);

      setIsOrganizer(roomOrganizer);
      setIsObserver(roomOrganizer || participant?.is_observer || false);
      setIsPlayer(!roomOrganizer && !!participant && !participant.is_observer);
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
  }, [roomId, userId, toast, serverTime]);

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

  // Timer countdown effect
  useEffect(() => {
    let animationFrame: number;
    let lastFrameTime = Date.now();

    const waitingTime = room?.waiting_time;
    if (room?.status === "waiting" && room?.created_at && waitingTime) {
      const updateTimer = () => {
        const currentTime = Date.now();
        const deltaTime = currentTime - lastFrameTime;
        lastFrameTime = currentTime;

        const createdTime = new Date(room.created_at).getTime();
        const waitingTimeMs = waitingTime * 1000;
        const elapsedTime = serverTime - createdTime + (currentTime - lastUpdateTime);
        const remaining = Math.max(0, waitingTimeMs - elapsedTime);
        const remainingSeconds = Math.floor(remaining / 1000);
        
        setRemainingTime(remainingSeconds);
        setFormattedTime(formatTime(remainingSeconds));
        
        animationFrame = requestAnimationFrame(updateTimer);
      };

      updateTimer();
    }

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [room?.status, room?.created_at, room?.waiting_time, serverTime, lastUpdateTime, formatTime]);

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
  };
};
