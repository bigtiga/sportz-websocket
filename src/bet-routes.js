import express from 'express';
import { db } from './db/index.js';
import { users, matches, bets } from './db/schema.js';
import { authenticate } from './auth.js';
import { betSchema } from './validation.js';
import { validate } from './middleware.js';
import { eq, and, desc } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// ===== Place a bet =====
router.post('/place', authenticate, validate(betSchema), async (req, res) => {
  try {
    const { matchId, betType, amount, odds } = req.body;
    const userId = req.user.userId;

    // Check if match exists and is live or scheduled
    const match = await db.select().from(matches).where(eq(matches.id, matchId));
    if (match.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    if (match[0].status === 'finished') {
      return res.status(400).json({ error: 'Match already finished' });
    }

    // Check user balance
    const user = await db.select().from(users).where(eq(users.id, userId));
    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (parseFloat(user[0].balance) < amount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        balance: user[0].balance,
        required: amount
      });
    }

    // Calculate potential winnings
    const potentialWinnings = (amount * odds).toFixed(2);

    // Admin route to settle bets (add to bet-routes.js)
router.post('/settle/:matchId', authenticate, async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    // Check if user is admin (you can add admin role check here)
    // For now, just settle the bets
    
    const { settleMatchBets } = await import('./settle-bets.js');
    const result = await settleMatchBets(matchId);
    
    // Broadcast settlement via WebSocket
    const wss = req.app.get('wss');
    if (wss) {
      const message = JSON.stringify({
        type: 'matchSettled',
        data: result,
        timestamp: new Date().toISOString()
      });
      
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(message);
        }
      });
    }
    
    res.json({
      message: 'Bets settled successfully',
      result
    });
    
  } catch (error) {
    console.error('Settlement error:', error);
    res.status(500).json({ error: error.message });
  }
});

    // Create bet and deduct balance in a transaction
    const sql = neon(process.env.DATABASE_URL);
    const result = await sql`
      WITH bet_created AS (
        INSERT INTO bets (user_id, match_id, bet_type, amount, odds, potential_winnings)
        VALUES (${userId}, ${matchId}, ${betType}, ${amount}, ${odds}, ${potentialWinnings})
        RETURNING *
      ),
      balance_updated AS (
        UPDATE users 
        SET balance = balance - ${amount}, updated_at = NOW()
        WHERE id = ${userId}
        RETURNING balance
      )
      SELECT 
        bet_created.*,
        balance_updated.balance as new_balance
      FROM bet_created, balance_updated
    `;

    // Broadcast bet update via WebSocket
    const wss = req.app.get('wss');
    if (wss) {
      const message = JSON.stringify({
        type: 'newBet',
        data: {
          userId,
          matchId,
          betType,
          amount,
          odds,
          potentialWinnings
        },
        timestamp: new Date().toISOString()
      });
      
      wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(message);
        }
      });
    }

    res.status(201).json({
      message: 'Bet placed successfully',
      bet: {
        id: result[0].id,
        matchId: result[0].match_id,
        betType: result[0].bet_type,
        amount: parseFloat(result[0].amount),
        odds: parseFloat(result[0].odds),
        potentialWinnings: parseFloat(result[0].potential_winnings),
        status: result[0].status,
        createdAt: result[0].created_at
      },
      newBalance: parseFloat(result[0].new_balance)
    });

  } catch (error) {
    console.error('Bet placement error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Get user's bet history =====
router.get('/history', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const userBets = await db.select({
      id: bets.id,
      matchId: bets.matchId,
      match: {
        sport: matches.sport,
        homeTeam: matches.homeTeam,
        awayTeam: matches.awayTeam,
        status: matches.status,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
      },
      betType: bets.betType,
      amount: bets.amount,
      odds: bets.odds,
      status: bets.status,
      potentialWinnings: bets.potentialWinnings,
      createdAt: bets.createdAt,
      settledAt: bets.settledAt,
    })
    .from(bets)
    .innerJoin(matches, eq(bets.matchId, matches.id))
    .where(eq(bets.userId, userId))
    .orderBy(desc(bets.createdAt))
    .limit(limit)
    .offset(offset);

    // Get total count
    const countResult = await db.select({
      count: bets.id,
    })
    .from(bets)
    .where(eq(bets.userId, userId));

    res.json({
      bets: userBets,
      pagination: {
        limit,
        offset,
        total: countResult.length
      }
    });

  } catch (error) {
    console.error('Bet history error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Get bet by ID =====
router.get('/:id', authenticate, async (req, res) => {
  try {
    const betId = parseInt(req.params.id);
    const userId = req.user.userId;

    const bet = await db.select({
      id: bets.id,
      matchId: bets.matchId,
      match: {
        sport: matches.sport,
        homeTeam: matches.homeTeam,
        awayTeam: matches.awayTeam,
        status: matches.status,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
      },
      betType: bets.betType,
      amount: bets.amount,
      odds: bets.odds,
      status: bets.status,
      potentialWinnings: bets.potentialWinnings,
      createdAt: bets.createdAt,
      settledAt: bets.settledAt,
    })
    .from(bets)
    .innerJoin(matches, eq(bets.matchId, matches.id))
    .where(and(eq(bets.id, betId), eq(bets.userId, userId)));

    if (bet.length === 0) {
      return res.status(404).json({ error: 'Bet not found' });
    }

    res.json(bet[0]);

  } catch (error) {
    console.error('Get bet error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Get match betting stats =====
router.get('/match/:matchId/stats', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);

    const stats = await db.select({
      betType: bets.betType,
      totalBets: bets.id,
      totalAmount: bets.amount,
    })
    .from(bets)
    .where(and(
      eq(bets.matchId, matchId),
      eq(bets.status, 'pending')
    ))
    .groupBy(bets.betType);

    res.json({
      matchId,
      bettingStats: stats.map(s => ({
        betType: s.betType,
        totalBets: parseInt(s.totalBets),
        totalAmount: parseFloat(s.totalAmount)
      }))
    });

  } catch (error) {
    console.error('Match stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
