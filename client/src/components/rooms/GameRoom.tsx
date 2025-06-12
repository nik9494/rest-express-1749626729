import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useWebSocket } from '@/lib/websocket';
import { useTelegram } from '@/hooks/useTelegram';
import { WsMessageType } from '@/lib/websocket';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface Player {
  id: string;
  username: string;
  photo_url?: string;
  taps?: number;
}

interface GameRoomProps {
  roomId: string;
}

export default function GameRoom() {
  const { roomId } = useParams<GameRoomProps>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { triggerHapticFeedback, triggerTapFeedback } = useTelegram();
  
  // Состояния игры
  const [players, setPlayers] = useState<Player[]>([]);
  const [room, setRoom] = useState<any>(null);
  const [gameState, setGameState] = useState<'waiting' | 'countdown' | 'playing' | 'finished'>('waiting');
  const [countdown, setCountdown] = useState<number>(3);
  const [gameTime, setGameTime] = useState<number>(60);
  const [tapCount, setTapCount] = useState<number>(0);
  const [playerScores, setPlayerScores] = useState<{[key: string]: number}>({});
  const [winner, setWinner] = useState<Player | null>(null);
  const [waitingTime, setWaitingTime] = useState<number>(60);
  
  const [userId, setUserId] = useState<string>('');
  const gameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const waitingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tapQueue = useRef<number>(0);
  const lastTapTime = useRef<number>(Date.now());
  
  // WebSocket подключение
  const { 
    connected, 
    joinRoom, 
    leaveRoom, 
    sendTap, 
    sendReaction,
    subscribe 
  } = useWebSocket();
  
  // Получение данных пользователя при монтировании
  useEffect(() => {
    fetch('/api/v1/users/me')
      .then(res => res.json())
      .then(data => {
        setUserId(data.user.id);
      })
      .catch(err => {
        console.error('Error fetching user data:', err);
        toast({
          title: 'Ошибка',
          description: 'Не удалось получить данные пользователя',
          variant: 'destructive',
        });
      });
      
    // Получение информации о комнате
    fetch(`/api/v1/rooms/${roomId}`)
      .then(res => res.json())
      .then(data => {
        setRoom(data.room);
        setGameTime(data.room.duration || 60);
        setWaitingTime(data.room.waiting_time || 60);
      })
      .catch(err => {
        console.error('Error fetching room data:', err);
        toast({
          title: 'Ошибка',
          description: 'Не удалось получить данные о комнате',
          variant: 'destructive',
        });
      });
      
    return () => {
      // Очистка интервалов при размонтировании
      if (gameIntervalRef.current) clearInterval(gameIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (waitingIntervalRef.current) clearInterval(waitingIntervalRef.current);
    };
  }, [roomId, toast]);
  
  // Подключение к комнате при получении userId
  useEffect(() => {
    if (userId && connected && roomId) {
      joinRoom(roomId, userId);
      
      // Отписка при размонтировании
      return () => {
        if (userId && roomId) {
          leaveRoom(roomId, userId);
        }
      };
    }
  }, [userId, connected, roomId, joinRoom, leaveRoom]);
  
  // Подписки на события WebSocket
  useEffect(() => {
    if (!connected) return;
    
    // Подписка на обновление комнаты
    const unsubRoom = subscribe(WsMessageType.ROOM_UPDATE, (message) => {
      if (message.room_id === roomId) {
        setRoom(message.data.room);
        setPlayers(message.data.players || []);
      }
    });
    
    // Подписка на присоединение игрока
    const unsubJoin = subscribe(WsMessageType.PLAYER_JOIN, (message) => {
      if (message.room_id === roomId) {
        setPlayers(prev => {
          // Проверяем, есть ли уже такой игрок
          const exists = prev.some(p => p.id === message.data.player.id);
          if (exists) return prev;
          return [...prev, message.data.player];
        });
        
        // Уведомление о новом игроке
        toast({
          title: 'Новый игрок',
          description: `${message.data.player.username} присоединился к игре`,
        });
      }
    });
    
    // Подписка на выход игрока
    const unsubLeave = subscribe(WsMessageType.PLAYER_LEAVE, (message) => {
      if (message.room_id === roomId) {
        setPlayers(prev => prev.filter(p => p.id !== message.user_id));
        
        // Уведомление о выходе игрока
        const leavingPlayer = players.find(p => p.id === message.user_id);
        if (leavingPlayer) {
          toast({
            title: 'Игрок вышел',
            description: `${leavingPlayer.username} покинул игру`,
          });
        }
      }
    });
    
    // Подписка на начало игры
    const unsubGameStart = subscribe(WsMessageType.GAME_START, (message) => {
      if (message.room_id === roomId) {
        // Начинаем обратный отсчет
        setGameState('countdown');
        setGameTime(message.data.duration || 60);
        startCountdown();
        
        // Оповещение о начале игры
        toast({
          title: 'Игра начинается!',
          description: 'Приготовьтесь к игре',
        });
        
        // Вибрация для уведомления
        triggerHapticFeedback('medium');
      }
    });
    
    // Подписка на окончание игры
    const unsubGameEnd = subscribe(WsMessageType.GAME_END, (message) => {
      if (message.room_id === roomId) {
        setGameState('finished');
        setWinner(message.data.winner);
        
        // Очистка интервала игры
        if (gameIntervalRef.current) {
          clearInterval(gameIntervalRef.current);
          gameIntervalRef.current = null;
        }
        
        // Оповещение о завершении игры
        toast({
          title: 'Игра завершена!',
          description: message.data.winner
            ? `Победитель: ${message.data.winner.username}`
            : 'Ничья!',
        });
        
        // Перенаправление на страницу результатов через 5 секунд
        setTimeout(() => {
          navigate(`/game-results/${message.game_id}`);
        }, 5000);
      }
    });
    
    // Подписка на нажатия игроков
    const unsubTap = subscribe(WsMessageType.TAP, (message) => {
      if (message.room_id === roomId) {
        setPlayerScores(prev => {
          const newScores = { ...prev };
          newScores[message.user_id!] = (newScores[message.user_id!] || 0) + message.data.count;
          return newScores;
        });
      }
    });
    
    // Подписка на реакции игроков
    const unsubReaction = subscribe(WsMessageType.PLAYER_REACTION, (message) => {
      if (message.room_id === roomId) {
        // Анимирование эмодзи-реакции
        const { to_user_id, reaction } = message.data;
        showReaction(to_user_id, reaction);
      }
    });
    
    return () => {
      // Отписка от всех событий при размонтировании
      unsubRoom();
      unsubJoin();
      unsubLeave();
      unsubGameStart();
      unsubGameEnd();
      unsubTap();
      unsubReaction();
    };
  }, [connected, roomId, players, subscribe, toast, triggerHapticFeedback, navigate]);
  
  // Функция отправки накопленных тапов
  useEffect(() => {
    const sendTapsInterval = setInterval(() => {
      if (gameState === 'playing' && tapQueue.current > 0) {
        // Отправляем только если есть что отправлять
        sendTap(roomId, userId, tapQueue.current);
        
        // Добавляем локально текущему игроку
        setPlayerScores(prev => {
          const newScores = { ...prev };
          newScores[userId] = (newScores[userId] || 0) + tapQueue.current;
          return newScores;
        });
        
        // Сбрасываем очередь
        tapQueue.current = 0;
      }
    }, 200); // Отправляем пакетами каждые 200 мс
    
    return () => clearInterval(sendTapsInterval);
  }, [gameState, roomId, userId, sendTap]);
  
  // Начало обратного отсчета перед игрой
  const startCountdown = () => {
    setCountdown(3);
    
    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          // Завершаем обратный отсчет и начинаем игру
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
          startGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  
  // Начало игры
  const startGame = () => {
    setGameState('playing');
    setTapCount(0);
    setPlayerScores({});
    
    gameIntervalRef.current = setInterval(() => {
      setGameTime(prev => {
        if (prev <= 1) {
          // Игра завершается по времени (на сервере тоже будет проверка)
          clearInterval(gameIntervalRef.current!);
          gameIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };
  
  // Обработка нажатия на кнопку тапа
  const handleTap = () => {
    if (gameState !== 'playing') return;
    
    // Увеличиваем локальный счетчик
    setTapCount(prev => prev + 1);
    
    // Добавляем в очередь для последующей отправки
    tapQueue.current += 1;
    
    // Вибрация для обратной связи
    triggerTapFeedback();
    
    // Анимация нажатия кнопки
    const tapButton = document.getElementById('tap-button');
    if (tapButton) {
      tapButton.classList.add('tap-animation');
      setTimeout(() => {
        tapButton.classList.remove('tap-animation');
      }, 100);
    }
    
    // Защита от слишком частых нажатий
    const now = Date.now();
    if (now - lastTapTime.current < 50) {
      return; // Игнорируем слишком частые нажатия (менее 50 мс)
    }
    lastTapTime.current = now;
  };
  
  // Функция отправки реакции другому игроку
  const handleReaction = (playerId: string) => {
    if (playerId === userId) return; // Не отправляем реакции самому себе
    
    sendReaction(roomId, userId, playerId, '');
    triggerHapticFeedback('light');
  };
  
  // Анимирование реакции (эмодзи)
  const showReaction = (toUserId: string, reaction: string) => {
    // Эмодзи, если реакция не указана
    const emoji = reaction || ['👍', '👎', '👌', '👏', '🔥', '💯', '❤️', '😊'][Math.floor(Math.random() * 8)];
    
    // Создаем элемент эмодзи
    const emojiEl = document.createElement('div');
    emojiEl.className = 'reaction-emoji';
    emojiEl.textContent = emoji;
    
    // Находим элемент игрока
    const playerEl = document.getElementById(`player-${toUserId}`);
    if (playerEl) {
      playerEl.appendChild(emojiEl);
      
      // Анимируем движение вверх и исчезновение
      setTimeout(() => {
        emojiEl.style.transform = 'translateY(-50px)';
        emojiEl.style.opacity = '0';
      }, 10);
      
      // Удаляем элемент после анимации
      setTimeout(() => {
        emojiEl.remove();
      }, 1000);
    }
  };
  
  // Отображение ожидания игроков
  if (gameState === 'waiting') {
    return (
      <div className="container max-w-md mx-auto px-4 py-8">
        <Card className="p-6 text-center">
          <h1 className="text-2xl font-bold mb-4">{room?.type === 'hero' ? 'Комната Героя' : 'Стандартная комната'}</h1>
          <div className="mb-4">
            <Badge variant="outline" className="text-lg mb-2">
              {room?.entry_fee} Stars
            </Badge>
            
            <p className="text-xl mb-4">
              Ожидаем игроков: {players.length} / {room?.max_players || 4}
            </p>
            
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
              <div className="bg-primary h-2.5 rounded-full" style={{ width: `${waitingTime / (room?.waiting_time || 60) * 100}%` }}></div>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center gap-4 mb-6">
            {players.map(player => (
              <div 
                key={player.id} 
                id={`player-${player.id}`}
                className="relative"
                onClick={() => handleReaction(player.id)}
              >
                <Avatar className="h-16 w-16 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                  <AvatarImage src={player.photo_url} alt={player.username} />
                  <AvatarFallback>{player.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <p className="text-sm mt-1 max-w-[70px] truncate">{player.username}</p>
              </div>
            ))}
          </div>
          
          <p className="text-sm text-muted-foreground mb-4">
            Нажмите на аватарку игрока, чтобы отправить реакцию
          </p>
          
          <Button 
            variant="outline" 
            onClick={() => navigate('/')}
          >
            Покинуть комнату
          </Button>
        </Card>
      </div>
    );
  }
  
  // Отображение обратного отсчета
  if (gameState === 'countdown') {
    return (
      <div className="container max-w-md mx-auto px-4 py-8 flex justify-center items-center h-[70vh]">
        <div className="text-center">
          <h1 className="text-7xl font-bold animate-bounce">{countdown}</h1>
          <p className="text-xl mt-4">Приготовьтесь!</p>
        </div>
      </div>
    );
  }
  
  // Отображение игрового процесса или результатов
  return (
    <div className="container max-w-md mx-auto px-4 py-4">
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">
          {gameState === 'finished' ? 'Игра завершена!' : 'Быстрее тапайте!'}
        </h1>
        <div className="text-xl font-mono">
          {String(Math.floor(gameTime / 60)).padStart(2, '0')}:{String(gameTime % 60).padStart(2, '0')}
        </div>
      </div>
      
      {/* Прогресс-бары игроков */}
      <div className="mb-6 space-y-3">
        {players.map(player => {
          const score = playerScores[player.id] || 0;
          const maxScore = Math.max(...Object.values(playerScores), 1);
          const percent = Math.min(Math.round((score / maxScore) * 100), 100);
          
          return (
            <div key={player.id} className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={player.photo_url} alt={player.username} />
                <AvatarFallback>{player.username.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex justify-between text-sm mb-1">
                  <span>{player.username}</span>
                  <span>{score} тапов</span>
                </div>
                <Progress value={percent} className="h-2" />
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Кнопка тапа */}
      {gameState === 'playing' && (
        <div className="flex justify-center mb-6">
          <button
            id="tap-button"
            onClick={handleTap}
            className="tap-button w-40 h-40 rounded-full bg-primary text-primary-foreground font-bold text-xl shadow-lg transform transition-transform active:scale-95"
          >
            TAP!
            <div className="mt-2 text-sm">{tapCount}</div>
          </button>
        </div>
      )}
      
      {/* Отображение результатов */}
      {gameState === 'finished' && (
        <div className="text-center p-4">
          {winner && (
            <>
              <h2 className="text-xl mb-2">Победитель:</h2>
              <div className="flex justify-center mb-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={winner.photo_url} alt={winner.username} />
                  <AvatarFallback>{winner.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
              </div>
              <p className="text-lg font-bold mb-1">{winner.username}</p>
              <p className="text-primary">{playerScores[winner.id] || 0} тапов</p>
              <p className="mt-2">Выигрыш: {room?.entry_fee * players.length} Stars</p>
            </>
          )}
          
          <p className="text-sm text-muted-foreground mt-4">
            Перенаправление на страницу результатов...
          </p>
        </div>
      )}
    </div>
  );
}

// CSS для анимаций
const style = document.createElement('style');
style.textContent = `
  .tap-button {
    background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%);
    box-shadow: 0 10px 15px -3px rgba(139, 92, 246, 0.4);
    position: relative;
    overflow: hidden;
  }
  
  .tap-button::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120%;
    height: 120%;
    transform: translate(-50%, -50%) scale(0);
    background: rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    opacity: 0;
  }
  
  .tap-animation::before {
    animation: ripple 0.6s linear;
  }
  
  @keyframes ripple {
    0% {
      opacity: 0.6;
      transform: translate(-50%, -50%) scale(0);
    }
    100% {
      opacity: 0;
      transform: translate(-50%, -50%) scale(1);
    }
  }
  
  .reaction-emoji {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    font-size: 24px;
    opacity: 1;
    transition: transform 1s ease-out, opacity 1s ease-out;
    pointer-events: none;
    z-index: 10;
  }
`;
document.head.appendChild(style);