import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';

const app = express();

// Use environment port or fallback to 5000
const PORT = parseInt(process.env.PORT || '5000', 10);

// Basic security middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});

// Apply rate limiting to auth routes
app.use('/api/auth', limiter);
app.use('/api/login', limiter);
app.use('/api/register', limiter);

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('[SERVER] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled Rejection:', reason);
});

// Middleware setup
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// Register API routes first
registerRoutes(app);

// Serve static files based on environment
const staticPath = process.env.NODE_ENV === 'production' ? 'dist/public' : 'client/dist';
app.use(express.static(staticPath));

// SPA route handling - after API routes
app.get('/*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(process.cwd(), staticPath, 'index.html'));
});

// Simple error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Create and start HTTP server
const server = createServer(app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Application started: http://0.0.0.0:${PORT}`);
  // Signal readiness to Replit
  if (process.send) {
    process.send('ready');
  }
});

export { app, server };