import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface CountdownProps {
  value: number;
  max: number;
  className?: string;
  showTime?: boolean;
}

export function Countdown({ value, max, className, showTime = true }: CountdownProps) {
  // Рассчитываем процент оставшегося времени
  const percent = Math.round((value / max) * 100);
  
  // Форматируем время как MM:SS
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };
  
  return (
    <div className={cn("w-full space-y-2", className)}>
      {showTime && (
        <div className="flex justify-between items-center text-sm">
          <span>Осталось времени</span>
          <span className="font-mono">{formatTime(value)}</span>
        </div>
      )}
      <Progress 
        value={percent} 
        className={cn(
          "h-2", 
          percent <= 25 ? "bg-red-200" : percent <= 50 ? "bg-yellow-200" : "bg-green-200"
        )}
      />
    </div>
  );
}