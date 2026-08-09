import { db } from './db/index.js';
import { users, matches, bets } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

export async function settleMatchBets(matchId) {
  try {
    // Get match result
    const match = await db.select().from(matches).where(eq(matches.id, matchId));
    if (match.length === 0) {
      throw new Error('Match not found');
    }

    if (match[0].status !== 'finished') {
      throw new Error('Match not finished yet');
    }

    const { homeScore, awayScore } = match[0];
    let winningType;

    // Determine winning bet type
    if (homeScore > awayScore) winningType = 'homeWin';
    else if (awayScore > homeScore) winningType = 'awayWin';
    else winningType = 'draw';

    console.log(`🎯 Match ${matchId}: ${winningType} is winning`);

    // Get all pending bets for this match
    const pendingBets = await db.select()
      .from(bets)
      .where(and(
        eq(bets.matchId, matchId),
        eq(bets.status, 'pending')
      ));

    console.log(`📊 Found ${pendingBets.length} pending bets`);

    // Process each bet
    for (const bet of pendingBets) {
      const isWinner = bet.betType === winningType;
      const newStatus = isWinner ? 'won' : 'lost';

      if (isWinner) {
        // Add winnings to user balance
        await sql`
          UPDATE users 
          SET balance = balance + ${bet.potentialWinnings}, 
              updated_at = NOW()
          WHERE id = ${bet.userId}
        `;
        console.log(`✅ User ${bet.userId} won ${bet.potentialWinnings}`);
      }

      // Update bet status
      await db.update(bets)
        .set({
          status: newStatus,
          settledAt: new Date(),
        })
        .where(eq(bets.id, bet.id));

      console.log(`📝 Bet ${bet.id} -> ${newStatus}`);
    }

    console.log(`✅ Match ${matchId} settled successfully`);
    return {
      matchId,
      winningType,
      totalBets: pendingBets.length,
      winners: pendingBets.filter(b => b.betType === winningType).length,
      losers: pendingBets.filter(b => b.betType !== winningType).length,
    };

  } catch (error) {
    console.error('Settlement error:', error);
    throw error;
  }
}

// CLI command to settle bets
export async function settleMatchCLI(matchId) {
  try {
    console.log(`🔄 Settling bets for match ${matchId}...`);
    const result = await settleMatchBets(matchId);
    console.log('✅ Settlement complete:', result);
    return result;
  } catch (error) {
    console.error('❌ Settlement failed:', error.message);
    process.exit(1);
  }
}

// If run directly as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  const matchId = parseInt(process.argv[2]);
  if (!matchId) {
    console.error('Usage: node src/settle-bets.js <matchId>');
    process.exit(1);
  }
  settleMatchCLI(matchId);
}
