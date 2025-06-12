import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { useQuery } from "@tanstack/react-query";
import { Player } from "@shared/types";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

export default function GameResultsPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  
  // Fetch game results
  const { data, isLoading } = useQuery({
    queryKey: [`/api/v1/games/${gameId}`],
  });
  
  const game = data?.game;
  const players = data?.players || [];
  const winner = data?.winner;
  
  // Fetch current user data
  const { data: userData } = useQuery({
    queryKey: ['/api/v1/users/me'],
  });
  
  const currentUserId = userData?.user?.id;
  
  // Handle back to lobby
  const handleBackToLobby = () => {
    navigate("/");
  };
  
  // Handle play again
  const handlePlayAgain = () => {
    if (!game?.room_id) {
      navigate("/");
      return;
    }
    
    navigate(`/waiting-room/${game.room_id}`);
  };
  
  // Order players by taps (highest first)
  const sortedPlayers = [...players].sort((a, b) => (b.taps || 0) - (a.taps || 0));
  
  // Handle place styles
  const getPlaceStyle = (index: number) => {
    const styles = {
      0: "bg-[#4CAF50] text-white", // 1st place (Winner)
      1: "bg-telegram-gray-500 text-white", // 2nd place
      2: "bg-amber-600 text-white", // 3rd place
      default: "bg-telegram-gray-400 text-white" // All other places
    };
    
    return styles[index as keyof typeof styles] || styles.default;
  };
  
  return (
    <>
      <Header title={t('game_results')} rightContent={
        <select
          className="border rounded px-2 py-1 text-sm"
          value={i18n.language}
          onChange={e => {
            i18n.changeLanguage(e.target.value);
            localStorage.setItem('lang', e.target.value);
          }}
        >
          <option value="ru">Рус</option>
          <option value="en">Eng</option>
        </select>
      } />
      
      <div className="p-6 text-center">
        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-24 w-24 mx-auto rounded-full bg-gray-200 mb-4"></div>
            <div className="h-6 bg-gray-200 w-32 mx-auto mb-2 rounded"></div>
            <div className="h-4 bg-gray-200 w-24 mx-auto mb-8 rounded"></div>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-2">{t('winner')}</h2>
              
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <img 
                    src={winner?.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(winner?.username || 'Winner')}&background=random`}
                    alt="Winner" 
                    className="w-24 h-24 rounded-full object-cover border-4 border-[#4CAF50]" 
                  />
                  <div className="absolute -top-2 -right-2 bg-[#4CAF50] text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md">
                    <i className="fas fa-trophy"></i>
                  </div>
                </div>
              </div>
              
              <h3 className="text-lg font-medium">
                {winner?.id === currentUserId ? 'You' : winner?.username}
              </h3>
              <p className="text-sm text-telegram-gray-600 mb-2">
                {t('with')} <span className="font-bold">{winner?.taps || 0}</span> {t('taps')}
              </p>
              
              <div className="bg-[#E7F5FF] rounded-lg p-3 inline-block">
                <div className="text-sm text-telegram-gray-600">{t('prize_pool')}</div>
                <div className="text-2xl font-bold text-[#0088CC] flex items-center justify-center">
                  <i className="fas fa-star text-yellow-400 mr-2"></i> {game?.prize_pool || 0}
                </div>
              </div>
            </div>

            <h3 className="text-lg font-semibold mb-3">{t('all_players')}</h3>
            
            <div className="bg-white rounded-xl shadow-sm border border-telegram-gray-200 mb-8">
              {sortedPlayers.map((player, index) => {
                const isCurrentUser = player.id === currentUserId;
                
                return (
                  <div 
                    key={player.id} 
                    className={cn(
                      "flex items-center p-3",
                      index < sortedPlayers.length - 1 ? "border-b border-telegram-gray-200" : ""
                    )}
                  >
                    <div className={`w-8 h-8 ${getPlaceStyle(index)} rounded-full flex items-center justify-center font-bold mr-3`}>
                      {index + 1}
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
                      <div className="text-xs text-telegram-gray-600">{player.taps || 0} {t('taps')}</div>
                    </div>
                    <div className={cn(
                      "font-bold flex items-center",
                      index === 0 ? "text-[#4CAF50]" : "text-telegram-gray-600"
                    )}>
                      {index === 0 ? (
                        <>
                          <i className="fas fa-star text-yellow-400 mr-1"></i> {game?.prize_pool || 0}
                        </>
                      ) : "-"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                className="bg-telegram-gray-200 text-telegram-gray-800 py-2.5 px-6 rounded-full text-sm font-medium"
                onClick={handleBackToLobby}
              >
                {t('back_to_lobby')}
              </button>
              <button 
                className="bg-[#0088CC] text-white py-2.5 px-6 rounded-full text-sm font-medium"
                onClick={handlePlayAgain}
              >
                {t('play_again')}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
