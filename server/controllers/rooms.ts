import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { generateRoomCode } from "../utils/helpers";
import { jwtAuth } from "../utils/telegramAuth";
import { roomManager } from "../utils/roomManager";

// Room creation schema
const createStandardRoomSchema = z.object({
  entry_fee: z.string().transform(val => Number(val)).refine(val => val >= 10 && val <= 500),
  max_players: z.number().default(4)
});

// Create hero room schema
const createHeroRoomSchema = z.object({
  entry_fee: z.string().transform(val => Number(val)).refine(val => val >= 10 && val <= 1000),
  max_players: z.number().min(2).max(30),
  game_duration: z.number().min(30).max(180),
  waiting_time: z.number().min(30).max(600),
  status: z.enum(['waiting', 'active', 'finished']).default('active')
});

// Join room schema
const joinRoomSchema = z.object({
  room_id: z.string().uuid()
});

export function registerRoomRoutes(app: Express, prefix: string) {
  // Получить количество игроков по entry_fee для стандартных комнат (ПУБЛИЧНЫЙ МАРШРУТ ДОЛЖЕН БЫТЬ ПЕРВЫМ!)
  app.get(`${prefix}/rooms/standard-counts`, async (req: Request, res: Response) => {
    try {
      const rooms = await storage.getActiveRooms("standard", 100);
      // Агрегируем по entry_fee
      const counts: Record<number, number> = {};
      for (const room of rooms) {
        const fee = Number(room.entry_fee);
        const participants = await storage.getRoomParticipants(room.id);
        counts[fee] = (counts[fee] || 0) + participants.length;
      }
      res.json({ counts });
    } catch (error) {
      console.error("Error fetching room counts by entry_fee:", error);
      res.status(500).json({ message: "Failed to fetch room counts" });
    }
  });
  
  // Get all standard rooms
  app.get(`${prefix}/rooms`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const rooms = await storage.getActiveRooms("standard");
      
      // Get participant count for each room
      const roomsWithParticipants = await Promise.all(
        rooms.map(async (room) => {
          const participants = await storage.getRoomParticipants(room.id);
          return {
            ...room,
            participants_count: participants.length
          };
        })
      );
      
      res.json({ rooms: roomsWithParticipants });
    } catch (error) {
      console.error("Error fetching rooms:", error);
      res.status(500).json({ message: "Failed to fetch rooms" });
    }
  });
  
  // Get hero rooms
  app.get(`${prefix}/rooms/hero`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const rooms = await storage.getActiveRooms("hero");
      const userId = req.user!.id;
      
      // Get participant count and creator info for each room
      const roomsWithDetails = await Promise.all(
        rooms.map(async (room) => {
          const participants = await storage.getRoomParticipants(room.id);
          const creator = await storage.getUser(room.creator_id);
          
          return {
            ...room,
            participants_count: participants.length,
            creator: creator ? {
              id: creator.id,
              username: creator.username,
              photo_url: creator.photo_url
            } : null
          };
        })
      );
      
      // Get current user info
      const user = await storage.getUser(userId);
      
      res.json({ 
        rooms: roomsWithDetails,
        user: user ? {
          id: user.id,
          username: user.username,
          photo_url: user.photo_url
        } : null
      });
    } catch (error) {
      console.error("Error fetching hero rooms:", error);
      res.status(500).json({ message: "Failed to fetch hero rooms" });
    }
  });
  
  // Get a specific room
  app.get(`${prefix}/rooms/:roomId`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const room = await storage.getRoom(roomId);
      
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      // Get participants
      const participants = await storage.getRoomParticipants(roomId);
      const players = await Promise.all(
        participants.map(async (p) => {
          const user = await storage.getUser(p.user_id);
          return user ? {
            id: user.id,
            username: user.username,
            photo_url: user.photo_url
          } : null;
        })
      );
      
      // Filter out null values
      const validPlayers = players.filter(Boolean);
      
      res.json({
        room: {
          ...room,
          participants_count: participants.length
        },
        players: validPlayers,
        waitingTime: room.waiting_time || 60
      });
    } catch (error) {
      console.error("Error fetching room:", error);
      res.status(500).json({ message: "Failed to fetch room" });
    }
  });
  
  // Get hero room by code
  app.get(`${prefix}/rooms/hero/:code`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { code } = req.params;
      const room = await storage.getRoomByCode(code);
      
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      res.json({ room });
    } catch (error) {
      console.error("Error fetching hero room by code:", error);
      res.status(500).json({ message: "Failed to fetch hero room" });
    }
  });
  
  // Create a standard room
  app.post(`${prefix}/rooms/standard`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = createStandardRoomSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid room data", errors: validation.error.errors });
      }
      
      const { entry_fee, max_players } = validation.data;
      
      // Check if user has enough balance
      const user = await storage.getUser(userId);
      if (!user || Number(user.balance_stars) < Number(entry_fee)) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      
      // Create room
      const room = await storage.createRoom({
        id: uuidv4(),
        creator_id: userId,
        type: "standard",
        entry_fee: String(entry_fee),
        max_players,
        status: "waiting",
        waiting_time: 60,
        created_at: new Date()
      });
      
      // Add creator as first participant
      await storage.addParticipant({
        room_id: room.id,
        user_id: userId,
        joined_at: new Date(),
        is_observer: false,
        entry_fee: String(entry_fee)
      });
      
      // Deduct entry fee
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) - Number(entry_fee))
      });
      
      // Record transaction
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(-Number(entry_fee)),
        type: "entry",
        description: `Entry fee for standard room ${room.id}`,
        created_at: new Date()
      });
      
      res.status(201).json({ room });
    } catch (error) {
      console.error("Error creating standard room:", error);
      res.status(500).json({ message: "Failed to create room" });
    }
  });
  
  // Create a hero room
  app.post(`${prefix}/rooms/hero`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = createHeroRoomSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid room data", errors: validation.error.errors });
      }
      
      const { entry_fee, max_players, game_duration, waiting_time } = validation.data;
      
      // Check if user has enough balance for room creation
      const user = await storage.getUser(userId);
      if (!user || Number(user.balance_stars) < 50) {
        return res.status(400).json({ message: "Insufficient balance for room creation" });
      }

      // Generate a unique room code
      const code = generateRoomCode();
      
      // Create room
      const room = await storage.createRoom({
        id: uuidv4(),
        creator_id: userId,
        type: "hero",
        entry_fee: String(entry_fee),
        max_players,
        status: "waiting",
        code,
        waiting_time,
        duration: game_duration,
        created_at: new Date()
      });
      
      // Add creator as first participant
      await storage.addParticipant({
        room_id: room.id,
        user_id: userId,
        joined_at: new Date(),
        is_observer: false,
        entry_fee: String(entry_fee)
      });
      
      // Не списываем средства с организатора
      
      res.status(201).json({ room });
    } catch (error) {
      console.error("Error creating hero room:", error);
      res.status(500).json({ message: "Failed to create room" });
    }
  });
  
  // Join a room
  app.post(`${prefix}/rooms/:roomId/join`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      const { isObserver } = req.body;
      
      // Check if room exists and is in waiting state
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      if (room.status !== "waiting") {
        return res.status(400).json({ message: "Room is not in waiting state" });
      }
      
      // Check if user is already a participant
      const existingParticipant = await storage.getParticipant(roomId, userId);
      if (existingParticipant) {
        return res.json({ message: "Already joined this room" });
      }
      
      // Check if room is full (только если это не наблюдатель)
      const participants = await storage.getRoomParticipants(roomId);
      if (participants.length >= room.max_players && !isObserver) {
        return res.status(400).json({ message: "Room is full" });
      }
      
      // Проверяем баланс только если это не наблюдатель и не создатель hero-комнаты
      if (!isObserver && !(room.type === 'hero' && room.creator_id === userId)) {
        const user = await storage.getUser(userId);
        if (!user || Number(user.balance_stars) < Number(room.entry_fee)) {
          return res.status(400).json({ message: "Insufficient balance" });
        }
        
        // Deduct entry fee
        await storage.updateUser(userId, {
          balance_stars: String(Number(user.balance_stars) - Number(room.entry_fee))
        });
        
        // Record transaction
        await storage.createTransaction({
          id: uuidv4(),
          user_id: userId,
          amount: String(-Number(room.entry_fee)),
          type: "entry",
          description: `Entry fee for ${room.type} room ${room.code || roomId}`,
          created_at: new Date()
        });
      }
      
      // Add user as participant
      await storage.addParticipant({
        room_id: roomId,
        user_id: userId,
        joined_at: new Date(),
        is_observer: false,
        entry_fee: String(room.entry_fee)
      });
      
      // Check if room is now full to start the game (только если это не наблюдатель)
      const updatedParticipants = await storage.getRoomParticipants(roomId);
      if (updatedParticipants.length >= room.max_players && !isObserver) {
        await roomManager.startGame(roomId);
      }
      
      res.json({ message: "Successfully joined the room" });
    } catch (error) {
      console.error("Error joining room:", error);
      res.status(500).json({ message: "Failed to join room" });
    }
  });
  
  // Leave a room
  app.post(`${prefix}/rooms/:roomId/leave`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;
      
      // Check if room exists and is in waiting state
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      if (room.status !== "waiting") {
        return res.status(400).json({ message: "Cannot leave an active or finished room" });
      }
      
      // Check if user is a participant
      const existingParticipant = await storage.getParticipant(roomId, userId);
      if (!existingParticipant) {
        return res.status(400).json({ message: "Not a participant in this room" });
      }
      
      // Remove participant
      await storage.removeParticipant(roomId, userId);
      
      // If creator leaves, close the room
      if (room.creator_id === userId) {
        await storage.updateRoom(roomId, { status: "finished" });
        
        // Refund all participants
        const participants = await storage.getRoomParticipants(roomId);
        for (const participant of participants) {
          const user = await storage.getUser(participant.user_id);
          if (user) {
            // Refund entry fee
            await storage.updateUser(participant.user_id, {
              balance_stars: user.balance_stars + room.entry_fee
            });
            
            // Record refund transaction
            await storage.createTransaction({
              id: uuidv4(),
              user_id: participant.user_id,
              amount: room.entry_fee,
              type: "refund",
              description: `Refund for ${room.type} room ${room.code || roomId} (creator left)`,
              created_at: new Date()
            });
            
            // Remove participant
            await storage.removeParticipant(roomId, participant.user_id);
          }
        }
      } else {
        // Refund entry fee to leaving user if not the creator
        const user = await storage.getUser(userId);
        if (user) {
          await storage.updateUser(userId, {
            balance_stars: user.balance_stars + room.entry_fee
          });
          
          // Record refund transaction
          await storage.createTransaction({
            id: uuidv4(),
            user_id: userId,
            amount: room.entry_fee,
            type: "refund",
            description: `Refund for leaving ${room.type} room ${room.code || roomId}`,
            created_at: new Date()
          });
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error leaving room:", error);
      res.status(500).json({ message: "Failed to leave room" });
    }
  });
  
  // Автоподбор/создание комнаты по entry_fee
  app.post(`${prefix}/rooms/auto-join`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { entry_fee } = req.body;
      const userId = req.user?.id;

      console.log('Auto-join request:', { entry_fee, userId, body: req.body });

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!entry_fee) {
        return res.status(400).json({ error: 'Entry fee is required' });
      }

      // Проверяем баланс пользователя
      const user = await storage.getUser(userId);
      console.log('User data:', { user, entry_fee, balance: user?.balance_stars });

      if (!user || Number(user.balance_stars) < Number(entry_fee)) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Ищем подходящую комнату
      const activeRooms = await storage.getActiveRooms('standard');
      let room = activeRooms.find(r => 
        r.status === 'waiting' && 
        Number(r.entry_fee) === Number(entry_fee)
      );
      
      console.log('Found room:', { room, entry_fee });

      // Если комнаты нет, создаем новую
      if (!room) {
        room = await storage.createRoom({
          id: uuidv4(),
          creator_id: userId,
          type: 'standard',
          entry_fee: String(entry_fee),
          max_players: 10,
          status: 'waiting',
          waiting_time: 60,
          created_at: new Date()
        });
        console.log('Created new room:', { room, entry_fee });
      }

      // Добавляем участника
      await storage.addParticipant({
        room_id: room.id,
        user_id: userId,
        joined_at: new Date(),
        is_observer: false,
        entry_fee: String(entry_fee)
      });

      // Списываем звезды
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) - Number(entry_fee))
      });

      // Записываем транзакцию
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(-Number(entry_fee)),
        type: "entry",
        description: `Entry fee for standard room ${room.id}`,
        created_at: new Date()
      });

      res.json({ room });
    } catch (error) {
      console.error('Error in auto-join:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete a room
  app.delete(`${prefix}/rooms/:roomId`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { roomId } = req.params;
      const userId = req.user!.id;

      // Get room
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }

      // Check if user is the creator
      if (room.creator_id !== userId) {
        return res.status(403).json({ message: "Only room creator can delete the room" });
      }

      // Delete room
      await storage.deleteRoom(roomId);

      // Notify all participants through WebSocket
      const participants = await storage.getRoomParticipants(roomId);
      for (const participant of participants) {
        roomManager.notifyUser(participant.user_id, {
          type: 'room_deleted',
          reason: 'manual'
        });
      }

      res.json({ message: "Room deleted successfully" });
    } catch (error) {
      console.error("Error deleting room:", error);
      res.status(500).json({ message: "Failed to delete room" });
    }
  });
}
