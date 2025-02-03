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
      console.log('[Socket] Initializing with config:', {
        merchantId,
        timestamp: new Date().toISOString()
      });

      socketRef.current = io({
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        reconnectionAttempts: 5,
        timeout: 45000,
        forceNew: true,
        autoConnect: true,
        upgrade: true
      });

      // Debug transport state
      socketRef.current.on('upgrading', (transport) => {
        console.log('[Socket] Upgrading transport:', transport);
      });

      socketRef.current.on('upgrade', (transport) => {
        console.log('[Socket] Transport upgraded to:', transport);
      });

      socketRef.current.on('upgradeError', (err) => {
        console.error('[Socket] Transport upgrade failed:', err);
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