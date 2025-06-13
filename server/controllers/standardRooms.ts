import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { jwtAuth } from "../utils/telegramAuth";
import { standardRoomManager } from "../utils/standardRoomManager";
import { broadcastRoomCountsUpdate } from "../websocket";

// Standard room creation schema
const createStandardRoomSchema = z.object({
  entry_fee: z
    .string()
    .transform((val) => Number(val))
    .refine((val) => val >= 10 && val <= 500),
  max_players: z.number().default(10),
});

// Join room schema
const joinRoomSchema = z.object({
  room_id: z.string().uuid(),
});

export function registerStandardRoomRoutes(app: Express, prefix: string) {
  // Get all standard rooms
  app.get(
    `${prefix}/standard-rooms`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const rooms = await storage.getActiveRooms("standard");

        // Get participant count for each room
        const roomsWithParticipants = await Promise.all(
          rooms.map(async (room) => {
            const participants = await storage.getRoomParticipants(room.id);
            return {
              ...room,
              participants_count: participants.length,
            };
          }),
        );

        res.json({ rooms: roomsWithParticipants });
      } catch (error) {
        console.error("Error fetching standard rooms:", error);
        res.status(500).json({ message: "Failed to fetch standard rooms" });
      }
    },
  );

  // Get standard room counts by entry fee (PUBLIC ROUTE)
  app.get(
    `${prefix}/standard-rooms/counts`,
    async (req: Request, res: Response) => {
      try {
        const rooms = await storage.getActiveRooms("standard", 100);
        // Aggregate by entry_fee
        const counts: Record<number, number> = {};
        for (const room of rooms) {
          const fee = Number(room.entry_fee);
          const participants = await storage.getRoomParticipants(room.id);
          counts[fee] = (counts[fee] || 0) + participants.length;
        }
        res.json({ counts });
      } catch (error) {
        console.error("Error fetching standard room counts:", error);
        res
          .status(500)
          .json({ message: "Failed to fetch standard room counts" });
      }
    },
  );

  // Get a specific standard room
  app.get(
    `${prefix}/standard-rooms/:roomId`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const room = await storage.getRoom(roomId);

        if (!room || room.type !== "standard") {
          return res.status(404).json({ message: "Standard room not found" });
        }

        // Get participants
        const participants = await storage.getRoomParticipants(roomId);
        const players = await Promise.all(
          participants.map(async (p) => {
            const user = await storage.getUser(p.user_id);
            return user
              ? {
                  id: user.id,
                  username: user.username,
                  photo_url: user.photo_url,
                  is_creator: user.id === room.creator_id,
                }
              : null;
          }),
        );

        // Filter out null values
        const validPlayers = players.filter(Boolean);

        res.json({
          room: {
            ...room,
            participants_count: participants.length,
          },
          players: validPlayers,
          waitingTime: room.waiting_time || 60,
        });
      } catch (error) {
        console.error("Error fetching standard room:", error);
        res.status(500).json({ message: "Failed to fetch standard room" });
      }
    },
  );

  // Create a standard room
  app.post(
    `${prefix}/standard-rooms`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const validation = createStandardRoomSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid room data",
            errors: validation.error.errors,
          });
        }

        const { entry_fee, max_players } = validation.data;

        // Check if user has enough balance
        const user = await storage.getUser(userId);
        if (!user || Number(user.balance_stars) < Number(entry_fee)) {
          return res.status(400).json({ message: "Insufficient balance" });
        }

        // Create room using standard room manager
        const roomId = await standardRoomManager.createRoom(
          userId,
          entry_fee,
          max_players,
        );
        const room = await storage.getRoom(roomId);

        res.status(201).json({ room });
      } catch (error) {
        console.error("Error creating standard room:", error);
        res.status(500).json({ message: "Failed to create standard room" });
      }
    },
  );

  // Join a standard room
  app.post(
    `${prefix}/standard-rooms/:roomId/join`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.user!.id;

        // Check if room exists and is standard type
        const room = await storage.getRoom(roomId);
        if (!room || room.type !== "standard") {
          return res.status(404).json({ message: "Standard room not found" });
        }

        if (room.status !== "waiting") {
          return res
            .status(400)
            .json({ message: "Room is not in waiting state" });
        }

        // Check if user is already a participant
        const existingParticipant = await storage.getParticipant(
          roomId,
          userId,
        );
        if (existingParticipant) {
          return res.json({ message: "Already joined this room" });
        }

        // Join room using standard room manager
        const success = await standardRoomManager.joinRoom(roomId, userId);

        if (!success) {
          return res.status(400).json({ message: "Failed to join room" });
        }

        res.json({ message: "Successfully joined the standard room" });
      } catch (error) {
        console.error("Error joining standard room:", error);
        res.status(500).json({ message: "Failed to join standard room" });
      }
    },
  );

  // Leave a standard room
  app.post(
    `${prefix}/standard-rooms/:roomId/leave`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.user!.id;

        // Check if room exists and is standard type
        const room = await storage.getRoom(roomId);
        if (!room || room.type !== "standard") {
          return res.status(404).json({ message: "Standard room not found" });
        }

        if (room.status !== "waiting") {
          return res
            .status(400)
            .json({ message: "Cannot leave an active or finished room" });
        }

        // Leave room using standard room manager
        const success = await standardRoomManager.leaveRoom(roomId, userId);

        if (!success) {
          return res.status(400).json({ message: "Failed to leave room" });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Error leaving standard room:", error);
        res.status(500).json({ message: "Failed to leave standard room" });
      }
    },
  );

  // Auto-join/create standard room by entry_fee
  app.post(
    `${prefix}/standard-rooms/auto-join`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { entry_fee } = req.body;
        const userId = req.user?.id;

        console.log("Standard room auto-join request:", { entry_fee, userId });

        if (!userId) {
          return res.status(401).json({ error: "Unauthorized" });
        }

        if (!entry_fee) {
          return res.status(400).json({ error: "Entry fee is required" });
        }

        // Check user balance
        const user = await storage.getUser(userId);
        if (!user || Number(user.balance_stars) < Number(entry_fee)) {
          return res.status(400).json({ error: "Insufficient balance" });
        }

        // Find or create room using standard room manager
        let roomId = await standardRoomManager.findAvailableRoom(
          Number(entry_fee),
        );

        if (!roomId) {
          // Create new room if none available
          roomId = await standardRoomManager.createRoom(
            userId,
            Number(entry_fee),
            10,
          );
        } else {
          // Join existing room
          const success = await standardRoomManager.joinRoom(roomId, userId);
          if (!success) {
            return res.status(400).json({ error: "Failed to join room" });
          }
        }

        const room = await storage.getRoom(roomId);
        res.json({ room });
      } catch (error) {
        console.error("Error in standard room auto-join:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
