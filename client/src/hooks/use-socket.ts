
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './use-auth';

export function useSocket(merchantId: number) {
  const { user } = useAuth();
  const socketRef = useRef<Socket>();

  useEffect(() => {
    if (!merchantId) return;

    // Initialize socket with proper error handling
    socketRef.current = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 3,
      timeout: 20000,
      forceNew: true,
      autoConnect: true
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join_merchant_room', merchantId);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [merchantId]);

  return socketRef.current;
}
