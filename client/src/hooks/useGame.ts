import { useState, useEffect, useCallback } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";
import { useToast } from "@/hooks/use-toast";
import { useTelegram } from "@/hooks/useTelegram";
import { throttle } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { Player, Room, Game } from "@shared/types";

interface UseGameOptions {
  roomId?: string;
  gameId?: string;
  userId?: string;
}

export const useGame = ({ roomId, gameId, userId }: UseGameOptions = {}) => {
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

  // Load room data
  const loadRoom = useCallback(async () => {
    if (!roomId) return;

    try {
      // Сначала пробуем загрузить как стандартную комнату
      try {
        const response = await apiRequest("GET", `/api/v1/standard-rooms/${roomId}`);
        const data = await response.json();
        setRoom(data.room);
        setPlayers(data.players || []);
        setRemainingTime(data.waitingTime || 60);
        return;
      } catch (error) {
        console.log("Not a standard room, trying hero room...");
      }

      // Если не стандартная, пробуем как hero-комнату
      try {
        const response = await apiRequest("GET", `/api/v1/hero-rooms/${roomId}`);
        const data = await response.json();
        setRoom(data.room);
        setPlayers(data.players || []);
        setRemainingTime(data.waitingTime || 60);
        return;
      } catch (error) {
        console.log("Not a hero room either");
      }

      throw new Error("Room not found");
    } catch (error) {
      console.error("Error loading room:", error);
      toast({
        title: "Error",
        description: "Failed to load room data",
        variant: "destructive",
      });
    }
  }, [roomId, toast]);

  // Load game data
  const loadGame = useCallback(async () => {
    if (!gameId) return;

    try {
      // Сначала пробуем загрузить как стандартную игру
      try {
        const response = await apiRequest("GET", `/api/v1/standard-rooms/${roomId}/game/${gameId}`);
        const data = await response.json();
        setGame(data.game);
        setPlayers(data.players || []);
        setIsFinished(true);
        setWinner(data.winner || null);
        return;
      } catch (error) {
        console.log("Not a standard game, trying hero game...");
      }

      // Если не стандартная, пробуем как hero-игру
      try {
        const response = await apiRequest("GET", `/api/v1/hero-rooms/${roomId}/game/${gameId}`);
        const data = await response.json();
        setGame(data.game);
        setPlayers(data.players || []);
        setIsFinished(true);
        setWinner(data.winner || null);
        return;
      } catch (error) {
        console.log("Not a hero game either");
      }

      throw new Error("Game not found");
    } catch (error) {
      console.error("Error loading game:", error);
      toast({
        title: "Error",
        description: "Failed to load game data",
        variant: "destructive",
      });
    }
  }, [gameId, roomId, toast]);

  // Join room
  const handleJoinRoom = useCallback(async () => {
    if (!roomId || !userId || !connected) return;

    try {
      // Join via API first
      await apiRequest("POST", `/api/v1/rooms/${roomId}/join`);

      // Then join via WebSocket
      joinRoom(roomId, userId);
      loadRoom();
    } catch (error) {
      console.error("Error joining room:", error);
      toast({
        title: "Error",
        description: "Failed to join room",
        variant: "destructive",
      });
    }
  }, [roomId, userId, connected, joinRoom, loadRoom, toast]);

  // Leave room
  const handleLeaveRoom = useCallback(async () => {
    if (!roomId || !userId || !connected) return;

    try {
      // Leave via API first
      await apiRequest("POST", `/api/v1/rooms/${roomId}/leave`);

      // Then leave via WebSocket
      leaveRoom(roomId, userId);
    } catch (error) {
      console.error("Error leaving room:", error);
    }
  }, [roomId, userId, connected, leaveRoom]);

  // Handle tap
  const handleTap = useCallback(() => {
    if (!isStarted || isFinished || !roomId || !userId || !connected) return;

    // Update local state immediately for responsive UI
    setLocalTaps((prev) => prev + 1);
    setBuffer((prev) => prev + 1);

    // Trigger haptic feedback
    triggerHapticFeedback("light");
  }, [isStarted, isFinished, roomId, userId, connected, triggerHapticFeedback]);

  // Send taps to server (throttled to prevent spamming)
  const sendTapToServer = useCallback(
    throttle(() => {
      if (buffer > 0 && roomId && userId && connected) {
        sendTap(roomId, userId, buffer);
        setTaps((prev) => ({
          ...prev,
          [userId]: (prev[userId] || 0) + buffer,
        }));
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

  // Update room when socket connected
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

  // Timer countdown effect
  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (remainingTime > 0) {
      timer = setInterval(() => {
        setRemainingTime((prev) => Math.max(0, prev - 1));
      }, 1000);
    }

    return () => {
      clearInterval(timer);
    };
  }, [remainingTime]);

  // Subscribe to WebSocket messages
  useEffect(() => {
    if (!connected) return;

    const unsubscribeJoin = subscribe(
      WsMessageType.PLAYER_JOIN,
      (message: WebSocketMessage) => {
        setPlayers((prev) => {
          const player = message.data.player;
          if (!prev.some((p) => p.id === player.id)) {
            return [...prev, player];
          }
          return prev;
        });
      },
    );

    const unsubscribeLeave = subscribe(
      WsMessageType.PLAYER_LEAVE,
      (message: WebSocketMessage) => {
        setPlayers((prev) =>
          prev.filter((player) => player.id !== message.user_id),
        );
      },
    );

    const unsubscribeRoomUpdate = subscribe(
      WsMessageType.ROOM_UPDATE,
      (message: WebSocketMessage) => {
        setRoom(message.data.room);
        setPlayers(message.data.players || []);
      },
    );

    const unsubscribeGameStart = subscribe(
      WsMessageType.GAME_START,
      (message: WebSocketMessage) => {
        setIsStarted(true);
        setGame(message.data.game);
        setRemainingTime(message.data.duration || 60);
      },
    );

    const unsubscribeGameEnd = subscribe(
      WsMessageType.GAME_END,
      (message: WebSocketMessage) => {
        setIsFinished(true);
        setGame(message.data.game);
        setWinner(message.data.winner);

        // Refetch user data as balance might have changed
        queryClient.invalidateQueries({ queryKey: ["/api/v1/users/me"] });
      },
    );

    const unsubscribeTap = subscribe(
      WsMessageType.TAP,
      (message: WebSocketMessage) => {
        const userId = message.user_id as string;
        if (userId) {
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
      },
    );

    const unsubscribeReaction = subscribe(
      WsMessageType.PLAYER_REACTION,
      (message: WebSocketMessage) => {
        // Handle reaction - could trigger an animation or show a toast
        const fromPlayer = players.find((p) => p.id === message.user_id);
        const toPlayer = players.find((p) => p.id === message.data.to_user_id);

        if (fromPlayer && toPlayer) {
          toast({
            title: `${fromPlayer.username} reacted`,
            description: `${message.data.reaction} to ${toPlayer.username}`,
            duration: 2000,
          });
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
  }, [connected, subscribe, players, toast]);

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
    handleTap,
    handleJoinRoom,
    handleLeaveRoom,
    handleSendReaction,
  };
};
