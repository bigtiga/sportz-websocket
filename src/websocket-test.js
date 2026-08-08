import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8080');

// Ping interval to keep connection alive
let pingInterval;

ws.on('open', () => {
  console.log('🟢 Connected to WebSocket server');
  
  // Send ping every 20 seconds
  pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
      console.log('💓 Ping sent');
    }
  }, 20000);
  
  // Subscribe to match 1
  ws.send(JSON.stringify({
    type: 'subscribeMatch',
    matchId: 1
  }));
  
  // Add commentary after 2 seconds
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'addCommentary',
      matchId: 1,
      minute: 23,
      message: 'GOAL! Messi scores from a free kick!',
      eventType: 'goal',
      actor: 'Messi',
      team: 'Barcelona'
    }));
  }, 2000);
  
  // Update score after 4 seconds
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'updateScore',
      matchId: 1,
      homeScore: 1,
      awayScore: 0
    }));
  }, 4000);
  
  // Unsubscribe after 10 seconds
  setTimeout(() => {
    ws.send(JSON.stringify({
      type: 'unsubscribeMatch'
    }));
    console.log('📺 Unsubscribed from match');
  }, 10000);
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📨 Received:', message.type);
  if (message.type === 'pong') {
    console.log('💓 Pong received');
  } else {
    console.log('📦 Data:', message.data);
  }
  console.log('---');
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log(`🔴 Disconnected (code: ${code}, reason: ${reason || 'No reason'})`);
  clearInterval(pingInterval);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Closing connection...');
  ws.close();
  clearInterval(pingInterval);
  process.exit(0);
});
