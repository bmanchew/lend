import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './use-auth';

export function useSocket(merchantId: number) {
  const { user } = useAuth();
  const socketRef = useRef<Socket>();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  useEffect(() => {
    if (!merchantId) return;

    const initSocket = () => {
      socketRef.current = io({
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
        forceNew: true,
        autoConnect: true,
        withCredentials: true,
        extraHeaders: {
          'X-Merchant-ID': merchantId.toString()
        }
      });
    };

    const handleReconnect = () => {
      reconnectAttempts.current++;
      console.log(`Socket reconnection attempt ${reconnectAttempts.current}`);

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        socketRef.current?.disconnect();
      }
    };

    initSocket();
    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join_merchant_room', merchantId);
      reconnectAttempts.current = 0; // Reset on successful connection
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      handleReconnect();
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      handleReconnect();
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [merchantId]);

  return socketRef.current;
}