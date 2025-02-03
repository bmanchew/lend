
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './use-auth';

export function useSocket(merchantId: number) {
  const { user } = useAuth();
  const socketRef = useRef<Socket>();

  useEffect(() => {
    if (!merchantId) return;

    // Initialize socket with proper error handling
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;

    socketRef.current = io({
      path: '/socket.io/',
      transports: ['websocket'],
      secure: true,
      rejectUnauthorized: false,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      withCredentials: true,
      forceNew: true,
      autoConnect: true,
      protocol: protocol,
      hostname: host
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
