import cors from 'cors';

export const corsOptions = {
  origin: [
    process.env.BACKEND_URL || 'https://deviation-promotional-principal-winners.trycloudflare.com',
    process.env.WEB_APP_URL || 'https://cannon-expiration-mai-singapore.trycloudflare.com',
    'https://t.me',
    'https://web.telegram.org',
    'http://localhost:3001',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true,
  maxAge: 86400, // 24 часа
  preflightContinue: false,
  optionsSuccessStatus: 204
};

export const corsMiddleware = cors(corsOptions);