import { useEffect, useRef, useState } from "react";
import { triggerTapFeedback } from "@/lib/telegram";

interface TapButtonProps {
  onTap: () => void;
  disabled?: boolean;
  size?: "medium" | "large";
  className?: string;
  tapCount?: number;
  children?: React.ReactNode;
}

export function TapButton({ 
  onTap, 
  disabled = false, 
  size = "large",
  className = "",
  tapCount = 0,
  children = "TAP"
}: TapButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [heatLevel, setHeatLevel] = useState(0);
  const [clickHistory, setClickHistory] = useState<number[]>([]);
  const maxHeatLevel = 3;
  const requiredClicksForLevel = [0, 20, 50, 100]; // Требуемое кол-во кликов для уровней
  const evaluationPeriod = 3000; // 3 секунды для оценки интенсивности

  // Обработка тапа
  const handleTap = () => {
    if (disabled) return;
    
    // Добавляем текущее время в историю кликов
    const now = Date.now();
    const newHistory = [...clickHistory, now].filter(time => now - time < evaluationPeriod);
    setClickHistory(newHistory);
    
    // Определяем уровень нагрева на основе количества кликов за период
    const newClickCount = newHistory.length;
    let newHeatLevel = 0;
    
    for (let i = maxHeatLevel; i > 0; i--) {
      if (newClickCount >= requiredClicksForLevel[i]) {
        newHeatLevel = i;
        break;
      }
    }
    
    setHeatLevel(newHeatLevel);
    
    // Создаем искры если уровень > 0
    if (newHeatLevel > 0 && buttonRef.current && containerRef.current) {
      createSpark(containerRef.current, newHeatLevel);
    }
    
    // Вибрация в Telegram
    triggerTapFeedback();
    
    // Вызываем обработчик тапа
    onTap();
  };
  
  // Функция для создания искры
  const createSpark = (container: HTMLElement, level: number) => {
    // Количество искр в зависимости от уровня нагрева
    const sparkCounts = [0, 3, 6, 10];
    const sparkCount = sparkCounts[level];
    
    const button = buttonRef.current;
    if (!button) return;
    
    // Получаем размеры и положение кнопки
    const rect = button.getBoundingClientRect();
    const buttonCenterX = rect.left + rect.width / 2;
    const buttonCenterY = rect.top + rect.height / 2;
    
    // Создаем искры
    for (let i = 0; i < sparkCount; i++) {
      // Создаем элемент искры
      const spark = document.createElement('div');
      spark.classList.add('spark');
      
      // Разные цвета искр в зависимости от уровня нагрева
      let sparkColors;
      if (level === 1) {
        sparkColors = ["#ffdd00", "#ffbb00", "#ff9900"];
      } else if (level === 2) {
        sparkColors = ["#ffbb00", "#ff9900", "#ff7700", "#ff5500"];
      } else {
        sparkColors = ["#ff9900", "#ff7700", "#ff5500", "#ff0000"];
      }
      
      // Случайный цвет из палитры
      const fillColor = sparkColors[Math.floor(Math.random() * sparkColors.length)];
      
      // Размер искры
      const size = 4 + Math.floor(Math.random() * 8);
      
      // Добавляем стили для искры
      Object.assign(spark.style, {
        position: 'absolute',
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: fillColor,
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: '5',
        boxShadow: `0 0 ${size/2}px ${fillColor}`,
        left: `${buttonCenterX - container.getBoundingClientRect().left}px`,
        top: `${buttonCenterY - container.getBoundingClientRect().top}px`,
      });
      
      // Добавляем искру в контейнер
      container.appendChild(spark);
      
      // Анимируем движение искры
      const angle = Math.random() * Math.PI * 2;
      const distance = 30 + Math.random() * 70;
      const duration = 400 + Math.random() * 600;
      
      const endX = buttonCenterX - container.getBoundingClientRect().left + Math.cos(angle) * distance;
      const endY = buttonCenterY - container.getBoundingClientRect().top + Math.sin(angle) * distance;
      
      // Используем Web Animation API для анимации
      spark.animate([
        { transform: 'scale(1)', opacity: 1 },
        { 
          transform: `translate(${endX - buttonCenterX}px, ${endY - buttonCenterY}px) scale(0)`, 
          opacity: 0 
        }
      ], {
        duration,
        easing: 'cubic-bezier(0.1, 0.9, 0.2, 1)',
        fill: 'forwards'
      }).onfinish = () => {
        spark.remove();
      };
    }
  };

  // Отключаем стандартные сенсорные действия на кнопке
  useEffect(() => {
    const button = buttonRef.current;
    if (button) {
      const handleTouchStart = (e: TouchEvent) => {
        e.preventDefault();
      };
      
      button.addEventListener('touchstart', handleTouchStart, { passive: false });
      
      return () => {
        button.removeEventListener('touchstart', handleTouchStart);
      };
    }
  }, []);
  
  // Охлаждение кнопки при отсутствии тапов
  useEffect(() => {
    const cooldownInterval = setInterval(() => {
      const now = Date.now();
      const activeTaps = clickHistory.filter(time => now - time < evaluationPeriod);
      
      setClickHistory(activeTaps);
      
      // Определяем новый уровень нагрева
      let newHeatLevel = 0;
      for (let i = maxHeatLevel; i > 0; i--) {
        if (activeTaps.length >= requiredClicksForLevel[i]) {
          newHeatLevel = i;
          break;
        }
      }
      
      setHeatLevel(newHeatLevel);
    }, 1000);
    
    return () => clearInterval(cooldownInterval);
  }, [clickHistory]);

  // Определяем размеры кнопки
  const buttonSize = size === 'large' ? 'w-[80px] h-[70px]' : 'w-[60px] h-[52px]';
  const containerSize = size === 'large' ? 'w-[200px] h-[200px]' : 'w-[150px] h-[150px]';

  return (
    <div 
      ref={containerRef}
      className={`relative ${containerSize} flex justify-center items-center ${className}`}
      style={{
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        WebkitUserSelect: 'none'
      }}
    >
      <button
        ref={buttonRef}
        onClick={!disabled ? handleTap : undefined}
        disabled={disabled}
        className={`
          relative ${buttonSize} outline-none border-none cursor-pointer
          ${heatLevel === 0 ? 'outline-[10px] solid rgba(255, 90, 120, 0.5)' : ''}
          ${heatLevel === 1 ? 'heat-level1' : ''}
          ${heatLevel === 2 ? 'heat-level2' : ''}
          ${heatLevel === 3 ? 'heat-level3' : ''}
          rounded-full
        `}
        style={{
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
          WebkitTouchCallout: 'none',
          transform: 'translateY(-15%)',
          transition: '.3s',
          userSelect: 'none',
          boxShadow: heatLevel === 1 ? '0 0 10px 4px rgba(255, 150, 120, 0.8)' :
                    heatLevel === 2 ? '0 0 20px 8px rgba(255, 120, 80, 0.8)' :
                    heatLevel === 3 ? '0 0 30px 12px rgba(255, 80, 40, 0.8)' : 'none'
        }}
      >
        <span
          className="back absolute inset-0 rounded-full pointer-events-none"
          style={{ 
            background: heatLevel === 0 ? 'rgb(150, 50, 60)' :
                      heatLevel === 1 ? 'rgb(var(--secondary, 150, 50, 60))' :
                      heatLevel === 2 ? 'rgb(255, 140, 50)' :
                      'rgb(255, 50, 50)',
            transition: 'background 0.5s'
          }}
        ></span>
        <span
          className="front absolute inset-0 rounded-full flex justify-center items-center text-lg font-semibold pointer-events-none"
          style={{ 
            background: heatLevel === 0 ? 'linear-gradient(0deg, rgba(255, 90, 120, 0.6) 20%, rgb(255, 90, 120) 50%)' :
                      heatLevel === 1 ? 'linear-gradient(0deg, rgba(var(--primary, 255, 90, 120), .6) 20%, rgba(var(--primary, 255, 90, 120)) 50%)' :
                      heatLevel === 2 ? 'linear-gradient(0deg, rgba(255, 140, 50, .6) 20%, rgba(255, 140, 50) 50%)' :
                      'linear-gradient(0deg, rgba(255, 50, 50, .6) 20%, rgba(255, 50, 50) 50%)',
            boxShadow: '0 .5em 1em -0.2em rgba(150, 50, 60, 0.5)',
            transform: 'translateY(-15%)',
            border: '1px solid rgb(150, 50, 60)',
            color: heatLevel === 0 ? 'rgb(150, 50, 60)' :
                   heatLevel === 1 ? 'rgb(var(--secondary, 150, 50, 60))' :
                   heatLevel === 2 ? 'rgb(180, 80, 30)' :
                   'rgb(180, 30, 30)',
            transition: '0.15s'
          }}
        >
          {children}
        </span>
      </button>
      
      {/* Стили для искр и уровней нагрева */}
      <style>
        {`
          button:active .front {
            transform: translateY(0%) !important;
            box-shadow: 0 0 !important;
          }
          
          @keyframes spark-fade {
            0% { opacity: 1; transform: scale(1); }
            100% { opacity: 0; transform: scale(0); }
          }
        `}
      </style>
    </div>
  );
}
