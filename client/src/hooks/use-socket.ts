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

    // Clear any existing retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
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

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      retriesRef.current = 0; // Reset retry count on successful connection
      joinMerchantRoom();
    });

    socket.on('connect_error', (error) => {
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
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, attempt to reconnect
        connect();
      }
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      joinMerchantRoom(); // Rejoin room after reconnection
    });

    return socket;
  }, [merchantId, joinMerchantRoom, toast]);

  useEffect(() => {
    const socket = connect();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (socket) {
        socket.disconnect();
      }
    };
  }, [connect]);

  return socketRef.current;
}