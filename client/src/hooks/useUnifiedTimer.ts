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
}

export const useUnifiedTimer = ({
  roomId,
  timerType,
  startTime,
  duration,
  onTimerEnd,
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
  const lastUpdateRef = useRef<number>(Date.now());
  const timerDataRef = useRef<TimerSyncData | null>(null);
  const rttHistoryRef = useRef<number[]>([]);

  // Форматирование времени
  const formatTime = useCallback((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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
      const clientTime = Date.now();
      const requestTime = lastUpdateRef.current;
      const rtt = clientTime - requestTime;

      // Сохраняем RTT для расчета среднего
      rttHistoryRef.current.push(rtt);
      if (rttHistoryRef.current.length > 10) {
        rttHistoryRef.current.shift(); // Оставляем только последние 10 измерений
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
    // Если синхронизация не выполнена, используем локальное время
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

    return Math.ceil(remaining / 1000); // Округляем вверх для более плавного отображения
  }, [getSyncedTime, isActive]);

  // Обновление таймера с оптимизированной частотой
  const updateTimer = useCallback(() => {
    if (!isActive || !timerDataRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const newRemainingTime = calculateRemainingTime();

    // Всегда обновляем состояние для гарантированного обновления UI
    setRemainingTime(newRemainingTime);
    setFormattedTime(formatTime(newRemainingTime));

    // Проверяем окончание таймера
    if (newRemainingTime <= 0) {
      const now = getSyncedTime();
      const { endTime } = timerDataRef.current;
      
      // Проверяем, действительно ли время истекло
      if (now >= endTime) {
        console.log(`[Timer] Time actually expired, calling onTimerEnd`);
        setIsActive(false);
        onTimerEnd?.();
      } else {
        console.log(`[Timer] Timer reached 0 but actual time not expired yet`);
      }
      return;
    }

    // Планируем следующее обновление с меньшей задержкой
    animationFrameRef.current = requestAnimationFrame(updateTimer);
  }, [isActive, calculateRemainingTime, formatTime, onTimerEnd, getSyncedTime]);

  // Запуск таймера
  const startTimer = useCallback(
    (timerStartTime: number, timerDuration: number) => {
      if (!connected) {
        console.log(`[Timer] Cannot start timer: WebSocket not connected`);
        return;
      }

      const now = getSyncedTime();
      const endTime = timerStartTime + timerDuration * 1000;

      // Проверяем, что время еще не истекло
      if (now >= endTime) {
        console.log(`[Timer] Cannot start timer: time already expired. Now: ${new Date(now).toISOString()}, End: ${new Date(endTime).toISOString()}`);
        return;
      }

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
      const initialRemaining = Math.ceil((endTime - now) / 1000);
      setRemainingTime(initialRemaining);
      setFormattedTime(formatTime(initialRemaining));

      console.log(
        `[Timer] Started: ${new Date(timerStartTime).toISOString()}, Duration: ${timerDuration}s, End: ${new Date(endTime).toISOString()}, wsConnected=${connected}, Remaining: ${initialRemaining}s`,
      );

      // Запускаем обновление
      animationFrameRef.current = requestAnimationFrame(updateTimer);
    },
    [getSyncedTime, roomId, timerType, updateTimer, connected, formatTime],
  );

  // Остановка таймера
  const stopTimer = useCallback(() => {
    setIsActive(false);
    timerDataRef.current = null;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

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
          const { startTime: msgStartTime, duration: msgDuration } =
            message.data;
          if (msgStartTime && msgDuration) {
            startTimer(msgStartTime, msgDuration);
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
  }, [connected, roomId, subscribe, startTimer, stopTimer]);

  // Автоматический запуск таймера при наличии данных (только если время еще не истекло)
  useEffect(() => {
    if (!connected) {
      console.log(`[Timer] Cannot auto-start timer: WebSocket not connected`);
      return;
    }

    if (startTime && duration && !isActive) {
      const now = getSyncedTime();
      const endTime = startTime + duration * 1000;

      console.log(
        `[Timer] Auto-start check: now=${new Date(now).toISOString()}, endTime=${new Date(endTime).toISOString()}, remaining=${endTime - now}ms, wsConnected=${connected}`,
      );

      // Запускаем таймер только если время еще не истекло (с запасом в 1 секунду)
      if (now < endTime - 1000) {
        startTimer(startTime, duration);
      } else {
        console.log(`[Timer] Timer already expired, not starting`);
      }
    }
  }, [startTime, duration, isActive, startTimer, getSyncedTime, connected]);

  // Очистка при размонтировании
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Обработка восстановления соединения
  useEffect(() => {
    if (connected && isActive && timerDataRef.current) {
      // Пересчитываем таймер после восстановления соединения
      const remaining = calculateRemainingTime();
      if (remaining > 0) {
        updateTimer(); // Возобновляем обновления
      } else {
        stopTimer(); // Таймер истек во время разрыва
        onTimerEnd?.();
      }
    }
  }, [
    connected,
    isActive,
    calculateRemainingTime,
    updateTimer,
    stopTimer,
    onTimerEnd,
  ]);

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
  };
};
