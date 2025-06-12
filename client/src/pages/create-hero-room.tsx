import { useState } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showError, showSuccess } from "@/lib/telegram";
import { useTranslation } from 'react-i18next';

export default function CreateHeroRoomPage() {
  const [, navigate] = useLocation();
  const [entryFee, setEntryFee] = useState(100);
  const [gameDuration, setGameDuration] = useState(60);
  const [waitingTime, setWaitingTime] = useState(300);
  const { t, i18n } = useTranslation();
  
  // Create a new hero room
  const { mutate: createRoom, isPending } = useMutation({
    mutationFn: async (roomData: any) => {
      const response = await apiRequest('POST', '/api/v1/hero-rooms', roomData);
      const data = await response.json();
      console.log('Room created:', data);
      return data;
    },
    onSuccess: (data) => {
      console.log('Navigating to room:', data.room.id);
      showSuccess(`Hero room created! Code: ${data.room.code}`);
      navigate(`/waiting-room/${data.room.id}`);
    },
    onError: (error) => {
      showError('Failed to create room: ' + (error as Error).message);
    }
  });
  
  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    createRoom({
      entry_fee: String(entryFee),
      max_players: 30,
      game_duration: gameDuration,
      waiting_time: waitingTime,
      status: 'waiting'
    });
  };
  
  return (
    <>
      <Header 
        title={t('create_hero_room')}
        showBackButton={true}
      />
      
      <div className="p-6 pb-24">
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label className="block text-sm font-medium text-telegram-gray-700 mb-1">{t('entry_fee')} (Stars)</label>
            <div className="relative">
              <input 
                type="number" 
                value={entryFee} 
                min={10} 
                max={1000} 
                className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg text-lg font-medium pl-9" 
                onChange={(e) => setEntryFee(parseInt(e.target.value) || 10)}
              />
              <i className="fas fa-star text-yellow-400 absolute left-3 top-1/2 transform -translate-y-1/2"></i>
            </div>
            <div className="text-xs text-telegram-gray-500 mt-1">
              {t('min_max_fee', { min: 10, max: 1000 })}
            </div>
          </div>
          
          <div className="mb-5">
            <label className="block text-sm font-medium text-telegram-gray-700 mb-1">{t('game_duration')}</label>
            <select 
              className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg"
              value={gameDuration}
              onChange={(e) => setGameDuration(parseInt(e.target.value))}
            >
              <option value={30}>30 {t('seconds')}</option>
              <option value={60}>60 {t('seconds')}</option>
              <option value={90}>90 {t('seconds')}</option>
              <option value={120}>2 {t('minutes')}</option>
              <option value={180}>3 {t('minutes')}</option>
            </select>
          </div>
          
          <div className="mb-7">
            <label className="block text-sm font-medium text-telegram-gray-700 mb-1">{t('waiting_time')}</label>
            <select 
              className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg"
              value={waitingTime}
              onChange={(e) => setWaitingTime(parseInt(e.target.value))}
            >
              <option value={60}>1 {t('minute')}</option>
              <option value={120}>2 {t('minutes')}</option>
              <option value={300}>5 {t('minutes')}</option>
              <option value={600}>10 {t('minutes')}</option>
            </select>
            <div className="text-xs text-telegram-gray-500 mt-1">
              {t('room_will_be_deleted')}
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded-lg mb-7">
            <h3 className="font-medium text-amber-800 mb-2">{t('room_info')}</h3>
            <ul className="text-sm text-amber-700 space-y-2">
              <li>• {t('min_players_info', { count: 2 })}</li>
              <li>• {t('max_players_info', { count: 30 })}</li>
              <li>• {t('winning_taps_info', { count: 200 })}</li>
              <li>• {t('prize_distribution_info')}</li>
            </ul>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button" 
              className="bg-telegram-gray-200 text-telegram-gray-800 py-2.5 px-6 rounded-full text-sm font-medium"
              onClick={() => navigate("/hero-room")}
              disabled={isPending}
            >
              {t('cancel')}
            </button>
            <button 
              type="submit" 
              className="bg-amber-500 text-white py-2.5 px-6 rounded-full text-sm font-medium"
              disabled={isPending}
            >
              {isPending ? t('creating') + '...' : t('create_room')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
