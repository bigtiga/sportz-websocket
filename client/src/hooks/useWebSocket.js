import { useEffect, useState, useRef } from 'react';

export const useWebSocket = (matchId) => {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const ws = useRef(null);

  useEffect(() => {
    ws.current = new WebSocket('ws://localhost:3000');

    ws.current.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
      if (matchId) {
        ws.current.send(JSON.stringify({
          type: 'subscribeMatch',
          matchId
        }));
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages(prev => [...prev, data]);
      console.log('WebSocket message:', data);
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
    };

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [matchId]);

  const sendMessage = (message) => {
    if (ws.current && isConnected) {
      ws.current.send(JSON.stringify(message));
    }
  };

  const subscribeMatch = (id) => {
    if (ws.current && isConnected) {
      ws.current.send(JSON.stringify({
        type: 'subscribeMatch',
        matchId: id
      }));
    }
  };

  return { messages, isConnected, sendMessage, subscribeMatch };
};
