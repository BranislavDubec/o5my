// Module augmentations for express and express-session
export {};

declare module 'express-session' {
  interface SessionData {
    userId?: number;
  }
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: {
      id: number;
      email: string;
      name: string;
      role: string;
    };
  }
}
