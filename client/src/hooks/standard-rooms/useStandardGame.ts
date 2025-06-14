import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useTelegram } from "@/hooks/useTelegram";
import { throttle } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import { Player, Room, Game } from "@shared/types";

interface UseStandardGameOptions {
  roomId?: string;
  gameId?: string;
  userId?: string;
}

export const useStandardGame = ({ roomId, gameId, userId }: UseStandardGameOptions = {}) => {
  const { connected, subscribe, joinRoom, leaveRoom, sendTap, sendReaction } =
    useWebSocket();
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
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [winner, setWinner] = useState<Player | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  const gameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load room data
  const loadRoom = useCallback(async () => {
    if (!roomId) return;

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
      
      // Если комната активна, значит игра уже началась
      if (data.room?.status === "active") {
        setIsStarted(true);
        setRemainingTime(data.room.duration || 60);
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
      
      if (!response.ok) {
        throw new Error("Failed to load game");
      }
      
      const data = await response.json();
      setGame(data.game);
      setRoom(data.room);
      setPlayers(data.players || []);
      setIsFinished(true);
      setWinner(data.winner || null);
      
      // Загружаем тапы игроков
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
      // Присоединяемся только через WebSocket (API join уже был выполнен ранее)
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
      // Leave via WebSocket
      leaveRoom(roomId, userId);
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  }, [roomId, userId, connected, leaveRoom]);

  // Handle tap
  const handleTap = useCallback(() => {
    if (!isStarted || isFinished || !roomId || !userId || !connected || countdown !== null) return;

    // Update local state immediately for responsive UI
    setLocalTaps((prev) => prev + 1);
    setBuffer((prev) => prev + 1);

    // Trigger haptic feedback
    triggerHapticFeedback("light");
  }, [isStarted, isFinished, roomId, userId, connected, triggerHapticFeedback, countdown]);

  // Send taps to server (throttled to prevent spamming)
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

  // Start countdown
  const startCountdown = useCallback(() => {
    setCountdown(3);
    
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Start game timer
  const startGameTimer = useCallback((duration: number) => {
    setRemainingTime(duration);
    
    gameTimerRef.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          if (gameTimerRef.current) {
            clearInterval(gameTimerRef.current);
            gameTimerRef.current = null;
          }
          return 0;
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
          console.log("[StandardGame] Game starting, beginning countdown");
          setIsStarted(true);
          setGame(message.data.game || message.data);
          setRoom(prev => prev ? { ...prev, status: "active" } : null);
          
          
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
          
          // Очищаем таймеры
          if (gameTimerRef.current) {
            clearInterval(gameTimerRef.current);
            gameTimerRef.current = null;
          }
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }

          // Refetch user data as balance might have changed
          queryClient.invalidateQueries({ queryKey: ["/api/v1/users/me"] });
        }
      },
    );

    const unsubscribeTap = subscribe(
      WsMessageType.TAP,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          const userId = message.user_id as string;
          // Добавлена проверка на существование message.data и message.data.count
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
          // Handle reaction - could trigger an animation or show a toast
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
  }, [connected, subscribe, players, toast, roomId, room, startCountdown, startGameTimer]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (gameTimerRef.current) {
        clearInterval(gameTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  return {
    room,
    game,
    players,
    taps,
    localTaps,
    isStarted,
    isFinished,
    remainingTime,
    winner,
    connected,
    countdown,
    handleTap,
    handleJoinRoom,
    handleLeaveRoom,
    handleSendReaction,
    loadRoom,
    loadGame,
  };
};
