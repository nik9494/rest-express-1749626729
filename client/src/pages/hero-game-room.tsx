import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { TapButton } from "@/components/game/TapButton";
import { ProgressBar } from "@/components/game/ProgressBar";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { formatTime } from "@/lib/utils";
import { useHeroGame } from "@/hooks/hero-rooms/useHeroGame";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/types";
import { useTranslation } from "react-i18next";

export default function HeroGameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  // Fetch user data
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ["/api/v1/users/me"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const response = await fetch("/api/v1/users/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.json();
    },
  });
  const user: User | null = userData?.user || null;

  const {
    room,
    game,
    players,
    taps,
    localTaps,
    isStarted,
    isFinished,
    remainingTime,
    winner,
    countdown,
    isObserver,
    isOrganizer,
    handleTap,
  } = useHeroGame({
    roomId,
    userId: user?.id,
  });

  // Navigate to results when game ends
  useEffect(() => {
    if (isFinished && game?.id) {
      setTimeout(() => {
        navigate(`/game-results/${game.id}`);
      }, 3000);
    }
  }, [isFinished, game, navigate]);

  // Get max taps among all players
  const getMaxTaps = () => {
    return Math.max(...players.map((p) => taps[p.id] || 0), 1); // Prevent division by zero
  };

  // Calculate progress percentage
  const calculateProgress = (playerTaps: number) => {
    const maxTaps = getMaxTaps();
    return (playerTaps / maxTaps) * 100;
  };

  // Get sorted players by taps count (descending)
  const getSortedPlayers = () => {
    return [...players].sort((a, b) => (taps[b.id] || 0) - (taps[a.id] || 0));
  };

  if (userLoading) {
    return <div>Loading...</div>;
  }

  // Render countdown overlay
  if (countdown !== null) {
    return (
      <>
        <Header
          title={t("hero_room")}
          showBackButton={true}
        />
        <div className="flex items-center justify-center h-[70vh]">
          <div className="text-center">
            <div className="text-8xl font-bold mb-4 animate-pulse text-amber-600">
              {countdown === 0 ? "GO!" : countdown}
            </div>
            <p className="text-xl text-amber-700">
              {countdown === 0 ? t("game_started") : t("get_ready")}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={
          room
            ? `${t("hero_room")}: ${room.entry_fee} ⭐`
            : t("game_room")
        }
        showBackButton={true}
      />
      <div className="p-6 text-center">
        {isObserver && (
          <div className="mb-4 bg-amber-100 text-amber-700 py-2 px-4 rounded-full inline-block">
            <i className="fas fa-crown mr-2"></i>
            {isOrganizer ? t("organizer_mode") : t("observer_mode")}
          </div>
        )}

        {isFinished ? (
          // Game finished - show results
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-6 text-amber-600">
              {t("game_finished")}
            </h1>
            
            {winner && (
              <div className="mb-6">
                <h2 className="text-xl mb-4">{t("winner")}:</h2>
                <div className="flex justify-center mb-4">
                  <PlayerAvatar
                    player={winner}
                    isCurrentUser={winner.id === user?.id}
                    isReady={true}
                    taps={taps[winner.id] || 0}
                    className="scale-125"
                  />
                </div>
                <p className="text-lg font-bold mb-1">{winner.username}</p>
                <p className="text-amber-600 text-xl">{taps[winner.id] || 0} {t("taps")}</p>
                {room && (
                  <div className="mt-2">
                    <p className="text-lg">
                      {t("winner_prize")}: {Math.floor(Number(room.entry_fee) * players.length * 0.9)} ⭐
                    </p>
                    {isOrganizer && (
                      <p className="text-sm text-amber-600">
                        {t("organizer_share")}: {Math.ceil(Number(room.entry_fee) * players.length * 0.1)} ⭐
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="text-sm text-amber-500 mt-4">
              {t("redirecting_to_results")}
            </div>
          </div>
        ) : (
          // Game in progress
          <>
            <div className="mb-8">
              <ProgressBar value={remainingTime} max={room?.duration || 60} />
              <div className="text-sm text-amber-700 mt-2">
                {formatTime(remainingTime)}
              </div>
            </div>

            <div className="relative h-80 w-80 mx-auto mb-8">
              <TapButton
                onTap={handleTap}
                disabled={!isStarted || isFinished || isObserver}
                className={(!isStarted || isFinished || isObserver) ? "opacity-50 cursor-not-allowed" : ""}
              />

              {/* Players positioned in a circle */}
              {players.map((player, index) => {
                const totalPlayers = Math.max(players.length, 4);
                const angle = (Math.PI * 2 * index) / totalPlayers;
                const radius = 120;
                const left = 50 + Math.sin(angle) * (radius / 160) * 50;
                const top = 50 + Math.cos(angle) * (radius / 160) * 50;

                return (
                  <div
                    key={player.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ease-in-out scale-75"
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                    }}
                  >
                    <PlayerAvatar
                      player={player}
                      isCurrentUser={player.id === user?.id}
                      isReady={true}
                      taps={taps[player.id] || 0}
                      className="game-mode"
                    />
                  </div>
                );
              })}
            </div>

            {!isObserver ? (
              <div className="text-sm text-amber-700 mb-6">
                {t("tap_to_win")}
              </div>
            ) : (
              <div className="text-sm text-amber-600 mb-6">
                {isOrganizer ? t("organizer_watching") : t("observer_watching")}
              </div>
            )}
            
            {/* Current user's tap count (only for players) */}
            {user && !isObserver && (
              <div className="bg-white rounded-xl shadow-md p-4 mb-4">
                <div className="text-lg font-bold text-amber-600">
                  {t("your_taps")}: {localTaps}
                </div>
              </div>
            )}
            
            {/* Leaderboard */}
            <div className="bg-white rounded-xl shadow-md p-4">
              <h3 className="font-medium mb-3 text-amber-600">{t("leaderboard")}</h3>
              <div className="space-y-2">
                {getSortedPlayers().slice(0, 5).map((player, index) => (
                  <div key={player.id} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="w-6 text-sm font-bold text-amber-600">
                        #{index + 1}
                      </span>
                      <div className="w-8 h-8 rounded-full overflow-hidden mr-2">
                        <img
                          src={
                            player.photo_url ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`
                          }
                          alt={player.username}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="text-sm font-medium">{player.username}</span>
                      {player.id === room?.creator_id && (
                        <span className="ml-1 text-xs text-amber-600">👑</span>
                      )}
                    </div>
                    <span className="text-sm font-bold text-amber-600">
                      {taps[player.id] || 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
