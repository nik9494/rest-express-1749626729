import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { antiCheatService } from "./utils/antiCheat";
import { getRandomEmoji } from "./utils/helpers";
import {
  WebSocketMessageType,
  WebSocketMessage,
  Player,
  Room,
} from "../shared/types";

// Store active connections
interface Connection {
  userId: string;
  socket: WebSocket;
  roomIds: Set<string>;
  lastTapTime?: number;
  tapRate?: {
    count: number;
    startTime: number;
  };
}

// Connection management
const connections = new Map<string, Connection>();
const roomConnections = new Map<string, Set<string>>();
const homePageSubscribers = new Set<string>(); // пользователи, подписанные на обновления главной страницы

interface WebSocketClient extends WebSocket {
  userId?: string;
  roomId?: string;
}

let wss: WebSocketServer;

export function setupWebSocket(server: Server) {
  console.log("Setting up WebSocket server...");

  wss = new WebSocketServer({
    server,
    path: "/ws",
    clientTracking: true,
    perMessageDeflate: false,
    verifyClient: (info, callback) => {
      // Проверяем, не существует ли уже подключение для этого пользователя
      const token = info.req.url?.split("token=")[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
            user_id: string;
          };
          const existingConnection = connections.get(decoded.user_id);
          if (existingConnection?.socket.readyState === WebSocket.OPEN) {
            console.log(
              `User ${decoded.user_id} already has an active connection`,
            );
            callback(false);
            return;
          }
        } catch (error) {
          console.error("Token verification failed:", error);
          callback(false);
          return;
        }
      }
      callback(true);
    },
  });

  wss.on("connection", (ws: WebSocketClient, req) => {
    const token = req.url?.split("token=")[1];
    let userId: string | undefined;

    try {
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
          user_id: string;
        };
        userId = decoded.user_id;
        console.log(`New WebSocket connection for user ${userId}`);
      }
    } catch (error) {
      console.error("Failed to verify token:", error);
      ws.close();
      return;
    }

    ws.userId = userId;

    // Отправляем текущее время при подключении
    ws.send(
      JSON.stringify({
        type: "server_time",
        data: { serverTime: Date.now() },
        timestamp: Date.now(),
      }),
    );

    // Запускаем периодическую отправку времени (реже, но точнее)
    const timeInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(
            JSON.stringify({
              type: "server_time",
              data: { serverTime: Date.now() },
              timestamp: Date.now(),
            }),
          );
        } catch (error) {
          console.error("Error sending server time:", error);
        }
      }
    }, 5000); // Увеличиваем интервал до 5 секунд для снижения нагрузки

    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case WebSocketMessageType.JOIN_ROOM:
            await handleJoinRoom(ws, data);
            break;

          case WebSocketMessageType.LEAVE_ROOM:
            await handleLeaveRoom(ws, data);
            break;

          case WebSocketMessageType.TAP:
            await handleTap(ws, data);
            break;

          case WebSocketMessageType.PLAYER_REACTION:
            await handleReaction(ws, data);
            break;

          case WebSocketMessageType.SUBSCRIBE_HOME_UPDATES:
            await handleSubscribeHomeUpdates(ws, data);
            break;

          case WebSocketMessageType.UNSUBSCRIBE_HOME_UPDATES:
            await handleUnsubscribeHomeUpdates(ws, data);
            break;

          case WebSocketMessageType.TIMER_SYNC:
            await handleTimerSync(ws, data);
            break;

          default:
            console.error("Unknown message type:", data.type);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    });

    ws.on("close", () => {
      clearInterval(timeInterval);
      if (ws.userId) {
        handleDisconnect(ws.userId);
      }
      console.log(`WebSocket connection closed for user ${ws.userId}`);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error for user ${ws.userId}:`, error);
      clearInterval(timeInterval);
      if (ws.userId) {
        handleDisconnect(ws.userId);
      }
    });
  });

  return wss;
}

// Join room handler
async function handleJoinRoom(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id } = message;

  if (!user_id || !room_id) {
    return sendError(ws, "Missing user_id or room_id");
  }

  try {
    // Validate room exists
    const room = await storage.getRoom(room_id);
    if (!room) {
      return sendError(ws, "Room not found");
    }

    // Validate user exists
    const user = await storage.getUser(user_id);
    if (!user) {
      return sendError(ws, "User not found");
    }

    // Add connection
    if (!connections.has(user_id)) {
      connections.set(user_id, {
        userId: user_id,
        socket: ws,
        roomIds: new Set([room_id]),
        tapRate: {
          count: 0,
          startTime: Date.now(),
        },
      });
    } else {
      const connection = connections.get(user_id)!;
      connection.socket = ws; // Update socket if reconnecting
      connection.roomIds.add(room_id);
    }

    // Add user to room's connections
    if (!roomConnections.has(room_id)) {
      roomConnections.set(room_id, new Set([user_id]));
    } else {
      roomConnections.get(room_id)!.add(user_id);
    }

    // Get participants
    const participants = await storage.getRoomParticipants(room_id);
    const participantUsers = await Promise.all(
      participants.map((p) => storage.getUser(p.user_id)),
    );

    // Filter out undefined users
    const validUsers = participantUsers.filter(Boolean) as Player[];

    // Broadcast join to all room participants
    broadcastToRoom(room_id, {
      type: WebSocketMessageType.PLAYER_JOIN,
      room_id,
      user_id,
      data: {
        player: {
          id: user.id,
          username: user.username,
          photo_url: user.photo_url,
        },
      },
      timestamp: Date.now(),
    });

    // Send room data to the joining player
    sendMessage(ws, {
      type: WebSocketMessageType.ROOM_UPDATE,
      room_id,
      data: {
        room,
        players: validUsers.map((u) => ({
          id: u.id,
          username: u.username,
          photo_url: u.photo_url,
        })),
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error in handleJoinRoom:", error);
    sendError(ws, "Failed to join room");
  }
}

// Leave room handler
async function handleLeaveRoom(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id } = message;

  if (!user_id || !room_id) {
    return sendError(ws, "Missing user_id or room_id");
  }

  try {
    // Remove from connections
    const connection = connections.get(user_id);
    if (connection) {
      connection.roomIds.delete(room_id);
      if (connection.roomIds.size === 0) {
        connections.delete(user_id);
      }
    }

    // Remove from room connections
    const roomUsers = roomConnections.get(room_id);
    if (roomUsers) {
      roomUsers.delete(user_id);
      if (roomUsers.size === 0) {
        roomConnections.delete(room_id);
      }
    }

    // Broadcast leave to room
    broadcastToRoom(room_id, {
      type: WebSocketMessageType.PLAYER_LEAVE,
      room_id,
      user_id,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error in handleLeaveRoom:", error);
    sendError(ws, "Failed to leave room");
  }
}

// Tap handler
async function handleTap(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id } = message;

  if (!user_id || !room_id) {
    return sendError(ws, "Missing user_id or room_id");
  }

  try {
    const connection = connections.get(user_id);
    if (!connection) {
      return sendError(ws, "Not connected");
    }

    // Anti-cheat check
    const now = Date.now();
    if (!connection.lastTapTime) {
      connection.lastTapTime = now;
    }

    const timeSinceLastTap = now - connection.lastTapTime;
    if (timeSinceLastTap < 50) {
      // 50ms minimum between taps
      return sendError(ws, "Tap too fast");
    }

    // Update tap rate
    if (!connection.tapRate) {
      connection.tapRate = {
        count: 0,
        startTime: now,
      };
    }

    connection.tapRate.count++;
    connection.lastTapTime = now;

    // Исправлено: используем правильный метод античита
    const isSuspicious = await antiCheatService.checkForCheating({
      userId: user_id,
      gameId: room_id, // если нужен другой id игры, скорректируйте
      count: connection.tapRate.count,
      timestamp: now,
    });
    if (isSuspicious) {
      return sendError(ws, "Suspicious activity detected");
    }

    // Broadcast tap to room
    broadcastToRoom(room_id, {
      type: WebSocketMessageType.TAP,
      room_id,
      user_id,
      timestamp: now,
    });
  } catch (error) {
    console.error("Error in handleTap:", error);
    sendError(ws, "Failed to process tap");
  }
}

// Reaction handler
async function handleReaction(ws: WebSocket, message: WebSocketMessage) {
  const { user_id, room_id, data } = message;

  if (!user_id || !room_id || !data?.emoji) {
    return sendError(ws, "Missing required fields");
  }

  try {
    // Broadcast reaction to room
    broadcastToRoom(room_id, {
      type: WebSocketMessageType.PLAYER_REACTION,
      room_id,
      user_id,
      data: {
        emoji: data.emoji,
        target_id: data.target_id,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error in handleReaction:", error);
    sendError(ws, "Failed to process reaction");
  }
}

// Utility functions
function sendError(ws: WebSocket, message: string) {
  sendMessage(ws, {
    type: WebSocketMessageType.ERROR,
    data: { message },
    timestamp: Date.now(),
  });
}

function sendMessage(ws: WebSocket, message: WebSocketMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      const messageString = JSON.stringify(message);
      ws.send(messageString);
    } catch (error) {
      console.error("Error sending WebSocket message:", error);
    }
  }
}

function broadcastToRoom(roomId: string, message: WebSocketMessage) {
  const roomUsers = roomConnections.get(roomId);
  if (!roomUsers) return;

  const messageString = JSON.stringify(message);
  for (const userId of roomUsers) {
    const connection = connections.get(userId);
    if (connection?.socket.readyState === WebSocket.OPEN) {
      try {
        connection.socket.send(messageString);
      } catch (error) {
        console.error(`Error broadcasting to user ${userId}:`, error);
        // Remove failed connection
        connections.delete(userId);
        roomUsers.delete(userId);
      }
    }
  }
}

// Game event broadcasters
export function broadcastGameStart(roomId: string, game: any) {
  broadcastToRoom(roomId, {
    type: WebSocketMessageType.GAME_START,
    room_id: roomId,
    game_id: game.id,
    data: { game },
    timestamp: Date.now(),
  });
}

export function broadcastGameEnd(roomId: string, game: any, winner: any) {
  broadcastToRoom(roomId, {
    type: WebSocketMessageType.GAME_END,
    room_id: roomId,
    game_id: game.id,
    data: { game, winner },
    timestamp: Date.now(),
  });
}

export function broadcastRoomDeleted(
  roomId: string,
  reason: "timeout" | "manual" | "game_end" = "manual",
) {
  broadcastToRoom(roomId, {
    type: WebSocketMessageType.ROOM_DELETED,
    room_id: roomId,
    data: { reason },
    timestamp: Date.now(),
  });
}

// Подписка на обновления главной страницы
async function handleSubscribeHomeUpdates(
  ws: WebSocket,
  message: WebSocketMessage,
) {
  const { user_id } = message;

  if (!user_id) {
    return sendError(ws, "Missing user_id");
  }

  try {
    console.log(`🔔 User ${user_id} subscribed to home page updates`);
    homePageSubscribers.add(user_id);

    // Обновляем соединение для пользователя
    if (!connections.has(user_id)) {
      connections.set(user_id, {
        userId: user_id,
        socket: ws,
        roomIds: new Set(),
      });
    } else {
      const connection = connections.get(user_id)!;
      connection.socket = ws;
    }

    // Отправляем текущие счетчики при подписке
    const currentCounts = await getCurrentRoomCounts();
    console.log(
      `📊 Sending initial room counts to user ${user_id}:`,
      currentCounts,
    );

    sendMessage(ws, {
      type: WebSocketMessageType.ROOM_COUNTS_UPDATE,
      data: currentCounts,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("Error in handleSubscribeHomeUpdates:", error);
    sendError(ws, "Failed to subscribe to home updates");
  }
}

// Отписка от обновлений главной страницы
async function handleUnsubscribeHomeUpdates(
  ws: WebSocket,
  message: WebSocketMessage,
) {
  const { user_id } = message;

  if (!user_id) {
    return sendError(ws, "Missing user_id");
  }

  try {
    console.log(`User ${user_id} unsubscribed from home page updates`);
    homePageSubscribers.delete(user_id);
  } catch (error) {
    console.error("Error in handleUnsubscribeHomeUpdates:", error);
  }
}

// Обработчик синхронизации таймера
async function handleTimerSync(ws: WebSocket, message: WebSocketMessage) {
  const { room_id } = message;

  if (!room_id) {
    return sendError(ws, "Missing room_id");
  }

  try {
    // Получаем информацию о комнате
    const room = await storage.getRoom(room_id);
    if (!room) {
      return sendError(ws, "Room not found");
    }

    // Вычисляем данные таймера на основе типа комнаты и её состояния
    let timerData = null;
    const now = Date.now();

    if (room.status === "waiting" && room.created_at && room.waiting_time) {
      const createdTime = new Date(room.created_at).getTime();
      const waitingTimeMs = room.waiting_time * 1000;
      const endTime = createdTime + waitingTimeMs;

      if (now < endTime) {
        timerData = {
          startTime: createdTime,
          duration: room.waiting_time,
          endTime: endTime,
          type: "waiting",
        };
      }
    } else if (room.status === "active") {
      // Для активных игр получаем данные из активной игры
      const activeGame = await storage.getActiveGame(room_id);
      if (activeGame && activeGame.end_time) {
        const gameEndTime = new Date(activeGame.end_time).getTime();
        if (now < gameEndTime) {
          timerData = {
            startTime: new Date(activeGame.start_time).getTime(),
            duration: room.duration || 60,
            endTime: gameEndTime,
            type: "game",
          };
        }
      }
    }

    // Отправляем данные таймера
    if (timerData) {
      sendMessage(ws, {
        type: WebSocketMessageType.TIMER_SYNC,
        room_id,
        data: timerData,
        timestamp: now,
      });
    } else {
      // Таймер не активен
      sendMessage(ws, {
        type: WebSocketMessageType.TIMER_STOP,
        room_id,
        timestamp: now,
      });
    }
  } catch (error) {
    console.error("Error in handleTimerSync:", error);
    sendError(ws, "Failed to sync timer");
  }
}

// Широковещание синхронизации таймера для комнаты
export function broadcastTimerSync(roomId: string, timerData: any) {
  broadcastToRoom(roomId, {
    type: WebSocketMessageType.TIMER_SYNC,
    room_id: roomId,
    data: timerData,
    timestamp: Date.now(),
  });
}

// Широковещание остановки таймера для комнаты
export function broadcastTimerStop(roomId: string) {
  broadcastToRoom(roomId, {
    type: WebSocketMessageType.TIMER_STOP,
    room_id: roomId,
    timestamp: Date.now(),
  });
}

// Получение текущих счетчиков комнат
async function getCurrentRoomCounts() {
  try {
    // Получаем стандартные комнаты
    const standardRooms = await storage.getActiveRooms("standard", 100);
    const standardCounts: Record<number, number> = {};

    for (const room of standardRooms) {
      const fee = Number(room.entry_fee);
      const participants = await storage.getRoomParticipants(room.id);
      standardCounts[fee] = (standardCounts[fee] || 0) + participants.length;
    }

    // Получаем hero комнаты
    const heroRooms = await storage.getActiveRooms("hero", 100);
    const heroCounts: Record<string, number> = {};

    for (const room of heroRooms) {
      const participants = await storage.getRoomParticipants(room.id);
      heroCounts[room.id] = participants.length;
    }

    return {
      standard_counts: standardCounts,
      hero_counts: heroCounts,
    };
  } catch (error) {
    console.error("Error getting current room counts:", error);
    return {
      standard_counts: {},
      hero_counts: {},
    };
  }
}

// Широковещание обновлений счетчиков комнат
export async function broadcastRoomCountsUpdate() {
  try {
    if (homePageSubscribers.size === 0) {
      console.log("📡 No subscribers for room counts update");
      return; // Нет подписчиков
    }

    const currentCounts = await getCurrentRoomCounts();
    const message = {
      type: WebSocketMessageType.ROOM_COUNTS_UPDATE,
      data: currentCounts,
      timestamp: Date.now(),
    };

    console.log(
      `📡 Broadcasting room counts update to ${homePageSubscribers.size} subscribers:`,
      currentCounts,
    );

    // Отправляем всем подписчикам главной страницы
    const messageString = JSON.stringify(message);
    let successCount = 0;
    let failureCount = 0;

    for (const userId of homePageSubscribers) {
      const connection = connections.get(userId);
      if (connection?.socket.readyState === WebSocket.OPEN) {
        try {
          connection.socket.send(messageString);
          successCount++;
        } catch (error) {
          console.error(
            `❌ Error sending room counts update to user ${userId}:`,
            error,
          );
          // Удаляем неактивные подписки
          homePageSubscribers.delete(userId);
          connections.delete(userId);
          failureCount++;
        }
      } else {
        console.log(`🔌 Removing inactive subscriber: ${userId}`);
        // Удаляем неактивные подписки
        homePageSubscribers.delete(userId);
        failureCount++;
      }
    }

    console.log(
      `📊 Room counts broadcast result: ${successCount} success, ${failureCount} failures`,
    );
  } catch (error) {
    console.error("❌ Error broadcasting room counts update:", error);
  }
}

// Очистка подписчиков при отключении
async function handleDisconnect(userId: string) {
  try {
    const connection = connections.get(userId);
    if (!connection) return;

    // Удаляем из подписчиков главной страницы
    homePageSubscribers.delete(userId);

    // Leave all rooms
    for (const roomId of connection.roomIds) {
      const roomUsers = roomConnections.get(roomId);
      if (roomUsers) {
        roomUsers.delete(userId);
        if (roomUsers.size === 0) {
          roomConnections.delete(roomId);
        }
      }

      // Broadcast leave
      broadcastToRoom(roomId, {
        type: WebSocketMessageType.PLAYER_LEAVE,
        room_id: roomId,
        user_id: userId,
        timestamp: Date.now(),
      });
    }

    // Remove connection
    connections.delete(userId);
  } catch (error) {
    console.error("Error in handleDisconnect:", error);
  }
}
