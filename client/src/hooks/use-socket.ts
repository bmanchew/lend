import { useEffect, useRef } from 'react';
import { io as socketIO, Socket } from 'socket.io-client';
import { useAuth } from './use-auth';

export function useSocket(merchantId: number) {
  const { user } = useAuth();
  const socketRef = useRef<Socket>();

  useEffect(() => {
    if (!user || !merchantId) return;

    socketRef.current = socketIO();
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