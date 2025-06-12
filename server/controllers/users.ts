import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { validateTelegramAuth, jwtAuth } from "../utils/telegramAuth";
import { generateReferralCode } from "../utils/helpers";
import jwt from 'jsonwebtoken';
// User creation schema
const userSchema = z.object({
  telegram_id: z.number(),
  username: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  photo_url: z.string().optional()
});

// Wallet connection schema
const walletSchema = z.object({
  ton_address: z.string()
});

// Add stars schema (simulated payment)
const addStarsSchema = z.object({
  amount: z.number().min(10).max(10000)
});

// Referral code application schema
const applyReferralSchema = z.object({
  code: z.string().min(4).max(10)
});

// Генерация и сохранение уникального кода с защитой от гонок
async function createUniqueReferral(userId: string): Promise<string> {
  let code: string;
  while (true) {
    code = generateReferralCode();
    try {
      await storage.createReferral({
        code,
        user_id: userId,
        bonus_amount: '10',
        created_at: new Date(),
      });
      break;
    } catch (err: any) {
      // Если ошибка уникальности (23505), пробуем снова
      if (err.code !== '23505') throw err;
    }
  }
  // После успешного создания referral обновляем пользователя
  await storage.updateUser(userId, { referral_code: code });
  return code;
}

export function registerUserRoutes(app: Express, prefix: string) {
  // Telegram authentication
  app.post(`${prefix}/auth/telegram`, async (req: Request, res: Response) => {
    try {
      const { telegramData, referralCode } = req.body;
      const userData = validateTelegramAuth(telegramData);
      if (!userData) {
        return res.status(401).json({ message: "Invalid Telegram authentication" });
      }
      const { id: telegram_id, username, first_name, photo_url } = userData;
      let user = await storage.getOrCreateUserByTelegramId(
        telegram_id,
        username || `${first_name || "User"}${telegram_id.toString().slice(-4)}`,
        {
          id: uuidv4(),
          balance_stars: '100',
          has_ton_wallet: false,
          photo_url,
          created_at: new Date(),
        }
      );
      // Новый пользователь, если нет referral_code
      let isNew = !user.referral_code;
      // Если новый и пришёл referralCode — применяем его
      if (isNew && referralCode) {
        const ref = await storage.getReferral(referralCode);
        if (ref && ref.user_id !== user.id) {
          await storage.createReferralUse({
            id: uuidv4(),
            code: referralCode,
            referred_user: user.id,
            used_at: new Date(),
          });
          const refUser = await storage.getUser(ref.user_id);
          if (refUser) {
            await storage.updateUser(ref.user_id, {
              balance_stars: String(Number(ref.bonus_amount) + Number(refUser.balance_stars))
            });
            await storage.createTransaction({
              id: uuidv4(),
              user_id: ref.user_id,
              amount: ref.bonus_amount,
              type: 'referral',
              description: `Referral bonus from ${user.username}`,
              created_at: new Date(),
            });
          }
        }
      }
      // --- Логика создания referral_code ---
      let referral_code = user.referral_code;
      if (!referral_code) {
        referral_code = await createUniqueReferral(user.id);
        // Обновляем только referral_code, не весь user
      }
      // --- JWT генерация ---
      const token = jwt.sign(
        { user_id: user.id, telegram_id: user.telegram_id },
        process.env.JWT_SECRET || 'ytreewddsfgg34532hyjklldseeew3322aw',
        { expiresIn: '30d' }
      );
      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          balance_stars: user.balance_stars,
          has_ton_wallet: user.has_ton_wallet,
          photo_url: user.photo_url,
          referral_code,
        },
        token
      });
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });
  
  // Get current user
  app.get(`${prefix}/users/me`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get wallet if exists
      const wallet = await storage.getWallet(userId);
      
      // Get bonus progress if exists
      const bonusProgress = await storage.getBonusProgress(userId);
      
      // Get referrals count and amount earned
      // This would be a more complex query in a real app
      const referrals = 0; // Placeholder
      
      // Добавляем заголовки для предотвращения кеширования
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      res.json({
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          balance_stars: user.balance_stars,
          has_ton_wallet: user.has_ton_wallet,
          photo_url: user.photo_url,
          created_at: user.created_at,
          referral_code: user.referral_code,
          wallet_address: wallet?.ton_address,
          bonus_progress: bonusProgress ? {
            taps_so_far: bonusProgress.taps_so_far,
            start_time: bonusProgress.start_time,
            end_time: bonusProgress.end_time,
            completed: bonusProgress.completed
          } : null,
          total_games: 0, // Placeholder
          total_wins: 0, // Placeholder
          total_taps: 0, // Placeholder
          total_won: 0, // Placeholder
          referrals_count: referrals,
          referrals_earned: 0 // Placeholder
        }
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user data" });
    }
  });
  
  // Connect TON wallet
  app.post(`${prefix}/wallet/connect`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = walletSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid wallet data", errors: validation.error.errors });
      }
      
      const { ton_address } = validation.data;
      
      // Check if wallet already exists
      const existingWallet = await storage.getWallet(userId);
      if (existingWallet) {
        return res.status(400).json({ message: "Wallet already connected" });
      }
      
      // Create wallet
      const wallet = await storage.createWallet({
        id: uuidv4(),
        user_id: userId,
        ton_address,
        created_at: new Date()
      });
      
      // Update user has_ton_wallet flag
      await storage.updateUser(userId, { has_ton_wallet: true });
      
      res.json({ success: true, wallet });
    } catch (error) {
      console.error("Error connecting wallet:", error);
      res.status(500).json({ message: "Failed to connect wallet" });
    }
  });
  
  // Get wallet status
  app.get(`${prefix}/wallet/status`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const wallet = await storage.getWallet(userId);
      
      res.json({
        connected: !!wallet,
        wallet: wallet ? {
          address: wallet.ton_address,
          created_at: wallet.created_at
        } : null
      });
    } catch (error) {
      console.error("Error getting wallet status:", error);
      res.status(500).json({ message: "Failed to get wallet status" });
    }
  });
  
  // Get wallet info
  app.get(`${prefix}/wallet/info`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const wallet = await storage.getWallet(userId);
      
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }
      
      res.json({
        wallet: {
          address: wallet.ton_address,
          created_at: wallet.created_at
        }
      });
    } catch (error) {
      console.error("Error getting wallet info:", error);
      res.status(500).json({ message: "Failed to get wallet info" });
    }
  });
  
  // Disconnect wallet
  app.post(`${prefix}/wallet/disconnect`, jwtAuth, async (req: Request, res: Response) => {
    try {
      // This is a stub - in a real app, you'd need to handle wallet disconnection
      // For now, we'll just return success
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      res.status(500).json({ message: "Failed to disconnect wallet" });
    }
  });
  
  // Add stars (simulated payment)
  app.post(`${prefix}/users/addStars`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = addStarsSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid amount", errors: validation.error.errors });
      }
      
      const { amount } = validation.data;
      
      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update user balance
      await storage.updateUser(userId, {
        balance_stars: String(Number(user.balance_stars) + amount)
      });
      
      // Record transaction
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount: String(amount),
        type: "payment",
        description: `Added ${amount} Stars`,
        created_at: new Date()
      });
      
      res.json({ success: true, new_balance: String(Number(user.balance_stars) + amount) });
    } catch (error) {
      console.error("Error adding stars:", error);
      res.status(500).json({ message: "Failed to add stars" });
    }
  });
  
  // Apply referral code
  app.post(`${prefix}/users/applyReferral`, jwtAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = applyReferralSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid referral code", errors: validation.error.errors });
      }
      
      const { code } = validation.data;
      
      // Check if referral code exists
      const referral = await storage.getReferral(code);
      if (!referral) {
        return res.status(404).json({ message: "Referral code not found" });
      }
      
      // Check if referring self
      if (referral.user_id === userId) {
        return res.status(400).json({ message: "Cannot use your own referral code" });
      }
      
      // Record referral use
      await storage.createReferralUse({
        id: uuidv4(),
        code,
        referred_user: userId,
        used_at: new Date()
      });
      
      // Получаем пользователя-реферера
      const referrer = await storage.getUser(referral.user_id);
      if (referrer) {
        // Добавляем бонус рефереру при первой активации кода
        const bonusAmount = Number(referral.bonus_amount) || 50;
        await storage.updateUser(referral.user_id, {
          balance_stars: String(Number(referrer.balance_stars) + bonusAmount)
        });
        
        // Создаем транзакцию для рефера
        await storage.createTransaction({
          id: uuidv4(),
          user_id: referral.user_id,
          amount: String(bonusAmount),
          type: "referral",
          description: `Referral bonus from ${req.user!.username}`,
          created_at: new Date()
        });
      }
      
      res.json({ success: true, message: "Referral code applied successfully" });
    } catch (error) {
      console.error("Error applying referral code:", error);
      res.status(500).json({ message: "Failed to apply referral code" });
    }
  });
  
  // Fetch rooms (пример защищённого эндпоинта)
  app.get(`${prefix}/rooms`, jwtAuth, async (req: Request, res: Response) => {
    // ...existing code...
  });
}
