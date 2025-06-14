import { useState, useEffect, useCallback, useRef } from "react";
import { useWebSocket, WsMessageType, WebSocketMessage } from "@/lib/websocket";

/**
 * Унифицированный хук для синхронизации таймеров
 * Решает проблемы рассинхронизации между пользователями
 */

interface TimerSyncData {
  serverTime: number;
  roomId: string;
  timerType: "waiting" | "game";
  startTime: number;
  duration: number;
  endTime: number;
}

interface UseUnifiedTimerOptions {
  roomId?: string;
  timerType: "waiting" | "game";
  startTime?: number;
  duration?: number;
  onTimerEnd?: () => void;
  // Новые опции для тонкой настройки
  updateInterval?: number; // мс между обновлениями
  precisionThreshold?: number; // мс запаса для проверки истечения
}

export const useUnifiedTimer = ({
  roomId,
  timerType,
  startTime,
  duration,
  onTimerEnd,
  updateInterval = 100, // обновление каждые 100мс по умолчанию
  precisionThreshold = 500, // запас 500мс
}: UseUnifiedTimerOptions) => {
  const { connected, subscribe } = useWebSocket();

  // Состояние таймера
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [formattedTime, setFormattedTime] = useState<string>("0:00");
  const [isActive, setIsActive] = useState<boolean>(false);
  const [serverTimeOffset, setServerTimeOffset] = useState<number | null>(null);
  const [isTimerSynced, setIsTimerSynced] = useState<boolean>(false);

  // Refs для точного тайминга
  const animationFrameRef = useRef<number>();
  const intervalRef = useRef<NodeJS.Timeout>();
  const lastUpdateRef = useRef<number>(Date.now());
  const timerDataRef = useRef<TimerSyncData | null>(null);
  const rttHistoryRef = useRef<number[]>([]);
  const lastRemainingTimeRef = useRef<number>(0);
  const timerEndCalledRef = useRef<boolean>(false);

  // Форматирование времени
  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }, []);

  // Валидация данных таймера
  const validateTimerData = useCallback((data: any): boolean => {
    return (
      data &&
      typeof data.startTime === 'number' &&
      typeof data.duration === 'number' &&
      data.startTime > 0 &&
      data.duration > 0 &&
      !isNaN(data.startTime) &&
      !isNaN(data.duration)
    );
  }, []);

  // Вычисление среднего RTT для компенсации задержки
  const calculateAverageRTT = useCallback(() => {
    const history = rttHistoryRef.current;
    if (history.length === 0) return 0;

    // Используем медиану для более стабильного результата
    const sorted = [...history].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }, []);

  // Синхронизация с серверным временем
  const syncWithServer = useCallback(
    (serverTime: number) => {
      // Валидация серверного времени
      if (!serverTime || isNaN(serverTime) || serverTime <= 0) {
        console.warn('[Timer Sync] Invalid server time received:', serverTime);
        return;
      }

      const clientTime = Date.now();
      const requestTime = lastUpdateRef.current;
      const rtt = clientTime - requestTime;

      // Игнорируем аномально большие RTT (возможно сетевые проблемы)
      if (rtt > 5000) {
        console.warn('[Timer Sync] RTT too high, ignoring:', rtt);
        return;
      }

      // Сохраняем RTT для расчета среднего
      rttHistoryRef.current.push(rtt);
      if (rttHistoryRef.current.length > 20) { // Увеличено для лучшей точности
        rttHistoryRef.current.shift();
      }

      // Компенсируем половину RTT (время до сервера)
      const compensatedServerTime = serverTime + rtt / 2;
      const offset = compensatedServerTime - clientTime;

      setServerTimeOffset(offset);
      setIsTimerSynced(true);
      lastUpdateRef.current = clientTime;

      console.log(
        `[Timer Sync] RTT: ${rtt}ms, Offset: ${offset}ms, Avg RTT: ${calculateAverageRTT()}ms`,
      );
    },
    [calculateAverageRTT],
  );

  // Получение синхронизированного времени
  const getSyncedTime = useCallback(() => {
    if (serverTimeOffset === null) {
      return Date.now();
    }
    return Date.now() + serverTimeOffset;
  }, [serverTimeOffset]);

  // Вычисление оставшегося времени
  const calculateRemainingTime = useCallback(() => {
    if (!timerDataRef.current || !isActive) return 0;

    const now = getSyncedTime();
    const { endTime } = timerDataRef.current;
    const remaining = Math.max(0, endTime - now);

    // Используем Math.floor для более естественного обратного отсчета
    return Math.floor(remaining / 1000);
  }, [getSyncedTime, isActive]);

  // Очистка всех таймеров
  const clearAllTimers = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = undefined;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = undefined;
    }
  }, []);

  // Обновление таймера с оптимизированной частотой
  const updateTimer = useCallback(() => {
    if (!isActive || !timerDataRef.current) {
      clearAllTimers();
      return;
    }

    const newRemainingTime = calculateRemainingTime();

    // Обновляем состояние только при изменении (оптимизация)
    if (newRemainingTime !== lastRemainingTimeRef.current) {
      lastRemainingTimeRef.current = newRemainingTime;
      setRemainingTime(newRemainingTime);
      setFormattedTime(formatTime(newRemainingTime));
    }

    // Проверяем окончание таймера
    if (newRemainingTime <= 0 && !timerEndCalledRef.current) {
      const now = getSyncedTime();
      const { endTime } = timerDataRef.current;
      
      if (now >= endTime - precisionThreshold) {
        console.log(`[Timer] Time expired, calling onTimerEnd`);
        timerEndCalledRef.current = true;
        setIsActive(false);
        clearAllTimers();
        onTimerEnd?.();
        return;
      }
    }

    // Планируем следующее обновление
    animationFrameRef.current = requestAnimationFrame(updateTimer);
  }, [isActive, calculateRemainingTime, formatTime, onTimerEnd, getSyncedTime, clearAllTimers, precisionThreshold]);

  // Запуск таймера
  const startTimer = useCallback(
    (timerStartTime: number, timerDuration: number) => {
      // Валидация входных данных
      if (!validateTimerData({ startTime: timerStartTime, duration: timerDuration })) {
        console.error('[Timer] Invalid timer data:', { timerStartTime, timerDuration });
        return;
      }

      if (!connected) {
        console.log(`[Timer] Cannot start timer: WebSocket not connected`);
        return;
      }

      const now = getSyncedTime();
      const endTime = timerStartTime + timerDuration * 1000;

      // Проверяем, что время еще не истекло
      if (now >= endTime - precisionThreshold) {
        console.log(`[Timer] Cannot start timer: time already expired. Now: ${new Date(now).toISOString()}, End: ${new Date(endTime).toISOString()}`);
        return;
      }

      // Очищаем предыдущие таймеры
      clearAllTimers();
      timerEndCalledRef.current = false;

      timerDataRef.current = {
        serverTime: now,
        roomId: roomId || "",
        timerType,
        startTime: timerStartTime,
        duration: timerDuration,
        endTime,
      };

      setIsActive(true);
      
      // Сразу обновляем начальное состояние
      const initialRemaining = Math.floor((endTime - now) / 1000);
      lastRemainingTimeRef.current = initialRemaining;
      setRemainingTime(initialRemaining);
      setFormattedTime(formatTime(initialRemaining));

      console.log(
        `[Timer] Started: ${new Date(timerStartTime).toISOString()}, Duration: ${timerDuration}s, End: ${new Date(endTime).toISOString()}, Remaining: ${initialRemaining}s`,
      );

      // Запускаем обновление
      animationFrameRef.current = requestAnimationFrame(updateTimer);

      // Дополнительный интервал для надежности (fallback)
      intervalRef.current = setInterval(() => {
        if (!animationFrameRef.current && isActive) {
          animationFrameRef.current = requestAnimationFrame(updateTimer);
        }
      }, updateInterval);
    },
    [getSyncedTime, roomId, timerType, updateTimer, connected, formatTime, clearAllTimers, validateTimerData, precisionThreshold, updateInterval],
  );

  // Остановка таймера
  const stopTimer = useCallback(() => {
    setIsActive(false);
    timerDataRef.current = null;
    timerEndCalledRef.current = false;
    clearAllTimers();
  }, [clearAllTimers]);

  // Подписка на серверное время
  useEffect(() => {
    if (!connected) {
      console.log(`[Timer] WebSocket disconnected, stopping timer`);
      stopTimer();
      return;
    }

    const unsubscribe = subscribe(
      WsMessageType.SERVER_TIME,
      (message: WebSocketMessage) => {
        if (message.data?.serverTime) {
          syncWithServer(message.data.serverTime);
        }
      },
    );

    return unsubscribe;
  }, [connected, subscribe, syncWithServer, stopTimer]);

  // Подписка на события таймера комнаты
  useEffect(() => {
    if (!connected || !roomId) {
      console.log(`[Timer] Cannot subscribe to room timer: WebSocket not connected or no roomId`);
      return;
    }

    const unsubscribeTimerSync = subscribe(
      WsMessageType.TIMER_SYNC,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId && message.data) {
          const { startTime: msgStartTime, duration: msgDuration } = message.data;
          
          if (validateTimerData({ startTime: msgStartTime, duration: msgDuration })) {
            startTimer(msgStartTime, msgDuration);
          } else {
            console.warn('[Timer] Invalid timer sync data received:', message.data);
          }
        }
      },
    );

    const unsubscribeTimerStop = subscribe(
      WsMessageType.TIMER_STOP,
      (message: WebSocketMessage) => {
        if (message.room_id === roomId) {
          stopTimer();
        }
      },
    );

    return () => {
      unsubscribeTimerSync();
      unsubscribeTimerStop();
    };
  }, [connected, roomId, subscribe, startTimer, stopTimer, validateTimerData]);

  // Автоматический запуск таймера при наличии данных
  useEffect(() => {
    if (!connected || !startTime || !duration || isActive) {
      return;
    }

    if (!validateTimerData({ startTime, duration })) {
      console.error('[Timer] Invalid auto-start data:', { startTime, duration });
      return;
    }

    const now = getSyncedTime();
    const endTime = startTime + duration * 1000;

    console.log(
      `[Timer] Auto-start check: now=${new Date(now).toISOString()}, endTime=${new Date(endTime).toISOString()}, remaining=${endTime - now}ms`,
    );

    if (now < endTime - precisionThreshold) {
      startTimer(startTime, duration);
    } else {
      console.log(`[Timer] Timer already expired, not starting`);
    }
  }, [startTime, duration, isActive, startTimer, getSyncedTime, connected, validateTimerData, precisionThreshold]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Обработка восстановления соединения
  useEffect(() => {
    if (connected && isActive && timerDataRef.current && !timerEndCalledRef.current) {
      const remaining = calculateRemainingTime();
      if (remaining > 0) {
        // Возобновляем обновления после переподключения
        if (!animationFrameRef.current) {
          animationFrameRef.current = requestAnimationFrame(updateTimer);
        }
      } else {
        console.log('[Timer] Timer expired during disconnection');
        stopTimer();
        onTimerEnd?.();
      }
    }
  }, [connected, isActive, calculateRemainingTime, updateTimer, stopTimer, onTimerEnd]);

  return {
    remainingTime,
    formattedTime,
    isActive,
    serverTimeOffset,
    isTimerSynced,
    averageRTT: calculateAverageRTT(),
    startTimer,
    stopTimer,
    getSyncedTime,
    // Дополнительные утилиты для отладки
    debug: {
      timerData: timerDataRef.current,
      rttHistory: rttHistoryRef.current,
      connected,
    },
  };
};