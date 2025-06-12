import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { v4 as uuidv4 } from "uuid";
import { jwtAuth } from "../utils/telegramAuth";
import { broadcastGameStart, broadcastGameEnd } from "../websocket";

export function registerGameRoutes(app: Express, prefix: string) {
  // Start a game (manually or automatically when room is full)
  app.post(`${prefix}/games/start`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { room_id } = req.body;
      
      if (!room_id) {
        return res.status(400).json({ message: "Room ID is required" });
      }
      
      // Check if room exists
      const room = await storage.getRoom(room_id);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      // Only creator can start game
      if (room.creator_id !== req.user!.id) {
        return res.status(403).json({ message: "Only the room creator can start the game" });
      }
      
      // Check if room is in waiting state
      if (room.status !== "waiting") {
        return res.status(400).json({ message: "Room is not in waiting state" });
      }
      
      // Get participants
      const participants = await storage.getRoomParticipants(room_id);
      if (participants.length < 2) {
        return res.status(400).json({ message: "At least 2 players are required to start a game" });
      }
      
      // Update room status
      await storage.updateRoom(room_id, { status: "active" });
      
      // Create game
      const game = await storage.createGame({
        id: uuidv4(),
        room_id,
        start_time: new Date(),
        prize_pool: room.entry_fee * participants.length,
        duration: room.duration || 60,
        created_at: new Date()
      });
      
      // Broadcast game start event
      broadcastGameStart(room_id, game);
      
      // Set a timer to end the game
      const duration = room.duration || 60;
      setTimeout(async () => {
        await endGame(game.id);
      }, duration * 1000);
      
      res.json({ success: true, game });
    } catch (error) {
      console.error("Error starting game:", error);
      res.status(500).json({ message: "Failed to start game" });
    }
  });
  
  // Get game data
  app.get(`${prefix}/games/:gameId`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      
      // Get game data
      const game = await storage.getGame(gameId);
      if (!game) {
        return res.status(404).json({ message: "Game not found" });
      }
      
      // Get room data
      const room = await storage.getRoom(game.room_id);
      if (!room) {
        return res.status(404).json({ message: "Room not found" });
      }
      
      // Get participants
      const participants = await storage.getRoomParticipants(room.id);
      
      // Get player data with tap counts
      const taps = await storage.getGameTaps(gameId);
      
      // Group taps by user
      const tapsByUser = new Map<string, number>();
      taps.forEach(tap => {
        const userId = tap.user_id;
        tapsByUser.set(userId, (tapsByUser.get(userId) || 0) + tap.count);
      });
      
      // Get user data for each participant
      const players = await Promise.all(
        participants.map(async (p) => {
          const user = await storage.getUser(p.user_id);
          if (!user) return null;
          
          return {
            id: user.id,
            username: user.username,
            photo_url: user.photo_url,
            taps: tapsByUser.get(user.id) || 0
          };
        })
      );
      
      // Filter out null values
      const validPlayers = players.filter(Boolean);
      
      // Determine winner (if game is ended)
      let winner = null;
      if (game.end_time && game.winner_id) {
        const winnerUser = await storage.getUser(game.winner_id);
        if (winnerUser) {
          winner = {
            id: winnerUser.id,
            username: winnerUser.username,
            photo_url: winnerUser.photo_url,
            taps: tapsByUser.get(winnerUser.id) || 0
          };
        }
      }
      
      res.json({
        game,
        room,
        players: validPlayers,
        winner
      });
    } catch (error) {
      console.error("Error fetching game:", error);
      res.status(500).json({ message: "Failed to fetch game data" });
    }
  });
  
  // End a game (internal function)
  async function endGame(gameId: string) {
    try {
      // Get game data
      const game = await storage.getGame(gameId);
      if (!game || game.end_time) {
        return; // Game already ended or not found
      }
      
      // Get room data
      const room = await storage.getRoom(game.room_id);
      if (!room) {
        return; // Room not found
      }
      
      // Get taps for this game
      const taps = await storage.getGameTaps(gameId);
      
      // Group taps by user
      const tapsByUser = new Map<string, number>();
      taps.forEach(tap => {
        const userId = tap.user_id;
        tapsByUser.set(userId, (tapsByUser.get(userId) || 0) + tap.count);
      });
      
      // Determine winner (user with most taps)
      let winnerId: string | null = null;
      let maxTaps = 0;
      
      tapsByUser.forEach((count, userId) => {
        if (count > maxTaps) {
          maxTaps = count;
          winnerId = userId;
        }
      });
      
      // Update game with end time and winner
      if (winnerId) {
        await storage.updateGame(gameId, {
          end_time: new Date(),
          winner_id: winnerId
        });
        
        // Update room status
        await storage.updateRoom(game.room_id, { status: "finished" });
        
        // Award prize to winner
        const winner = await storage.getUser(winnerId);
        if (winner) {
          // Award prize
          await storage.updateUser(winnerId, {
            balance_stars: winner.balance_stars + game.prize_pool
          });
          
          // Record transaction
          await storage.createTransaction({
            id: uuidv4(),
            user_id: winnerId,
            amount: game.prize_pool,
            type: "payout",
            description: `Won ${game.prize_pool} Stars in game ${gameId}`,
            created_at: new Date()
          });
          
          // Broadcast game end event
          broadcastGameEnd(game.room_id, game, {
            id: winner.id,
            username: winner.username,
            photo_url: winner.photo_url,
            taps: maxTaps
          });
        }
      }
    } catch (error) {
      console.error("Error ending game:", error);
    }
  }
  
  // Get user's game history
  app.get(`${prefix}/users/games`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // This would be more complex in a real app
      // For now, let's return an empty array
      res.json({ games: [] });
    } catch (error) {
      console.error("Error fetching game history:", error);
      res.status(500).json({ message: "Failed to fetch game history" });
    }
  });
  
  // Add bonus taps
  app.post(`${prefix}/bonus/tap`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const { count } = req.body;
      
      if (typeof count !== 'number' || count <= 0) {
        return res.status(400).json({ message: "Invalid tap count" });
      }
      
      // Get current bonus progress
      let bonusProgress = await storage.getBonusProgress(userId);
      
      // Create or update bonus progress
      if (!bonusProgress) {
        // Create new progress
        bonusProgress = await storage.createBonusProgress({
          id: uuidv4(),
          user_id: userId,
          taps_so_far: count,
          start_time: new Date(),
          end_time: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          completed: false
        });
      } else {
        const newTaps = bonusProgress.taps_so_far + count;
        const completed = newTaps >= 1000000; // 1 million taps goal
        
        // Update progress
        bonusProgress = await storage.updateBonusProgress(userId, {
          taps_so_far: newTaps,
          completed
        }) || bonusProgress;
        
        // If completed, award bonus
        if (completed && !bonusProgress.completed) {
          const user = await storage.getUser(userId);
          if (user) {
            // Award bonus
            await storage.updateUser(userId, {
              balance_stars: user.balance_stars + 100 // 100 star bonus
            });
            
            // Record transaction
            await storage.createTransaction({
              id: uuidv4(),
              user_id: userId,
              amount: 100,
              type: "bonus",
              description: "Completed 1 million taps challenge",
              created_at: new Date()
            });
          }
        }
      }
      
      res.json({
        success: true,
        progress: bonusProgress
      });
    } catch (error) {
      console.error("Error adding bonus taps:", error);
      res.status(500).json({ message: "Failed to add bonus taps" });
    }
  });
  
  // Start bonus challenge
  app.post(`${prefix}/bonus/start`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // Check if already has active bonus
      const existingBonus = await storage.getBonusProgress(userId);
      if (existingBonus && !existingBonus.completed && new Date(existingBonus.end_time) > new Date()) {
        return res.json({
          success: true,
          progress: existingBonus
        });
      }
      
      // Create new bonus progress
      const bonusProgress = await storage.createBonusProgress({
        id: uuidv4(),
        user_id: userId,
        taps_so_far: 0,
        start_time: new Date(),
        end_time: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        completed: false
      });
      
      res.json({
        success: true,
        progress: bonusProgress
      });
    } catch (error) {
      console.error("Error starting bonus challenge:", error);
      res.status(500).json({ message: "Failed to start bonus challenge" });
    }
  });
  
  // Get bonus status
  app.get(`${prefix}/bonus/status`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // Get bonus progress
      const bonusProgress = await storage.getBonusProgress(userId);
      
      // Calculate remaining time
      let remainingTime = 0;
      if (bonusProgress && !bonusProgress.completed) {
        const endTime = new Date(bonusProgress.end_time);
        const now = new Date();
        remainingTime = Math.max(0, Math.floor((endTime.getTime() - now.getTime()) / 1000));
      }
      
      res.json({
        bonus: bonusProgress ? {
          ...bonusProgress,
          active: !bonusProgress.completed && remainingTime > 0,
          remaining_time: remainingTime
        } : null
      });
    } catch (error) {
      console.error("Error getting bonus status:", error);
      res.status(500).json({ message: "Failed to get bonus status" });
    }
  });
  
  // Pause bonus challenge
  app.post(`${prefix}/bonus/pause`, jwtAuth, async (req: Request, res: Response) => {
    try {
      // This is just a convenience endpoint - we don't actually pause
      // since the progress is saved in the database
      res.json({ success: true });
    } catch (error) {
      console.error("Error pausing bonus challenge:", error);
      res.status(500).json({ message: "Failed to pause bonus challenge" });
    }
  });
}
