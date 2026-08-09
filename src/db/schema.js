import { pgTable, serial, text, integer, timestamp, jsonb, decimal } from 'drizzle-orm/pg-core';

// ===== USERS TABLE (NEW) =====
export const users = pgTable('users', {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default('1000.00'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// ===== MATCHES TABLE (EXISTING) =====
export const matches = pgTable('matches', {
  id: serial("id").primaryKey(),
  sport: text('sport').notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  status: text("status").notNull().default('scheduled'),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  homeScore: integer("home_score").notNull().default(0),
  awayScore: integer("away_score").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at"),
});

// ===== COMMENTARY TABLE (EXISTING) =====
export const commentary = pgTable("commentary", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id").notNull().references(() => matches.id),
  minute: integer("minute"),
  sequence: integer("sequence"),
  period: text("period"),
  eventType: text("event_type"),
  actor: text("actor"),
  team: text("team"),
  message: text("message").notNull(),
  metadata: jsonb("metadata"),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== BETS TABLE (COMING SOON) =====
export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  matchId: integer("match_id").notNull().references(() => matches.id),
  betType: text("bet_type").notNull(), // 'homeWin', 'awayWin', 'draw'
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  odds: decimal("odds", { precision: 5, scale: 2 }).notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'won', 'lost', 'cancelled'
  potentialWinnings: decimal("potential_winnings", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  settledAt: timestamp("settled_at"),
});


