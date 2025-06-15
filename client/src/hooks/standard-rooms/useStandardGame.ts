import { useState, useEffect, useCallback } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useTelegram } from "@/hooks/useTelegram";
import { throttle } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { Player, Room, Game } from "@shared/types";
import { useUnifiedTimer } from "@/hooks/useUnifiedTimer";

interface UseStandardGameOptions {
  roomId?: string;
  gameId?: string;
  userId?: string;
}

export const useStandardGame = ({ roomId, gameId, userId }: UseStandardGameOptions = {}) => {
  const { connected, subscribe, joinRoom, leaveRoom, sendTap, sendReaction } = useWebSocket();
  const { toast } = useToast();
  const { triggerHapticFeedback } = useTelegram();

  const [room, setRoom] = useState<Room | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [taps, setTaps] = useState<Record<string, number>>({});
  const [localTaps, setLocalTaps] = useState<number>(0);
  const [buffer, setBuffer] = useState<number>(0);
  const [isStarted, setIsStarted] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameStartTime, setGameStartTime] = useState<number | undefined>(undefined);
  const [gameDuration, setGameDuration] = useState<number | undefined>(undefined);

  // --- Unified Timer ---
  const {
    remainingTime: syncedRemainingTime,
    formattedTime: syncedFormattedTime,
    isActive: isTimerActive,
    isTimerSynced,
    startTimer,
    stopTimer,
  } = useUnifiedTimer({
    roomId,
    timerType: "game",
    startTime: gameStartTime,
    duration: gameDuration,
    onTimerEnd: () => setIsFinished(true),
  });

  // Load room data
  const loadRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/standard-rooms/${roomId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Failed to load room");
      const data = await response.json();
      setRoom(data.room);
      setPlayers(data.players || []);
      if (data.room?.status === "active") {
        setIsStarted(true);
        setGameStartTime(data.room.startTime); // предполагается, что приходит startTime
        setGameDuration(data.room.duration || 60);
      }
    } catch (error) {
      console.error("Error loading standard room:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить данные комнаты",
        variant: "destructive",
      });
    }
  }, [roomId, toast]);

  // Load game data
  const loadGame = useCallback(async () => {
    if (!gameId) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/v1/games/${gameId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error("Failed to load game");
      const data = await response.json();
      setGame(data.game);
      setRoom(data.room);
      setPlayers(data.players || []);
      setIsFinished(true);
      setWinner(data.winner || null);
      const tapsByUser: Record<string, number> = {};
      data.players?.forEach((player: Player) => {
        tapsByUser[player.id] = player.taps || 0;
      });
      setTaps(tapsByUser);
    } catch (error) {
      console.error("Error loading game:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить данные игры",
        variant: "destructive",
      });
    }
  }, [gameId, toast]);

  // Join room (только для WebSocket)
  const handleJoinRoom = useCallback(async () => {
    if (!roomId || !userId || !connected) return;
    try {
      joinRoom(roomId, userId);
      await loadRoom();
    } catch (error) {
      console.error("Error joining room via WebSocket:", error);
    }
  }, [roomId, userId, connected, joinRoom, loadRoom]);

  // Leave room
  const handleLeaveRoom = useCallback(async () => {
    if (!roomId || !userId || !connected) return;
    try {
      leaveRoom(roomId, userId);
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  }, [roomId, userId, connected, leaveRoom]);

  // Handle tap
  const handleTap = useCallback(() => {
    if (!isStarted || isFinished || !roomId || !userId || !connected || countdown !== null) return;
    setLocalTaps((prev) => prev + 1);
    setBuffer((prev) => prev + 1);
    triggerHapticFeedback("light");
  }, [isStarted, isFinished, roomId, userId, connected, triggerHapticFeedback, countdown]);

  // Send taps to server (throttled)
  const sendTapToServer = useCallback(
    throttle(() => {
      if (buffer > 0 && roomId && userId && connected) {
        sendTap(roomId, userId, buffer);
        setBuffer(0);
      }
    }, 100),
    [buffer, roomId, userId, connected, sendTap],
  );

  // Send reaction
  const handleSendReaction = useCallback(
    (toPlayerId: string, reaction: string) => {
      if (!roomId || !userId || !connected) return;
      sendReaction(roomId, userId, toPlayerId, reaction);
    },
    [roomId, userId, connected, sendReaction],
  );

  // Start countdown (локальный отсчёт до старта)
  const startCountdown = useCallback(() => {
    setCountdown(3);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Load room data on mount
  useEffect(() => {
    if (connected && roomId && userId) {
      loadRoom();
    }
  }, [connected, roomId, userId, loadRoom]);

  // Load game data when game ID is provided
  useEffect(() => {
    if (gameId) {
      loadGame();
    }
  }, [gameId, loadGame]);

  // Initial join room
  useEffect(() => {
    if (roomId && userId && connected) {
      handleJoinRoom();
    }
    return () => {
      if (roomId && userId && connected) {
        handleLeaveRoom();
      }
    };
  }, [roomId, userId, connected, handleJoinRoom, handleLeaveRoom]);

  // Send buffered taps
  useEffect(() => {
    if (buffer > 0) {
      sendTapToServer();
    }
  }, [buffer, sendTapToServer]);

  // Subscribe to WebSocket messages
  useEffect(() => {
    if (!connected) return;
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
          setPlayers((prev) => prev.filter((player) => player.id !== message.user_id));
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
          setIsStarted(true);
          setGame(message.data.game || message.data);
          setRoom((prev) => (prev ? { ...prev, status: "active" } : null));
          // Получаем время старта и длительность из сообщения или комнаты
          const startTime = message.data?.startTime || message.data?.game?.startTime || Date.now();
          const duration = message.data?.duration || message.data?.game?.duration || room?.duration || 60;
          setGameStartTime(startTime);
          setGameDuration(duration);
          startCountdown();
        }
      },
    );
    const unsubscribeGameEnd = subscribe(
      WsMessageType.GAME_END,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          setIsFinished(true);
          setGame(message.data.game);
          setWinner(message.data.winner);
          queryClient.invalidateQueries({ queryKey: ["/api/v1/users/me"] });
          stopTimer();
        }
      },
    );
    const unsubscribeTap = subscribe(
      WsMessageType.TAP,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          const userId = message.user_id as string;
          if (userId && message.data && typeof message.data.count === 'number') {
            setTaps((prev) => ({
              ...prev,
              [userId]: (prev[userId] || 0) + message.data.count,
            }));
            setPlayers((prev) =>
              prev.map((player) =>
                player.id === userId
                  ? { ...player, taps: (player.taps || 0) + message.data.count }
                  : player,
              ),
            );
          }
        }
      },
    );
    const unsubscribeReaction = subscribe(
      WsMessageType.PLAYER_REACTION,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          const fromPlayer = players.find((p) => p.id === message.user_id);
          const toPlayer = players.find((p) => p.id === message.data.to_user_id);
          if (fromPlayer && toPlayer) {
            toast({
              title: `${fromPlayer.username} отреагировал`,
              description: `${message.data.reaction} на ${toPlayer.username}`,
              duration: 2000,
            });
          }
        }
      },
    );
    return () => {
      unsubscribeJoin();
      unsubscribeLeave();
      unsubscribeRoomUpdate();
      unsubscribeGameStart();
      unsubscribeGameEnd();
      unsubscribeTap();
      unsubscribeReaction();
    };
  }, [connected, subscribe, players, toast, roomId, room, startCountdown, stopTimer]);

  // --- ВАЖНО: убраны все локальные setInterval/setTimeout для игрового времени ---

  return {
    room,
    game,
    players,
    taps,
    localTaps,
    isStarted,
    isFinished,
    winner,
    connected,
    countdown, // локальный отсчёт до старта
    syncedRemainingTime, // синхронизированное время для прогресс-бара
    syncedFormattedTime,
    isTimerActive,
    isTimerSynced,
    handleTap,
    handleJoinRoom,
    handleLeaveRoom,
    handleSendReaction,
    loadRoom,
    loadGame,
  };
};
