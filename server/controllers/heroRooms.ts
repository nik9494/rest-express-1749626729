import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { jwtAuth } from "../utils/telegramAuth";
import { heroRoomManager } from "../utils/heroRoomManager";

// Hero room creation schema
const createHeroRoomSchema = z.object({
  entry_fee: z
    .string()
    .transform((val) => Number(val))
    .refine((val) => val >= 10 && val <= 1000),
  max_players: z.number().min(2).max(30),
  game_duration: z.number().min(30).max(180),
  waiting_time: z.number().min(30).max(600),
});

export function registerHeroRoomRoutes(app: Express, prefix: string) {
  // Get all hero rooms
  app.get(
    `${prefix}/hero-rooms`,
    jwtAuth,
    async (req: Request, res: Response) => {
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
              creator: creator
                ? {
                    id: creator.id,
                    username: creator.username,
                    photo_url: creator.photo_url,
                  }
                : null,
            };
          }),
        );

        // Get current user info
        const user = await storage.getUser(userId);

        res.json({
          rooms: roomsWithDetails,
          user: user
            ? {
                id: user.id,
                username: user.username,
                photo_url: user.photo_url,
              }
            : null,
        });
      } catch (error) {
        console.error("Error fetching hero rooms:", error);
        res.status(500).json({ message: "Failed to fetch hero rooms" });
      }
    },
  );

  // Get a specific hero room
  app.get(
    `${prefix}/hero-rooms/:roomId`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const room = await storage.getRoom(roomId);

        if (!room || room.type !== "hero") {
          return res.status(404).json({ message: "Hero room not found" });
        }

        // Get participants (excluding organizer who is observer)
        const participants = await storage.getRoomParticipants(roomId);
        const players = await Promise.all(
          participants.map(async (p) => {
            const user = await storage.getUser(p.user_id);
            return user
              ? {
                  id: user.id,
                  username: user.username,
                  photo_url: user.photo_url,
                  is_observer: p.is_observer || user.id === room.creator_id,
                  is_organizer: user.id === room.creator_id,
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
            created_at: room.created_at,
            waiting_time: room.waiting_time || 300,
          },
          players: validPlayers,
          waitingTime: room.waiting_time || 300,
        });
      } catch (error) {
        console.error("Error fetching hero room:", error);
        res.status(500).json({ message: "Failed to fetch hero room" });
      }
    },
  );

  // Get hero room by code
  app.get(
    `${prefix}/hero-rooms/code/:code`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { code } = req.params;
        const room = await storage.getRoomByCode(code);

        if (!room || room.type !== "hero") {
          return res.status(404).json({ message: "Hero room not found" });
        }

        res.json({ room });
      } catch (error) {
        console.error("Error fetching hero room by code:", error);
        res.status(500).json({ message: "Failed to fetch hero room" });
      }
    },
  );

  // Create a hero room
  app.post(
    `${prefix}/hero-rooms`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const validation = createHeroRoomSchema.safeParse(req.body);

        if (!validation.success) {
          return res.status(400).json({
            message: "Invalid room data",
            errors: validation.error.errors,
          });
        }

        const { entry_fee, max_players, game_duration, waiting_time } =
          validation.data;

        // Check if user has enough balance for room creation (50 stars minimum)
        const user = await storage.getUser(userId);
        if (!user || Number(user.balance_stars) < 50) {
          return res.status(400).json({
            message:
              "Insufficient balance for room creation (minimum 50 stars required)",
          });
        }

        // Create room using hero room manager
        const roomId = await heroRoomManager.createRoom(
          userId,
          entry_fee,
          max_players,
          game_duration,
          waiting_time,
        );

        const room = await storage.getRoom(roomId);

        res.status(201).json({ room });
      } catch (error) {
        console.error("Error creating hero room:", error);
        res.status(500).json({ message: "Failed to create hero room" });
      }
    },
  );

  // Join a hero room (as player, not observer)
  app.post(
    `${prefix}/hero-rooms/:roomId/join`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.user!.id;

        // Check if room exists and is hero type
        const room = await storage.getRoom(roomId);
        if (!room || room.type !== "hero") {
          return res.status(404).json({ message: "Hero room not found" });
        }

        if (room.status !== "waiting") {
          return res
            .status(400)
            .json({ message: "Room is not in waiting state" });
        }

        // Organizer is automatically an observer and cannot join as player
        if (room.creator_id === userId) {
          return res
            .status(400)
            .json({
              message:
                "Organizer is already an observer and cannot join as player",
            });
        }

        // Check if user is already a participant
        const existingParticipant = await storage.getParticipant(
          roomId,
          userId,
        );
        if (existingParticipant) {
          return res.json({ message: "Already joined this room" });
        }

        // Join room using hero room manager (as player, not observer)
        const success = await heroRoomManager.joinRoom(roomId, userId, false);

        if (!success) {
          return res.status(400).json({ message: "Failed to join room" });
        }

        res.json({ message: "Successfully joined the hero room as player" });
      } catch (error) {
        console.error("Error joining hero room:", error);
        res.status(500).json({ message: "Failed to join hero room" });
      }
    },
  );

  // Join a hero room as observer
  app.post(
    `${prefix}/hero-rooms/:roomId/observe`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.user!.id;

        // Check if room exists and is hero type
        const room = await storage.getRoom(roomId);
        if (!room || room.type !== "hero") {
          return res.status(404).json({ message: "Hero room not found" });
        }

        // Check if user is already a participant
        const existingParticipant = await storage.getParticipant(
          roomId,
          userId,
        );
        if (existingParticipant) {
          return res.json({ message: "Already joined this room" });
        }

        // Add creator as OBSERVER (организатор Hero-комнаты не может играть!)
        await storage.addParticipant({
          room_id: roomId,
          user_id: userId,
          joined_at: new Date(),
          is_observer: true, // КРИТИЧЕСКИ ВАЖНО: организатор = наблюдатель!
          entry_fee: "0", // Организатор не платит
        });

        res.json({ message: "Successfully joined the hero room as observer" });
      } catch (error) {
        console.error("Error joining hero room as observer:", error);
        res
          .status(500)
          .json({ message: "Failed to join hero room as observer" });
      }
    },
  );

  // Start hero room game (organizer only)
  app.post(
    `${prefix}/hero-rooms/:roomId/start`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.user!.id;

        // Check if room exists and is hero type
        const room = await storage.getRoom(roomId);
        if (!room || room.type !== "hero") {
          return res.status(404).json({ message: "Hero room not found" });
        }

        // Only organizer can start the game
        if (room.creator_id !== userId) {
          return res
            .status(403)
            .json({ message: "Only organizer can start the game" });
        }

        if (room.status !== "waiting") {
          return res
            .status(400)
            .json({ message: "Room is not in waiting state" });
        }

        // Start game using hero room manager
        await heroRoomManager.startGame(roomId);

        res.json({ message: "Game started successfully" });
      } catch (error) {
        console.error("Error starting hero room game:", error);
        res.status(500).json({ message: "Failed to start hero room game" });
      }
    },
  );

  // Delete hero room (organizer only)
  app.delete(
    `${prefix}/hero-rooms/:roomId`,
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const { roomId } = req.params;
        const userId = req.user!.id;

        // Get room
        const room = await storage.getRoom(roomId);
        if (!room || room.type !== "hero") {
          return res.status(404).json({ message: "Hero room not found" });
        }

        // Check if user is the organizer
        if (room.creator_id !== userId) {
          return res
            .status(403)
            .json({ message: "Only organizer can delete the room" });
        }

        // Delete room using hero room manager
        const success = await heroRoomManager.deleteRoom(roomId);

        if (!success) {
          return res.status(500).json({ message: "Failed to delete room" });
        }

        res.json({ message: "Hero room deleted successfully" });
      } catch (error) {
        console.error("Error deleting hero room:", error);
        res.status(500).json({ message: "Failed to delete hero room" });
      }
    },
  );
}
