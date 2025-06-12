import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

// Типы сообщений
export enum WsMessageType {
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  TAP = 'tap',
  GAME_START = 'game_start',
  GAME_END = 'game_end',
  PLAYER_REACTION = 'player_reaction',
  PLAYER_JOIN = 'player_join',
  PLAYER_LEAVE = 'player_leave',
  ROOM_UPDATE = 'room_update',
  ROOM_DELETED = 'room_deleted',
  SERVER_TIME = 'server_time',
  ERROR = 'error'
}

// Интерфейс сообщения
export interface WebSocketMessage {
  type: WsMessageType;
  user_id?: string;
  room_id?: string;
  game_id?: string;
  data?: any;
  timestamp?: number;
}

// Тип обработчика событий
type MessageHandler = (message: WebSocketMessage) => void;

// Синглтон для WebSocket соединения
class WebSocketService {
  private socket: WebSocket | null = null;
  private subscribers: Map<WsMessageType, Set<MessageHandler>> = new Map();
  private connected: boolean = false;
  private isIntentionalClose: boolean = false;
  
  // Инициализация соединения
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        this.connected = this.socket.readyState === WebSocket.OPEN;
        resolve(this.connected);
        return;
      }
      
      // Определение URL для WebSocket
      const baseUrl = import.meta.env.VITE_BACKEND_WS_URL;
      
      console.log('Environment check:', {
        VITE_BACKEND_WS_URL: import.meta.env.VITE_BACKEND_WS_URL,
        VITE_BACKEND_URL: import.meta.env.VITE_BACKEND_URL,
        VITE_DEV_BACKEND_URL: import.meta.env.VITE_DEV_BACKEND_URL,
        NODE_ENV: import.meta.env.MODE,
        BASE_URL: import.meta.env.BASE_URL
      });
      
      if (!baseUrl) {
        console.error('WebSocket URL is not defined in environment variables');
        resolve(false);
        return;
      }
      
      try {
        const token = localStorage.getItem('token');
        const finalWsUrl = token ? `${baseUrl}?token=${token}` : baseUrl;
        console.log('Connecting to WebSocket:', finalWsUrl);
        
        this.socket = new WebSocket(finalWsUrl);
        
        this.socket.onopen = () => {
          console.log('WebSocket connection established');
          this.connected = true;
          resolve(true);
        };
        
        this.socket.onclose = (event) => {
          console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
          this.connected = false;
          resolve(false);
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          console.error('WebSocket state:', this.socket?.readyState);
          console.error('WebSocket URL:', finalWsUrl);
          resolve(false);
        };
        
        this.socket.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            console.log('Received WebSocket message:', message);
            
            if (message.type && this.subscribers.has(message.type)) {
              const handlers = this.subscribers.get(message.type);
              handlers?.forEach((handler) => {
                try {
                  handler(message);
                } catch (error) {
                  console.error('Error in message handler:', error);
                }
              });
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        resolve(false);
      }
    });
  }
  
  // Отправка сообщения
  send(message: WebSocketMessage) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('WebSocket не подключен');
      return false;
    }
    
    try {
      // Добавляем временную метку, если её нет
      if (!message.timestamp) {
        message.timestamp = Date.now();
      }
      
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Ошибка при отправке WebSocket сообщения:', error);
      return false;
    }

  }
  
  // Подписка на сообщения
  subscribe(type: WsMessageType, handler: MessageHandler) {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    this.subscribers.get(type)!.add(handler);
    
    return () => {
      const handlers = this.subscribers.get(type);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.subscribers.delete(type);
        }
      }
    };
  }
  
  // Закрытие соединения
  disconnect() {
    this.isIntentionalClose = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
  }
  
  // Проверка статуса соединения
  isConnected(): boolean {
    return this.connected;
  }
}

// Создаем экземпляр синглтона
const wsService = new WebSocketService();

// Хук для использования WebSocket в компонентах
export const useWebSocket = () => {
  const [connected, setConnected] = useState(false);
  const { toast } = useToast();
  
  // Инициализация соединения при монтировании компонента
  useEffect(() => {
    wsService.connect().then(connected => {
      setConnected(connected);
      
      if (!connected) {
        toast({
          title: 'Ошибка соединения',
          description: 'Не удалось подключиться к серверу. Попробуйте обновить страницу.',
          variant: 'destructive',
        });
      }
    });
    
    // Отключение при размонтировании
    return () => {
      // WebSocket соединение может использоваться другими компонентами,
      // поэтому не закрываем его здесь
    };
  }, [toast]);
  
  // Подписка на события
  const subscribe = useCallback((type: WsMessageType, handler: MessageHandler) => {
    return wsService.subscribe(type, handler);
  }, []);
  
  // Присоединение к комнате
  const joinRoom = useCallback((roomId: string, userId: string) => {
    return wsService.send({
      type: WsMessageType.JOIN_ROOM,
      room_id: roomId,
      user_id: userId
    });
  }, []);
  
  // Покидание комнаты
  const leaveRoom = useCallback((roomId: string, userId: string) => {
    return wsService.send({
      type: WsMessageType.LEAVE_ROOM,
      room_id: roomId,
      user_id: userId
    });
  }, []);
  
  // Отправка тапа
  const sendTap = useCallback((roomId: string, userId: string, count: number) => {
    return wsService.send({
      type: WsMessageType.TAP,
      room_id: roomId,
      user_id: userId,
      data: { count }
    });
  }, []);
  
  // Отправка реакции
  const sendReaction = useCallback((roomId: string, userId: string, toUserId: string, reaction: string) => {
    return wsService.send({
      type: WsMessageType.PLAYER_REACTION,
      room_id: roomId,
      user_id: userId,
      data: { to_user_id: toUserId, reaction }
    });
  }, []);
  
  return {
    connected,
    subscribe,
    joinRoom,
    leaveRoom,
    sendTap,
    sendReaction
  };
};