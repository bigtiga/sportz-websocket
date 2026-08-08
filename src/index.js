import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { db } from './db/index.js';
import { matches, commentary } from './db/schema.js';
import { eq, desc } from 'drizzle-orm';
import dotenv from 'dotenv';
import { matchSchema, matchUpdateSchema, commentarySchema, wsMessageSchema } from './validation.js';
import { validate } from './middleware.js';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());

// Configuration
const CONFIG = {
  MAX_CONNECTIONS: 100,
  IDLE_TIMEOUT: 300000, // 5 minutes idle timeout
  PING_INTERVAL: 30000, // 30 seconds ping
  PONG_TIMEOUT: 10000, // 10 seconds to respond to ping
};

// Store active connections with metadata
const clients = new Map();

// Track connection statistics
const stats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesReceived: 0,
  messagesSent: 0,
};

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  // Check max connections
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

  // Send initial data
  sendLiveData(ws);

  // Set up ping/pong to detect dead connections
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
    clientInfo.lastActivity = new Date();
  });

  ws.on('message', async (message) => {
    try {
      stats.messagesReceived++;
      const rawData = JSON.parse(message.toString());
      
      // Validate WebSocket message
      const data = wsMessageSchema.parse(rawData);
      
      clientInfo.lastActivity = new Date();
      
      // Handle different message types
      switch (data.type) {
        case 'subscribeMatch':
          clientInfo.matchId = data.matchId;
          console.log(`📺 Client ${clientId} subscribed to match ${data.matchId}`);
          ws.send(JSON.stringify({ 
            type: 'subscribed', 
            matchId: data.matchId,
            timestamp: new Date().toISOString()
          }));
          break;
          
        case 'unsubscribeMatch':
          clientInfo.matchId = null;
          console.log(`📺 Client ${clientId} unsubscribed from match`);
          ws.send(JSON.stringify({ 
            type: 'unsubscribed',
            timestamp: new Date().toISOString()
          }));
          break;
          
        case 'addCommentary':
          // Validate commentary data
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
          console.log(`Unknown message type: ${data.type}`);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: `Unknown message type: ${data.type}` 
          }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error.message || 'Invalid message format'
      }));
    }
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for client ${clientId}:`, error.message);
  });

  ws.on('close', (code, reason) => {
    clients.delete(clientId);
    stats.activeConnections--;
    console.log(`🔴 Client ${clientId} disconnected. Active: ${clients.size}`);
    console.log(`   Close code: ${code}, Reason: ${reason || 'No reason provided'}`);
  });
});

// Heartbeat interval - check for dead connections
setInterval(() => {
  clients.forEach((clientInfo, clientId) => {
    const ws = clientInfo.ws;
    
    // Check if connection is dead
    if (!ws.isAlive) {
      console.log(`💀 Client ${clientId} is dead, terminating...`);
      ws.terminate();
      clients.delete(clientId);
      stats.activeConnections--;
      return;
    }
    
    // Check idle timeout
    const now = new Date();
    const idleTime = now - clientInfo.lastActivity;
    if (idleTime > CONFIG.IDLE_TIMEOUT) {
      console.log(`⏰ Client ${clientId} idle for ${Math.round(idleTime/1000)}s, closing...`);
      ws.close(1000, 'Connection idle');
      clients.delete(clientId);
      stats.activeConnections--;
      return;
    }
    
    // Send ping to check if connection is still alive
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, CONFIG.PING_INTERVAL);

// Send live data to a specific client
async function sendLiveData(ws) {
  try {
    const allMatches = await db.select().from(matches);
    ws.send(JSON.stringify({ 
      type: 'initialData', 
      data: allMatches,
      timestamp: new Date().toISOString()
    }));
    stats.messagesSent++;
  } catch (error) {
    console.error('Error sending initial data:', error);
  }
}

// Broadcast to all connected clients with filtering
function broadcast(data, options = {}) {
  const { excludeClientId = null, matchId = null } = options;
  const message = JSON.stringify(data);
  let sentCount = 0;
  
  clients.forEach((clientInfo, id) => {
    const client = clientInfo.ws;
    // Skip excluded client
    if (id === excludeClientId) return;
    
    // Skip if client is not ready
    if (client.readyState !== 1) return;
    
    // If matchId is specified, only send to clients subscribed to that match
    if (matchId && clientInfo.matchId !== matchId) return;
    
    client.send(message);
    sentCount++;
    stats.messagesSent++;
  });
  
  return sentCount;
}

// Broadcast to all clients (ignore match filtering)
function broadcastToAll(data, excludeClientId = null) {
  return broadcast(data, { excludeClientId });
}

// Handle adding commentary
async function handleAddCommentary(data, clientId) {
  try {
    const { matchId, minute, message, eventType, actor, team } = data;
    
    const newComment = await db.insert(commentary).values({
      matchId,
      minute,
      message,
      eventType: eventType || 'general',
      actor,
      team,
    }).returning();

    // Broadcast to all clients subscribed to this match
    const sentCount = broadcast({
      type: 'newCommentary',
      data: newComment[0],
      matchId
    }, { matchId, excludeClientId: clientId });

    // Send confirmation to the sender
    const client = clients.get(clientId);
    if (client) {
      client.ws.send(JSON.stringify({ 
        type: 'commentaryAdded', 
        data: newComment[0],
        sentTo: sentCount
      }));
      stats.messagesSent++;
    }
  } catch (error) {
    console.error('Error adding commentary:', error);
    const client = clients.get(clientId);
    if (client) {
      client.ws.send(JSON.stringify({ type: 'error', message: error.message }));
      stats.messagesSent++;
    }
  }
}

// Handle updating score
async function handleUpdateScore(data, clientId) {
  try {
    const { matchId, homeScore, awayScore } = data;
    
    const updatedMatch = await db.update(matches)
      .set({ 
        homeScore, 
        awayScore,
        updatedAt: new Date()
      })
      .where(eq(matches.id, matchId))
      .returning();

    // Broadcast to all clients subscribed to this match
    const sentCount = broadcast({
      type: 'scoreUpdate',
      data: updatedMatch[0],
      matchId
    }, { matchId, excludeClientId: clientId });

    // Send confirmation to sender
    const client = clients.get(clientId);
    if (client) {
      client.ws.send(JSON.stringify({ 
        type: 'scoreUpdated', 
        data: updatedMatch[0],
        sentTo: sentCount
      }));
      stats.messagesSent++;
    }
  } catch (error) {
    console.error('Error updating score:', error);
    const client = clients.get(clientId);
    if (client) {
      client.ws.send(JSON.stringify({ type: 'error', message: error.message }));
      stats.messagesSent++;
    }
  }
}

// Get connection statistics endpoint
app.get('/ws/stats', (req, res) => {
  res.json({
    activeConnections: clients.size,
    totalConnections: stats.totalConnections,
    messagesReceived: stats.messagesReceived,
    messagesSent: stats.messagesSent,
    config: {
      maxConnections: CONFIG.MAX_CONNECTIONS,
      idleTimeout: CONFIG.IDLE_TIMEOUT,
      pingInterval: CONFIG.PING_INTERVAL,
    },
    clients: Array.from(clients.values()).map(c => ({
      id: c.id,
      connectedAt: c.connectedAt,
      lastActivity: c.lastActivity,
      matchId: c.matchId,
      idleTime: Math.round((new Date() - c.lastActivity) / 1000) + 's'
    }))
  });
});

// ============== REST API Endpoints with Validation ==============

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'Sportz API is running with WebSocket!',
    websocket: `ws://localhost:${process.env.PORT || 8080}`,
    connections: clients.size
  });
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

// Get a single match by ID
app.get('/matches/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid match ID' });
    }
    const match = await db.select().from(matches).where(eq(matches.id, id));
    if (match.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    res.json(match[0]);
  } catch (error) {
    console.error('Error fetching match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new match - WITH VALIDATION
app.post('/matches', validate(matchSchema), async (req, res) => {
  try {
    const { sport, homeTeam, awayTeam, status, startTime } = req.body;
    const newMatch = await db.insert(matches).values({
      sport,
      homeTeam,
      awayTeam,
      status: status || 'scheduled',
      startTime: startTime ? new Date(startTime) : null,
    }).returning();
    
    // Broadcast new match to all clients
    broadcastToAll({ type: 'newMatch', data: newMatch[0] });
    
    res.status(201).json(newMatch[0]);
  } catch (error) {
    console.error('Error creating match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update a match - WITH VALIDATION
app.put('/matches/:id', validate(matchUpdateSchema), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid match ID' });
    }
    const { sport, homeTeam, awayTeam, status, startTime, homeScore, awayScore } = req.body;
    
    const updatedMatch = await db.update(matches)
      .set({
        sport,
        homeTeam,
        awayTeam,
        status,
        startTime: startTime ? new Date(startTime) : undefined,
        homeScore,
        awayScore,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, id))
      .returning();
      
    if (updatedMatch.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Broadcast update to all clients
    broadcastToAll({ type: 'matchUpdated', data: updatedMatch[0] });
    
    res.json(updatedMatch[0]);
  } catch (error) {
    console.error('Error updating match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a match
app.delete('/matches/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid match ID' });
    }
    const deletedMatch = await db.delete(matches)
      .where(eq(matches.id, id))
      .returning();
      
    if (deletedMatch.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    // Broadcast deletion to all clients
    broadcastToAll({ type: 'matchDeleted', data: { id } });
    
    res.json({ message: 'Match deleted successfully', id });
  } catch (error) {
    console.error('Error deleting match:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get commentary for a match
app.get('/matches/:id/commentary', async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid match ID' });
    }
    const comments = await db.select()
      .from(commentary)
      .where(eq(commentary.matchId, matchId))
      .orderBy(desc(commentary.createdAt));
    res.json(comments);
  } catch (error) {
    console.error('Error fetching commentary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add commentary via REST - WITH VALIDATION
app.post('/matches/:id/commentary', validate(commentarySchema), async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    if (isNaN(matchId)) {
      return res.status(400).json({ error: 'Invalid match ID' });
    }
    const { minute, sequence, period, eventType, actor, team, message, metadata, tags } = req.body;
    
    const newComment = await db.insert(commentary).values({
      matchId,
      minute,
      sequence,
      period,
      eventType,
      actor,
      team,
      message,
      metadata,
      tags,
    }).returning();
    
    // Broadcast new commentary to all clients subscribed to this match
    broadcast({
      type: 'newCommentary', 
      data: newComment[0], 
      matchId
    }, { matchId });
    
    res.status(201).json(newComment[0]);
  } catch (error) {
    console.error('Error adding commentary:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete commentary
app.delete('/commentary/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid commentary ID' });
    }
    const deletedComment = await db.delete(commentary)
      .where(eq(commentary.id, id))
      .returning();
      
    if (deletedComment.length === 0) {
      return res.status(404).json({ error: 'Commentary not found' });
    }
    
    res.json({ message: 'Commentary deleted successfully', id });
  } catch (error) {
    console.error('Error deleting commentary:', error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`);
  console.log(`📊 WebSocket stats: http://localhost:${PORT}/ws/stats`);
  console.log(`⚙️  Max connections: ${CONFIG.MAX_CONNECTIONS}`);
  console.log(`⏰ Idle timeout: ${CONFIG.IDLE_TIMEOUT/1000}s`);
  console.log(`✅ Zod validation is active!`);
});
