import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { jwtAuth } from "../utils/telegramAuth";

export function registerLeaderboardRoutes(app: Express, prefix: string) {
  // Get today's leaderboard
  app.get(`${prefix}/leaderboard/today`, async (req: Request, res: Response) => {
    try {
      const leaderboard = await storage.getLeaderboard('today', 10);
      res.json({ leaderboard });
    } catch (error) {
      console.error("Error fetching today leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });
  
  // Get weekly leaderboard
  app.get(`${prefix}/leaderboard/week`, async (req: Request, res: Response) => {
    try {
      const leaderboard = await storage.getLeaderboard('week', 10);
      res.json({ leaderboard });
    } catch (error) {
      console.error("Error fetching weekly leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });
  
  // Get all-time leaderboard
  app.get(`${prefix}/leaderboard/alltime`, async (req: Request, res: Response) => {
    try {
      const leaderboard = await storage.getLeaderboard('alltime', 10);
      res.json({ leaderboard });
    } catch (error) {
      console.error("Error fetching all-time leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });
  
  // Get user's ranking (where they stand on the leaderboard)
  app.get(`${prefix}/leaderboard/me`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      
      // This would be more complex in a real app
      // Typically, you'd query the database to find the user's rank
      
      // For now, let's return a placeholder rank
      res.json({
        today: { rank: 0, total: 0 },
        week: { rank: 0, total: 0 },
        alltime: { rank: 0, total: 0 }
      });
    } catch (error) {
      console.error("Error fetching user ranking:", error);
      res.status(500).json({ message: "Failed to fetch user ranking" });
    }
  });
}
