import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Player } from "@shared/types";
import { useTranslation } from 'react-i18next';

type LeaderboardPeriod = "today" | "week" | "alltime";

interface LeaderboardResponse {
  leaderboard: Player[];
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<LeaderboardPeriod>("today");
  const { t, i18n } = useTranslation();

  // Fetch leaderboard data
  const { data, isLoading } = useQuery<LeaderboardResponse>({
    queryKey: [`/api/v1/leaderboard/${period}`],
  });

  // Fetch user data
  const { data: userData } = useQuery({
    queryKey: ['/api/v1/users/me'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/v1/users/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.json();
    },
  });
  const currentUserId = userData?.user?.id;
  const leaderboardData = data?.leaderboard || [];

  // Get top 3 players and remaining players
  const topPlayers = leaderboardData.slice(0, 3);
  const otherPlayers = leaderboardData.slice(3, 10);

  return (
    <>
      <Header title={t('leaderboard')} />
      <div className="p-4 pb-20">
        {/* Time Filter */}
        <div className="flex justify-center mb-5">
          <div className="inline-flex bg-telegram-gray-200 rounded-full p-1">
            <button 
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium",
                period === "today" ? "bg-[#0088CC] text-white" : "text-telegram-gray-700"
              )}
              onClick={() => setPeriod("today")}
            >
              {t('today')}
            </button>
            <button 
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium",
                period === "week" ? "bg-[#0088CC] text-white" : "text-telegram-gray-700"
              )}
              onClick={() => setPeriod("week")}
            >
              {t('week')}
            </button>
            <button 
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium",
                period === "alltime" ? "bg-[#0088CC] text-white" : "text-telegram-gray-700"
              )}
              onClick={() => setPeriod("alltime")}
            >
              {t('all_time')}
            </button>
          </div>
        </div>

        {isLoading ? (
          // Loading state
          <div className="animate-pulse">
            <div className="flex justify-around mb-8">
              {[0, 1, 2].map((i) => (
                <div key={i} className="text-center">
                  <div className="inline-block">
                    <div className={`w-${i === 1 ? '20' : '16'} h-${i === 1 ? '20' : '16'} bg-gray-200 rounded-full mb-2`}></div>
                  </div>
                  <div className="h-4 bg-gray-200 w-16 mx-auto mb-1 rounded"></div>
                  <div className="h-3 bg-gray-200 w-12 mx-auto rounded"></div>
                </div>
              ))}
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-telegram-gray-200">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center p-3 border-b border-telegram-gray-200">
                  <div className="w-8 h-8 bg-gray-200 rounded-full mr-3"></div>
                  <div className="w-10 h-10 bg-gray-200 rounded-full mr-3"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-gray-200 w-20 mb-1 rounded"></div>
                    <div className="h-3 bg-gray-200 w-24 rounded"></div>
                  </div>
                  <div className="h-5 bg-gray-200 w-16 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Top 3 Winners */}
            <div className="flex justify-around mb-8">
              {/* 2nd Place - shown first for layout purposes */}
              {topPlayers.length > 1 && (
                <div className="text-center">
                  <div className="relative inline-block">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-telegram-gray-500">
                      <img 
                        src={topPlayers[1].photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(topPlayers[1].username)}&background=random`}
                        alt="2nd Place" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-telegram-gray-500 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md">
                      2
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    {topPlayers[1].id === currentUserId ? 'You' : topPlayers[1].username}
                  </div>
                  <div className="text-xs flex items-center justify-center">
                    <i className="fas fa-star text-yellow-400 mr-1"></i> {topPlayers[1].stars_won}
                  </div>
                </div>
              )}

              {/* 1st Place */}
              {topPlayers.length > 0 && (
                <div className="text-center -mt-4">
                  <div className="relative inline-block">
                    <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-[#4CAF50]">
                      <img 
                        src={topPlayers[0].photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(topPlayers[0].username)}&background=random`}
                        alt="1st Place" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-[#4CAF50] text-white rounded-full w-10 h-10 flex items-center justify-center shadow-md">
                      <i className="fas fa-crown"></i>
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    {topPlayers[0].id === currentUserId ? 'You' : topPlayers[0].username}
                  </div>
                  <div className="text-xs flex items-center justify-center">
                    <i className="fas fa-star text-yellow-400 mr-1"></i> {topPlayers[0].stars_won}
                  </div>
                </div>
              )}

              {/* 3rd Place */}
              {topPlayers.length > 2 && (
                <div className="text-center">
                  <div className="relative inline-block">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-amber-600">
                      <img 
                        src={topPlayers[2].photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(topPlayers[2].username)}&background=random`}
                        alt="3rd Place" 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-amber-600 text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md">
                      3
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-medium">
                    {topPlayers[2].id === currentUserId ? 'You' : topPlayers[2].username}
                  </div>
                  <div className="text-xs flex items-center justify-center">
                    <i className="fas fa-star text-yellow-400 mr-1"></i> {topPlayers[2].stars_won}
                  </div>
                </div>
              )}
            </div>

            {/* Leaderboard List */}
            <div className="bg-white rounded-xl shadow-sm border border-telegram-gray-200">
              {otherPlayers.map((player, index) => {
                const position = index + 4; // Starting from 4th place
                const isCurrentUser = player.id === currentUserId;
                
                return (
                  <div 
                    key={player.id} 
                    className={cn(
                      "flex items-center p-3",
                      index < otherPlayers.length - 1 ? "border-b border-telegram-gray-200" : ""
                    )}
                  >
                    <div className="w-8 h-8 bg-telegram-gray-400 text-white rounded-full flex items-center justify-center font-bold mr-3">
                      {position}
                    </div>
                    <div className="w-10 h-10 rounded-full overflow-hidden mr-3">
                      <img 
                        src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`}
                        alt={isCurrentUser ? 'You' : player.username} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{isCurrentUser ? 'You' : player.username}</div>
                      <div className="text-xs text-telegram-gray-600">{player.total_taps} total taps</div>
                    </div>
                    <div className="font-bold flex items-center">
                      <i className="fas fa-star text-yellow-400 mr-1"></i> {player.stars_won}
                    </div>
                  </div>
                );
              })}

              {leaderboardData.length === 0 && (
                <div className="p-8 text-center text-telegram-gray-500">
                  {t('no_data')}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
