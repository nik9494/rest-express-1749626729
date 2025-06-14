import { Header } from "@/components/layout/Header";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { getRandomEmoji } from "@/lib/utils";
import { Player } from "@shared/types";
import { useTranslation } from "react-i18next";
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showError, showSuccess } from "@/lib/telegram";
import { useStandardRoom } from "@/hooks/standard-rooms/useStandardRoom";

export default function WaitingRoomStandardPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const { t } = useTranslation();
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
    isCreator,
    handleJoinRoom,
    handleLeaveRoom,
    loadRoom,
  } = useStandardRoom({
    roomId,
    userId: userData?.user?.id,
  });

  // Load room data on mount (только один раз)
  useEffect(() => {
    if (roomId && userData?.user?.id && !room) {
      console.log(`[WaitingRoomStandard] Loading room data for ${roomId}`);
      loadRoom();
    }
  }, [roomId, userData?.user?.id]); // Убираем loadRoom из зависимостей

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
      console.log(`[WaitingRoomStandard] Room status changed to active, navigating to game room`);
      navigate(`/standard-game-room/${roomId}`);
    }
  }, [room?.status, roomId, navigate]);

  if (userLoading || isLoading) {
    return <div>Loading...</div>;
  }

  if (!room) {
    return <div>Room not found</div>;
  }

  // UI для стандартной комнаты ожидания (создатель = игрок, автостарт при заполнении)
  return (
    <>
      <Header
        title={
          room
            ? `${t("standard_room")}: ${room.entry_fee} ⭐`
            : t("waiting_room")
        }
        showBackButton={true}
      />
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-4 text-[#0088CC]">
          {t("waiting_for_players")}
        </h2>
        <div className="mb-6 font-medium text-telegram-gray-700">
          <i className="fas fa-clock mr-2"></i> {t("auto_start_in")}{" "}
          <span className="text-[#0088CC]">{formattedTime}</span>
        </div>
        <div className="flex justify-center mb-8">
          <div className="bg-[#0088CC] bg-opacity-10 rounded-full px-4 py-2 text-sm font-medium">
            <i className="fas fa-users mr-2 text-[#0088CC]"></i>
            <span>{players.length}</span> /
            <span>{room?.max_players || 10}</span> {t("players")}
          </div>
        </div>
        {/* Players Circle Layout */}
        <div className="relative h-64 w-64 mx-auto mb-8">
          <div className="w-24 h-24 rounded-full bg-[#0088CC] bg-opacity-20 absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-[#0088CC] text-xl font-bold">
            PLAY
          </div>
          {players.map((player, index) => {
            const totalPlayers = Math.max(room?.max_players || 10, 4);
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
        <div className="text-sm text-[#0088CC] mb-6">
          {t("tap_on_avatars_standard")}
        </div>
        {/* Room Info */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-telegram-gray-600">
                {t("entry_fee")}
              </div>
              <div className="text-2xl font-bold text-[#0088CC]">
                {room?.entry_fee} ⭐
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-telegram-gray-600">
                {t("auto_start_in")}
              </div>
              <div className="text-2xl font-bold text-[#0088CC]">
                {formattedTime}
              </div>
            </div>
          </div>
          <div className="text-center text-sm text-telegram-gray-500">
            {t("standard_room_info")}
          </div>
        </div>
        {/* Players List */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <h3 className="font-medium mb-4 text-[#0088CC]">
            {t("players")} ({players.length}/{room?.max_players || 10})
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
                <div>
                  <div className="font-medium">{player.username}</div>
                  <div className="text-xs text-[#0088CC]">
                    {player.id === room?.creator_id
                      ? t("creator_player")
                      : t("player")}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {players.length < 2 && (
            <div className="mt-4 text-center text-sm text-telegram-gray-500">
              {t("waiting_for_players", { count: 2 - players.length })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
