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

      console.log('[Socket] Initializing socket connection');

      console.log('[Socket] Connection config:', {
        url: window.location.origin,
        protocol: window.location.protocol,
        time: new Date().toISOString()
      });

      socketRef.current = io({
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        timeout: 20000,
        forceNew: false,
        rememberUpgrade: true,
        autoConnect: true,
        withCredentials: true
      });

      // Enhanced error tracking
      socketRef.current.io.on("error", (error) => {
        console.error("[Socket.IO] Transport error:", {
          error,
          transport: socketRef.current?.io?.engine?.transport?.name,
          state: socketRef.current?.io?.engine?.readyState
        });
      });

      // Log socket connection state
      socketRef.current.on('connect_error', (error) => {
        console.error('[Socket] Connection error:', {
          message: error.message,
          type: error.type,
          description: error.description,
          time: new Date().toISOString(),
          transport: socketRef.current?.io?.engine?.transport?.name,
          readyState: socketRef.current?.io?.engine?.readyState,
          protocol: window.location.protocol,
          host: window.location.host,
          uri: socketRef.current?.io?.uri,
          transportOptions: socketRef.current?.io?.opts?.transports,
          attemptNumber: reconnectAttempts.current
        });
      });

      // Monitor transport state
      socketRef.current.io.engine.on("transportError", (err) => {
        console.error('[Socket] Transport error:', {
          error: err.message,
          transport: socketRef.current?.io?.engine?.transport?.name,
          time: new Date().toISOString()
        });
      });

      // Log handshake details
      socketRef.current.io.engine.on("handshake", (handshake) => {
        console.log('[Socket] Handshake:', {
          sid: handshake.sid,
          upgrades: handshake.upgrades,
          pingInterval: handshake.pingInterval,
          pingTimeout: handshake.pingTimeout,
          time: new Date().toISOString()
        });
      });

      socketRef.current.io.engine.on('upgrade', () => {
        console.log('[Socket] Transport upgraded:', {
          transport: socketRef.current?.io?.engine?.transport?.name,
          time: new Date().toISOString()
        });
      });

      socketRef.current.io.engine.on('upgradeError', (err) => {
        console.error('[Socket] Upgrade error:', {
          error: err,
          transport: socketRef.current?.io?.engine?.transport?.name,
          time: new Date().toISOString()
        });
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
      console.error('[Socket] Connection error:', {
        error: error.message,
        time: new Date().toISOString(),
        transportType: socket.io.engine.transport.name
      });
      handleReconnect();
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', {
        reason,
        time: new Date().toISOString(),
        wasConnected: socket.connected,
        attemptNumber: reconnectAttempts.current
      });
      handleReconnect();
    });

    socket.io.on("reconnect_attempt", (attempt) => {
      console.log('[Socket] Reconnection attempt:', {
        attempt,
        time: new Date().toISOString()
      });
    });

    socket.io.on("reconnect_failed", () => {
      console.error('[Socket] Reconnection failed after max attempts');
      socket.disconnect();
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [merchantId]);

  return socketRef.current;
}