import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { storage } from '../storage';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

/**
 * Проверяет данные аутентификации от Telegram WebApp
 * @param initData строка initData от Telegram WebApp
 * @returns true если данные валидны, false если нет
 */
export function validateTelegramWebAppData(initData: string): boolean {
  // Валидация всегда обязательна, даже в development
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return false;
    urlParams.delete('hash');
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(process.env.TELEGRAM_BOT_TOKEN || 'test_token')
      .digest();
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');
    return calculatedHash === hash;
  } catch (error) {
    console.error('Ошибка при валидации данных Telegram:', error);
    return false;
  }
}

/**
 * Проверяет данные Telegram Auth и возвращает данные пользователя
 * @param telegramData данные от Telegram WebApp
 * @returns данные пользователя или undefined если валидация не прошла
 */
export function validateTelegramAuth(telegramData: string): any {
  try {
    // Всегда только реальный пользователь
    const isValid = validateTelegramWebAppData(telegramData);
    if (!isValid) {
      return undefined;
    }
    return extractTelegramUserData(telegramData);
  } catch (error) {
    console.error('Ошибка при валидации Telegram Auth:', error);
    return undefined;
  }
}

/**
 * Извлекает данные пользователя из Telegram initData
 * @param initData строка initData от Telegram WebApp
 * @returns данные пользователя или null если не удалось извлечь
 */
export function extractTelegramUserData(initData: string): any {
  try {
    const urlParams = new URLSearchParams(initData);
    const user = urlParams.get('user');
    
    if (!user) return null;
    
    return JSON.parse(decodeURIComponent(user));
  } catch (error) {
    console.error('Ошибка при извлечении данных пользователя:', error);
    return null;
  }
}

/**
 * Middleware для аутентификации пользователей через Telegram
 */
export async function authenticateTelegram(req: Request, res: Response, next: NextFunction) {
  try {
    const { telegramData } = req.body;
    if (!telegramData) {
      return res.status(400).json({ error: 'Отсутствуют данные Telegram' });
    }
    // Проверяем валидность данных Telegram WebApp
    const isValid = validateTelegramWebAppData(telegramData);
    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Невалидные данные аутентификации Telegram' });
    }
    // Извлекаем данные пользователя
    const userData = extractTelegramUserData(telegramData);
    if (!userData) {
      return res.status(400).json({ error: 'Не удалось извлечь данные пользователя' });
    }
    // Получаем или создаём пользователя за единый вызов
    const { id: telegram_id, username, first_name, photo_url } = userData;
    const referralCode = (username || first_name || 'user') + Math.random().toString(36).substring(2, 8).toUpperCase();
    const user = await storage.getOrCreateUserByTelegramId(
      telegram_id,
      username || `${first_name || 'User'}${telegram_id.toString().slice(-4)}`,
      {
        id: uuidv4(),
        balance_stars: "100",
        has_ton_wallet: false,
        photo_url,
        created_at: new Date(),
        referral_code: referralCode,
      }
    );
    // Если пользователь новый — создаём запись о реферале
    if (user.created_at.getTime() === new Date().getTime()) {
      await storage.createReferral({
        code: referralCode,
        user_id: user.id,
        bonus_amount: '50',
        created_at: new Date(),
      });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Ошибка аутентификации Telegram:', error);
    res.status(500).json({ error: 'Ошибка сервера при аутентификации' });
  }
}

/**
 * Middleware для проверки аутентификации
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Пользователь не аутентифицирован' });
  }
  next();
}

// JWT middleware для всех защищённых маршрутов
export async function jwtAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Пользователь не аутентифицирован (нет токена)' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'ytreewddsfgg34532hyjklldseeew3322aw') as any;
    // Получаем полные данные пользователя из базы данных
    const user = await storage.getUser(payload.user_id);
    if (!user) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Пользователь не аутентифицирован (неверный токен)' });
  }
}