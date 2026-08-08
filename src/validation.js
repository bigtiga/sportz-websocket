import { z } from 'zod';

// Match validation schema
export const matchSchema = z.object({
  sport: z.string().min(1, 'Sport is required'),
  homeTeam: z.string().min(1, 'Home team is required'),
  awayTeam: z.string().min(1, 'Away team is required'),
  status: z.enum(['scheduled', 'live', 'finished']).default('scheduled'),
  startTime: z.string().datetime().optional().nullable(),
  endTime: z.string().datetime().optional().nullable(),
  homeScore: z.number().int().min(0).default(0),
  awayScore: z.number().int().min(0).default(0),
});

// Match update schema (all fields optional)
export const matchUpdateSchema = matchSchema.partial();

// Commentary validation schema
export const commentarySchema = z.object({
  matchId: z.number().int().positive('Valid match ID is required'),
  minute: z.number().int().min(0).optional().nullable(),
  sequence: z.number().int().optional().nullable(),
  period: z.string().optional().nullable(),
  eventType: z.enum(['goal', 'card', 'substitution', 'whistle', 'general']).default('general'),
  actor: z.string().optional().nullable(),
  team: z.string().optional().nullable(),
  message: z.string().min(1, 'Message is required'),
  metadata: z.record(z.any()).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});

// WebSocket message validation
export const wsMessageSchema = z.object({
  type: z.enum(['subscribeMatch', 'unsubscribeMatch', 'addCommentary', 'updateScore', 'ping']),
  matchId: z.number().int().positive().optional(),
  minute: z.number().int().min(0).optional(),
  message: z.string().optional(),
  eventType: z.string().optional(),
  actor: z.string().optional(),
  team: z.string().optional(),
  homeScore: z.number().int().min(0).optional(),
  awayScore: z.number().int().min(0).optional(),
});

// User validation (for auth)
export const userSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Bet validation
export const betSchema = z.object({
  matchId: z.number().int().positive('Valid match ID is required'),
  betType: z.enum(['homeWin', 'awayWin', 'draw']),
  amount: z.number().positive('Bet amount must be positive'),
  odds: z.number().positive('Odds must be positive'),
});
