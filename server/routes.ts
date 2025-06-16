import { type Express, type Request, type Response } from "express";
import { createServer, type Server } from "http";
import { setupWebSocket } from "./websocket";

// Import controllers
import { registerStandardRoomRoutes } from "./controllers/standardRooms";
import { registerHeroRoomRoutes } from "./controllers/heroRooms";
import { registerUserRoutes } from "./controllers/users";
import { registerLeaderboardRoutes } from "./controllers/leaderboard";

export async function registerRoutes(app: Express): Promise<Server> {
  console.log("Setting up server...");

  // Create HTTP server
  const httpServer = createServer(app);
  console.log("HTTP server created");

  // Setup WebSocket server
  const wss = setupWebSocket(httpServer);
  console.log("WebSocket server setup complete");

  // API routes
  const apiPrefix = "/api/v1";

  // Get server time
  app.get(`${apiPrefix}/server-time`, (req: Request, res: Response) => {
    res.json({ serverTime: Date.now() });
  });

  // Register all route controllers
  registerUserRoutes(app, apiPrefix);
  registerStandardRoomRoutes(app, apiPrefix);
  registerHeroRoomRoutes(app, apiPrefix);
  registerLeaderboardRoutes(app, apiPrefix);

  console.log("All routes registered");

  return httpServer;
}
