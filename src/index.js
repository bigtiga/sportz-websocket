import express from 'express';
import { db } from './db/index.js';
import { matches } from './db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ message: 'Sportz API is running!' });
});

// Get all matches
app.get('/matches', async (req, res) => {
  try {
    const allMatches = await db.select().from(matches);
    res.json(allMatches);
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new match
app.post('/matches', async (req, res) => {
  try {
    const { sport, homeTeam, awayTeam, status, startTime } = req.body;
    const newMatch = await db.insert(matches).values({
      sport,
      homeTeam,
      awayTeam,
      status: status || 'scheduled',
      startTime: startTime ? new Date(startTime) : null,
    }).returning();
    res.status(201).json(newMatch[0]);
  } catch (error) {
    console.error('Error creating match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a single match by ID
app.get('/matches/:id', async (req, res) => {
  try {
    const match = await db.select().from(matches).where(eq(matches.id, parseInt(req.params.id)));
    if (match.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json(match[0]);
  } catch (error) {
    console.error('Error fetching match:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});