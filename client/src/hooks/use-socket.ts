<<<<<<< HEAD
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './use-auth';
import { useToast } from './use-toast';

const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
const MAX_RETRY_DELAY = 5000;

export function useSocket(merchantId: number) {
  const { user } = useAuth();
  const { toast } = useToast();
  const socketRef = useRef<Socket>();
  const retriesRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  const joinMerchantRoom = useCallback(() => {
    if (socketRef.current?.connected && merchantId) {
      console.log('Joining merchant room:', merchantId);
      socketRef.current.emit('join_merchant_room', merchantId);
    }
  }, [merchantId]);

  const connect = useCallback(() => {
    if (!merchantId) return;
    
    // Add connection monitoring
    let healthCheck: NodeJS.Timeout;

    // Cleanup existing socket connection
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = undefined;
    }

    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = undefined;
    }

    // Initialize socket with proper error handling
    socketRef.current = io({
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      reconnectionDelay: Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, retriesRef.current),
        MAX_RETRY_DELAY
      ),
      reconnectionAttempts: MAX_RETRIES - retriesRef.current,
      timeout: 5000
    });

    const socket = socketRef.current;

    const onConnect = () => {
      console.log('Socket connected:', socket.id);
      retriesRef.current = 0; // Reset retry count on successful connection
      joinMerchantRoom();
    };

    const onConnectError = (error: Error) => {
      console.error('Socket connection error:', error);

      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current++;
        const delay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(2, retriesRef.current),
          MAX_RETRY_DELAY
        );

        retryTimeoutRef.current = setTimeout(() => {
          console.log(`Retrying connection (attempt ${retriesRef.current}/${MAX_RETRIES})...`);
          connect();
        }, delay);
      } else {
        toast({
          title: "Connection Error",
          description: "Failed to connect to the server. Please refresh the page.",
          variant: "destructive"
        });
      }
    };

    const onDisconnect = (reason: string) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        connect();
      }
    };

    const onReconnect = (attemptNumber: number) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      joinMerchantRoom();
    };

    // Add event listeners
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect', onReconnect);

    return () => {
      // Remove event listeners
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect', onReconnect);
    };
  }, [merchantId, joinMerchantRoom, toast]);

  useEffect(() => {
    const cleanup = connect();

    return () => {
      if (cleanup) cleanup();
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (healthCheck) {
        clearInterval(healthCheck);
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [connect]);

  return socketRef.current;
}
=======

// Socket functionality removed - using REST endpoints only
export const useSocket = () => null;
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
