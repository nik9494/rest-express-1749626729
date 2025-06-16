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
      const periods = ["today", "week", "alltime"] as const;
      const result: Record<string, { rank: number | null, total: number }> = {};

      for (const period of periods) {
        // Получаем весь список лидеров за период
        const leaderboard = await storage.getLeaderboard(period, 10000); // 10k - условный максимум
        const total = leaderboard.length;
        const userIndex = leaderboard.findIndex((entry: any) => entry.user_id === userId);
        result[period] = {
          rank: userIndex !== -1 ? userIndex + 1 : null,
          total
        };
      }

      res.json(result);
    } catch (error) {
      console.error("Error fetching user ranking:", error);
      res.status(500).json({ message: "Failed to fetch user ranking" });
    }
  });
}
