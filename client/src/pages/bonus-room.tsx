import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { TapButton } from "@/components/game/TapButton";
import { ProgressBar } from "@/components/game/ProgressBar";
import { formatLongTime, formatNumber } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useTelegram } from "@/hooks/useTelegram";
import { showSuccess } from "@/lib/telegram";
import { useTranslation } from 'react-i18next';

export default function BonusRoomPage() {
  const [, navigate] = useLocation();
  const { triggerHapticFeedback } = useTelegram();
  const { t, i18n } = useTranslation();
  const [taps, setTaps] = useState(0);
  const [totalTaps, setTotalTaps] = useState(0);
  const [buffer, setBuffer] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [rewardEarned, setRewardEarned] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  
  // Референс для анимации
  const confettiRef = useRef<HTMLDivElement>(null);
  
  // Константы для бонусной игры
  const TOTAL_GOAL = 1000000; // 1 миллион тапов
  const TOTAL_TIME = 24 * 60 * 60; // 24 часа в секундах
  const REWARD_PER_100K = 10; // 10 звезд за каждые 100K тапов
  
  // Fetch bonus room data
  const { data, isLoading } = useQuery({
    queryKey: ['/api/v1/bonus/status'],
  });
  
  // Update bonus progress
  const { mutate: updateProgress } = useMutation({
    mutationFn: async (count: number) => {
      const response = await apiRequest('POST', '/api/v1/bonus/tap', { count });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bonus/status'] });
    }
  });
  
  // Start bonus challenge
  const { mutate: startBonus } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/v1/bonus/start');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/bonus/status'] });
      setIsActive(true);
      setTotalTaps(data.taps_so_far || 0);
      setRemainingTime(data.remaining_time || 24 * 60 * 60);
      setTaps(0);
    }
  });
  
  // Pause bonus challenge
  const { mutate: pauseBonus } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/v1/bonus/pause');
      return response.json();
    },
    onSuccess: () => {
      navigate('/');
    }
  });
  
  // Handle tap
  const handleTap = () => {
    if (!isActive) return;
    
    setTaps(prev => prev + 1);
    setTotalTaps(prev => prev + 1);
    setBuffer(prev => prev + 1);
  };
  
  // Update progress when buffer reaches threshold
  useEffect(() => {
    if (buffer >= 50) {
      updateProgress(buffer);
      setBuffer(0);
    }
  }, [buffer, updateProgress]);
  
  // Check if we need to format the number with commas
  useEffect(() => {
    if (data) {
      const bonusData = data.bonus;
      if (bonusData) {
        setIsActive(bonusData.active);
        setTotalTaps(bonusData.taps_so_far || 0);
        setRemainingTime(bonusData.remaining_time || 0);
      }
    }
  }, [data]);
  
  // Timer countdown
  useEffect(() => {
    if (!isActive || remainingTime <= 0) return;
    
    const timer = setInterval(() => {
      setRemainingTime(prev => Math.max(0, prev - 1));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [isActive, remainingTime]);
  
  // Генерация конфетти при достижении очередного рубежа
  const generateConfetti = () => {
    if (!confettiRef.current) return;
    
    const container = confettiRef.current;
    const confettiCount = 100;
    
    // Очищаем предыдущие конфетти
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    // Создаем новые конфетти
    for (let i = 0; i < confettiCount; i++) {
      const confetti = document.createElement('div');
      
      // Разные формы: круг, квадрат, звезда
      const shapes = ['circle', 'square', 'star'];
      const shape = shapes[Math.floor(Math.random() * shapes.length)];
      
      // Разные цвета
      const colors = ['#0088CC', '#FF9500', '#FFD60A', '#FF3B30', '#5856D6'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      // Параметры полета
      const left = Math.random() * 100;
      const size = Math.random() * 8 + 6;
      const duration = Math.random() * 3 + 3;
      const delay = Math.random() * 0.5;
      const rotation = Math.random() * 360;
      
      // Стили конфетти
      Object.assign(confetti.style, {
        position: 'absolute',
        backgroundColor: color,
        width: `${size}px`,
        height: `${size}px`,
        left: `${left}%`,
        top: '-20px',
        zIndex: '10',
        borderRadius: shape === 'circle' ? '50%' : shape === 'square' ? '0' : '0',
        clipPath: shape === 'star' ? 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' : 'none',
        transform: `rotate(${rotation}deg)`,
        animation: `fall ${duration}s ease-in ${delay}s forwards`
      });
      
      container.appendChild(confetti);
    }
    
    triggerHapticFeedback('medium');
    setShowConfetti(true);
    
    // Убираем конфетти через некоторое время
    setTimeout(() => {
      setShowConfetti(false);
    }, 5000);
  };
  
  // Проверка достижения рубежа и выдача наград
  useEffect(() => {
    // Каждые 100K тапов дается награда
    const milestone = Math.floor(totalTaps / 100000);
    const newReward = milestone * REWARD_PER_100K;
    
    if (newReward > rewardEarned && totalTaps > 0) {
      setRewardEarned(newReward);
      showSuccess(`+${REWARD_PER_100K} Stars Earned!`);
      generateConfetti();
    }
    
    // При достижении 1 миллиона
    if (totalTaps >= TOTAL_GOAL && isActive) {
      showSuccess(`Challenge Completed! +100 Stars Earned!`);
      generateConfetti();
      // Здесь можно добавить API запрос для завершения челленджа
      setTimeout(() => {
        navigate('/');
      }, 5000);
    }
  }, [totalTaps, rewardEarned, isActive, navigate, triggerHapticFeedback]);

  return (
    <>
      <Header title={t('bonus_room')} rightContent={
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
      
      <div className="p-6 text-center relative">
        {/* Контейнер для конфетти */}
        <div 
          ref={confettiRef} 
          className="absolute inset-0 overflow-hidden pointer-events-none"
        ></div>
        
        <div className="bg-[#E7F5FF] rounded-xl p-5 shadow-md mb-8">
          <h2 className="text-xl font-semibold text-[#0088CC] mb-3">{t('million_tap_challenge')}</h2>
          <p className="text-sm text-telegram-gray-700 mb-4">
            {t('tap_million_times')}
          </p>
          
          <ProgressBar
            value={totalTaps}
            max={1000000}
            label={t('progress')}
            labelValue={`${formatNumber(totalTaps)} / 1,000,000`}
            color="primary"
            height="medium"
            className="mb-4"
          />
          
          <div className="text-sm text-telegram-gray-700 mb-4">
            <i className="far fa-clock mr-1"></i> {t('time_remaining')}: <span className="font-medium">{formatLongTime(remainingTime)}</span>
          </div>
          
          <div className="text-sm text-[#0088CC] font-medium">
            <i className="fas fa-star text-yellow-400 mr-1"></i> 
            {t('earned_so_far')}: <span className="font-semibold">{rewardEarned}</span> Stars
            <span className="text-xs text-telegram-gray-500 block mt-1">
              ({t('you_get_stars')})
            </span>
          </div>
        </div>
        
        {/* Tap Button for Bonus Room */}
        <div className="mb-8">
          <TapButton 
            onTap={handleTap}
            disabled={!isActive}
            size="large"
            tapCount={taps}
          />
          <div className="text-center mt-4 text-4xl font-bold">
            {formatNumber(totalTaps)}
            {taps > 0 && <span className="text-sm text-green-500 ml-2">+{taps}</span>}
          </div>
        </div>
        
        {isActive ? (
          <button 
            className="bg-telegram-gray-200 text-telegram-gray-800 py-2.5 px-8 rounded-full text-sm font-medium"
            onClick={() => pauseBonus()}
          >
            {t('pause_challenge')}
          </button>
        ) : (
          <button 
            className="bg-[#0088CC] text-white py-2.5 px-8 rounded-full text-sm font-medium"
            onClick={() => startBonus()}
          >
            {t('start_challenge')}
          </button>
        )}
        
        {/* Стили для анимации конфетти */}
        <style>
          {`
            @keyframes fall {
              0% {
                transform: translateY(0) rotate(0deg);
                opacity: 1;
              }
              80% {
                opacity: 1;
              }
              100% {
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
              }
            }
          `}
        </style>
      </div>
    </>
  );
}
