import { Header } from "@/components/layout/Header";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { formatTime, getRandomEmoji } from "@/lib/utils";
import { Player, Room } from "@shared/types";
import { useTranslation } from "react-i18next";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showError, showSuccess } from "@/lib/telegram";
import { useHeroRoom } from "@/hooks/hero-rooms/useHeroRoom";
import { useToast } from "@/hooks/use-toast";

interface Participant {
  user_id: string;
  is_observer: boolean;
  joined_at: Date;
  entry_fee: string;
}

export default function WaitingRoomHeroPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [emojis, setEmojis] = useState<
    { id: string; emoji: string; x: number; y: number }[]
  >([]);

  // Fetch user data
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ["/api/v1/users/me"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token");
      const response = await fetch("/api/v1/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch user data");
      return response.json();
    },
  });

  const {
    room,
    players,
    remainingTime,
    formattedTime,
    isLoading,
    connected,
    isOrganizer,
    isObserver,
    isPlayer,
    startGame: heroStartGame,
    deleteRoom: heroDeleteRoom,
    loadRoom,
    isActive,
  } = useHeroRoom({
    roomId,
    userId: userData?.user?.id,
  });

  // Debug effect для отслеживания изменений таймера
  useEffect(() => {
    console.log(`[WaitingRoom] Timer state:`, {
      remainingTime,
      formattedTime,
      isActive
    });
  }, [remainingTime, formattedTime, isActive]);

  // Start game mutation
  const { mutate: startGame, isPending: isStarting } = useMutation({
    mutationFn: heroStartGame,
    onSuccess: () => {
      navigate(`/game-room/${roomId}`);
    },
    onError: (error) => {
      showError("Failed to start game: " + (error as Error).message);
    },
  });

  // Delete room mutation
  const { mutate: deleteRoom, isPending: isDeleting } = useMutation({
    mutationFn: heroDeleteRoom,
    onSuccess: () => {
      showSuccess("Hero-комната удалена");
      navigate("/hero-room");
    },
    onError: (error) => {
      showError("Не удалось удалить комнату: " + (error as Error).message);
    },
  });

  // Load room data on mount
  useEffect(() => {
    if (roomId && userData?.user?.id) {
      loadRoom();
    }
  }, [roomId, userData?.user?.id, loadRoom]);

  // Redirect when timer expires
  useEffect(() => {
    if (remainingTime === 0 && room?.created_at && room?.waiting_time) {
      const createdTime = new Date(room.created_at).getTime();
      const waitingTime = room.waiting_time;
      const now = Date.now();
      const endTime = createdTime + waitingTime * 1000;
      
      // Проверяем, действительно ли время истекло
      if (now >= endTime) {
        console.log(`[WaitingRoom] Time actually expired, showing notification`);
        toast({
          title: "Время ожидания истекло",
          description: "Комната будет удалена, так как не набралось достаточно игроков",
          variant: "destructive",
        });
        navigate("/hero-room");
      } else {
        console.log(`[WaitingRoom] Timer reached 0 but actual time not expired yet`);
      }
    }
  }, [remainingTime, navigate, toast, room]);

  // Handle player avatar click (send reaction)
  const handlePlayerClick = (player: Player) => {
    const id = Date.now().toString();
    const emoji = getRandomEmoji();
    setEmojis((prev) => [...prev, { id, emoji, x: 50, y: 50 }]);
    setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 1500);
  };

  // Navigate to game room when the game starts
  useEffect(() => {
    if (room?.status === "active") {
      navigate(`/game-room/${roomId}`);
    }
  }, [room?.status, roomId, navigate]);

  if (userLoading || isLoading) {
    return <div>Loading...</div>;
  }

  if (!room) {
    return <div>Room not found</div>;
  }

  const canStartGame = players.length >= 2;

  // UI для hero-комнаты ожидания (организатор = наблюдатель, ручной старт)
  return (
    <>
      <Header
        title={
          room ? `${t("hero_room")}: ${room.entry_fee} ⭐` : t("waiting_room")
        }
        showBackButton={true}
      />
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-4 text-amber-600">
          {isOrganizer
            ? t("organizer_mode")
            : isObserver
              ? t("observer_mode")
              : t("waiting_for_players_hero")}
        </h2>
        <div className="mb-6 font-medium text-amber-700">
          <i className="fas fa-crown mr-2"></i>
          {isOrganizer ? t("you_are_organizer") : t("hero_room_special_rules")}
        </div>
        <div className="flex justify-center mb-8">
          <div className="bg-amber-100 rounded-full px-4 py-2 text-sm font-medium">
            <i className="fas fa-users mr-2 text-amber-600"></i>
            <span>{players.length}</span> /
            <span>{room?.max_players || 30}</span> {t("players")}
          </div>
        </div>
        {/* Players Circle Layout */}
        <div className="relative h-64 w-64 mx-auto mb-8">
          <div className="w-24 h-24 rounded-full bg-amber-200 absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-amber-600 text-xl font-bold">
            {isOrganizer ? "ORG" : isObserver ? "OBS" : "HERO"}
          </div>
          {players.map((player, index) => {
            const totalPlayers = Math.max(room?.max_players || 30, 4);
            const angle = (Math.PI * 2 * index) / totalPlayers;
            const radius = 90; // Оптимизированный радиус для режима ожидания
            const left = 50 + Math.sin(angle) * (radius / 128) * 50;
            const top = 50 + Math.cos(angle) * (radius / 128) * 50;
            return (
              <div
                key={player?.id || `empty-${index}`}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <PlayerAvatar
                  player={player}
                  isCurrentUser={player?.id === userData?.user?.id}
                  isReady={true}
                  onClick={() => player && handlePlayerClick(player)}
                  className="waiting-mode transition-all duration-300"
                />
              </div>
            );
          })}
          {emojis.map(({ id, emoji, x, y }) => (
            <div
              key={id}
              className="emoji-reaction absolute text-2xl"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                animation: "float-up 1.5s ease-out forwards",
              }}
            >
              {emoji}
            </div>
          ))}
        </div>
        <div className="text-sm text-amber-700 mb-6">
          {isOrganizer ? t("organizer_instructions") : t("tap_on_avatars_hero")}
        </div>
        {/* Room Code and Timer */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-amber-700">{t("room_code")}</div>
              <div className="text-2xl font-bold tracking-wider text-amber-600">
                {room?.code}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-amber-700">
                {t("time_remaining")}
              </div>
              <div className="text-2xl font-bold text-amber-600">
                {formattedTime || "0:00"}
              </div>
            </div>
          </div>
          {isOrganizer && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                className={`py-2.5 px-6 rounded-full text-sm font-medium ${
                  canStartGame
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "bg-amber-200 text-amber-500 cursor-not-allowed"
                }`}
                onClick={() => startGame()}
                disabled={!canStartGame || isStarting}
              >
                {isStarting ? t("starting") + "..." : t("start_game")}
              </button>
              <button
                className="bg-red-500 text-white py-2.5 px-6 rounded-full text-sm font-medium hover:bg-red-600"
                onClick={() => deleteRoom()}
                disabled={isDeleting}
              >
                {isDeleting ? t("deleting") + "..." : t("delete_room")}
              </button>
            </div>
          )}
          {isOrganizer && (
            <div className="mt-3 text-xs text-amber-600">
              {t("organizer_benefits")}
            </div>
          )}
        </div>
        {/* Players List */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <h3 className="font-medium mb-4 text-amber-700">
            {t("players")} ({players.length}/{room?.max_players || 30})
          </h3>
          <div className="space-y-3">
            {players.map((player) => (
              <div key={player.id} className="flex items-center">
                <div className="w-10 h-10 rounded-full overflow-hidden mr-3">
                  <img
                    src={
                      player.photo_url ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`
                    }
                    alt={player.username}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{player.username}</div>
                  <div className="text-xs text-amber-600">
                    {player.id === room?.creator_id ? (
                      <span className="font-semibold">{t("organizer")} 👑</span>
                    ) : player.is_observer ? (
                      <span>{t("observer")} 👁️</span>
                    ) : (
                      <span>{t("player")} 🎮</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {players.length < 2 && (
            <div className="mt-4 text-center text-sm text-amber-500">
              {t("waiting_for_players", { count: 2 - players.length })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
