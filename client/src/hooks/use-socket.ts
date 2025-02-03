import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './use-auth';

export function useSocket(merchantId: number) {
  const { user } = useAuth();
  const socketRef = useRef<Socket>();

  useEffect(() => {
    if (!user || !merchantId) return;

    socketRef.current = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });

    socketRef.current.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
    });
    socketRef.current.emit('join_merchant_room', merchantId);

    socketRef.current.on('application_update', (update) => {
      console.log('Received application update:', update);
      // Trigger UI refresh here
    });

    socketRef.current.on('merchant_activity', (activity) => {
      console.log('Received merchant activity:', activity);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [user, merchantId]);

  return socketRef.current;
}