
import { Server as HTTPServer } from 'http';
import { Server as SocketServer } from 'socket.io';

export function setupSocketIO(httpServer: HTTPServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    path: "/socket.io/",
    transports: ["websocket", "polling"]
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_merchant_room', (merchantId) => {
      socket.join(`merchant_${merchantId}`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}
