import { User } from '@shared/schema';
import 'express';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare module 'express' {
  interface Request {
    session?: import('express-session').Session & Partial<import('express-session').SessionData>;
  }
}

declare global {
  namespace Express {
    export interface Request {
      user?: User;
    }
  }
}