import { useState, useEffect, useCallback } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useTelegram } from "@/hooks/useTelegram";
import { apiRequest } from "@/lib/queryClient";
import { Player, Room } from "@shared/types";

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
  const [remainingTime, setRemainingTime] = useState<number>(60);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCreator, setIsCreator] = useState<boolean>(false);

  // Load room data
  const loadRoom = useCallback(async () => {
    if (!roomId) return;

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
      setRemainingTime(data.waitingTime || 60);
      setIsCreator(data.room?.creator_id === userId);
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
  }, [roomId, userId, toast]);

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

  // Timer countdown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (remainingTime > 0 && room?.status === "waiting") {
      timer = setInterval(() => {
        setRemainingTime((prev) => {
          const newTime = Math.max(0, prev - 1);
          // Автостарт при достижении 0 или заполнении комнаты
          if (newTime === 0 && players.length >= 2) {
            // Игра должна начаться автоматически
          }
          return newTime;
        });
      }, 1000);
    }

    return () => {
      clearInterval(timer);
    };
  }, [remainingTime, room?.status, players.length]);

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

    return () => {
      unsubscribeJoin();
      unsubscribeLeave();
      unsubscribeRoomUpdate();
      unsubscribeGameStart();
    };
  }, [connected, subscribe, roomId]);

  return {
    room,
    players,
    remainingTime,
    isLoading,
    connected,
    isCreator,
    handleJoinRoom,
    handleLeaveRoom,
    loadRoom,
  };
};
