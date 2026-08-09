import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { db } from './db/index.js';
import { matches, commentary } from './db/schema.js';
import { eq, desc } from 'drizzle-orm';
import dotenv from 'dotenv';
import { matchSchema, matchUpdateSchema, commentarySchema, wsMessageSchema } from './validation.js';
import { validate } from './middleware.js';
import authRoutes from './auth-routes.js';
import betRoutes from './bet-routes.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// ===== CORS Middleware (MUST BE FIRST) =====
app.use((req, res, next) => {
  // Allow all origins
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());

// Store wss instance for bet routes
app.set('wss', wss);

// ===== Routes =====
app.use('/auth', authRoutes);
app.use('/bets', betRoutes);

// ===== Configuration =====
const CONFIG = {
  MAX_CONNECTIONS: 100,
  IDLE_TIMEOUT: 300000,
  PING_INTERVAL: 30000,
};

// ===== WebSocket Connection Management =====
const clients = new Map();
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesReceived: 0,
  messagesSent: 0,
};

wss.on('connection', (ws, req) => {
  if (clients.size >= CONFIG.MAX_CONNECTIONS) {
    ws.close(1008, 'Server is full');
    console.log('❌ Connection rejected: Server full');
    return;
  }

  const clientId = Date.now().toString();
  const clientInfo = {
    id: clientId,
    ws: ws,
    connectedAt: new Date(),
    lastActivity: new Date(),
    matchId: null,
    isAlive: true,
  };
  
  clients.set(clientId, clientInfo);
  stats.totalConnections++;
  stats.activeConnections++;
  
  console.log(`🟢 Client ${clientId} connected. Active: ${clients.size}`);
  sendLiveData(ws);

  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    clientInfo.lastActivity = new Date();
  });

  ws.on('message', async (message) => {
    try {
      stats.messagesReceived++;
      const rawData = JSON.parse(message.toString());
      const data = wsMessageSchema.parse(rawData);
      clientInfo.lastActivity = new Date();
      
      switch (data.type) {
        case 'subscribeMatch':
          clientInfo.matchId = data.matchId;
          ws.send(JSON.stringify({ type: 'subscribed', matchId: data.matchId }));
          break;
        case 'unsubscribeMatch':
          clientInfo.matchId = null;
          ws.send(JSON.stringify({ type: 'unsubscribed' }));
          break;
        case 'addCommentary':
          const commentData = commentarySchema.parse({
            matchId: data.matchId,
            minute: data.minute,
            message: data.message,
            eventType: data.eventType,
            actor: data.actor,
            team: data.team,
          });
          await handleAddCommentary(commentData, clientId);
          break;
        case 'updateScore':
          await handleUpdateScore(data, clientId);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown type: ${data.type}` }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    stats.activeConnections--;
    console.log(`🔴 Client ${clientId} disconnected. Active: ${clients.size}`);
  });
});

// ===== Heartbeat =====
setInterval(() => {
  clients.forEach((clientInfo, clientId) => {
    const ws = clientInfo.ws;
    if (!ws.isAlive) {
      ws.terminate();
      clients.delete(clientId);
      stats.activeConnections--;
      return;
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, CONFIG.PING_INTERVAL);

// ===== WebSocket Helper Functions =====
async function sendLiveData(ws) {
  try {
    const allMatches = await db.select().from(matches);
    ws.send(JSON.stringify({ type: 'initialData', data: allMatches }));
    stats.messagesSent++;
  } catch (error) {
    console.error('Error sending initial data:', error);
  }
}

function broadcast(data, options = {}) {
  const { excludeClientId = null, matchId = null } = options;
  const message = JSON.stringify(data);
  let sentCount = 0;
  
  clients.forEach((clientInfo, id) => {
    const client = clientInfo.ws;
    if (id === excludeClientId) return;
    if (client.readyState !== 1) return;
    if (matchId && clientInfo.matchId !== matchId) return;
    client.send(message);
    sentCount++;
    stats.messagesSent++;
  });
  
  return sentCount;
}

function broadcastToAll(data, excludeClientId = null) {
  return broadcast(data, { excludeClientId });
}

async function handleAddCommentary(data, clientId) {
  try {
    const { matchId, minute, message, eventType, actor, team } = data;
    const newComment = await db.insert(commentary).values({
      matchId, minute, message, eventType: eventType || 'general', actor, team,
    }).returning();
    broadcast({ type: 'newCommentary', data: newComment[0], matchId }, { matchId, excludeClientId: clientId });
  } catch (error) {
    console.error('Error adding commentary:', error);
  }
}

async function handleUpdateScore(data, clientId) {
  try {
    const { matchId, homeScore, awayScore } = data;
    const updatedMatch = await db.update(matches)
      .set({ homeScore, awayScore, updatedAt: new Date() })
      .where(eq(matches.id, matchId))
      .returning();
    broadcast({ type: 'scoreUpdate', data: updatedMatch[0], matchId }, { matchId, excludeClientId: clientId });
  } catch (error) {
    console.error('Error updating score:', error);
  }
}

// ===== REST API Endpoints =====

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Sportz API with Betting System!',
    websocket: `ws://localhost:${process.env.PORT || 3000}`,
    connections: clients.size
  });
});

// WebSocket stats
app.get('/ws/stats', (req, res) => {
  res.json({
    activeConnections: clients.size,
    totalConnections: stats.totalConnections,
    messagesReceived: stats.messagesReceived,
    messagesSent: stats.messagesSent,
    config: CONFIG,
    clients: Array.from(clients.values()).map(c => ({
      id: c.id,
      connectedAt: c.connectedAt,
      lastActivity: c.lastActivity,
      matchId: c.matchId,
      idleTime: Math.round((new Date() - c.lastActivity) / 1000) + 's'
    }))
  });
});

// Get all matches
app.get('/matches', async (req, res) => {
  try {
    const allMatches = await db.select().from(matches);
    res.json(allMatches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single match
app.get('/matches/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid match ID' });
    const match = await db.select().from(matches).where(eq(matches.id, id));
    if (match.length === 0) return res.status(404).json({ error: 'Match not found' });
    res.json(match[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create match
app.post('/matches', validate(matchSchema), async (req, res) => {
  try {
    const { sport, homeTeam, awayTeam, status, startTime } = req.body;
    const newMatch = await db.insert(matches).values({
      sport, homeTeam, awayTeam, status: status || 'scheduled',
      startTime: startTime ? new Date(startTime) : null,
    }).returning();
    broadcastToAll({ type: 'newMatch', data: newMatch[0] });
    res.status(201).json(newMatch[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update match
app.put('/matches/:id', validate(matchUpdateSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid match ID' });
    const { sport, homeTeam, awayTeam, status, startTime, homeScore, awayScore } = req.body;
    const updatedMatch = await db.update(matches)
      .set({
        sport, homeTeam, awayTeam, status,
        startTime: startTime ? new Date(startTime) : undefined,
        homeScore, awayScore, updatedAt: new Date(),
      })
      .where(eq(matches.id, id))
      .returning();
    if (updatedMatch.length === 0) return res.status(404).json({ error: 'Match not found' });
    broadcastToAll({ type: 'matchUpdated', data: updatedMatch[0] });
    res.json(updatedMatch[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete match
app.delete('/matches/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid match ID' });
    const deletedMatch = await db.delete(matches).where(eq(matches.id, id)).returning();
    if (deletedMatch.length === 0) return res.status(404).json({ error: 'Match not found' });
    broadcastToAll({ type: 'matchDeleted', data: { id } });
    res.json({ message: 'Match deleted successfully', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get commentary
app.get('/matches/:id/commentary', async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });
    const comments = await db.select().from(commentary).where(eq(commentary.matchId, matchId)).orderBy(desc(commentary.createdAt));
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add commentary
app.post('/matches/:id/commentary', validate(commentarySchema), async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId)) return res.status(400).json({ error: 'Invalid match ID' });
    const { minute, sequence, period, eventType, actor, team, message, metadata, tags } = req.body;
    const newComment = await db.insert(commentary).values({
      matchId, minute, sequence, period, eventType, actor, team, message, metadata, tags,
    }).returning();
    broadcast({ type: 'newCommentary', data: newComment[0], matchId }, { matchId });
    res.status(201).json(newComment[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete commentary
app.delete('/commentary/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid commentary ID' });
    const deletedComment = await db.delete(commentary).where(eq(commentary.id, id)).returning();
    if (deletedComment.length === 0) return res.status(404).json({ error: 'Commentary not found' });
    res.json({ message: 'Commentary deleted successfully', id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`📊 WebSocket stats: http://localhost:${PORT}/ws/stats`);
  console.log(`⚙️  Max connections: ${CONFIG.MAX_CONNECTIONS}`);
  console.log(`⏰ Idle timeout: ${CONFIG.IDLE_TIMEOUT/1000}s`);
  console.log(`✅ Zod validation is active!`);
  console.log(`✅ CORS enabled: Allow all origins`);
});
