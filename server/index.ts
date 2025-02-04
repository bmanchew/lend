import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';
import portfinder from 'portfinder';

const app = express();

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
const staticPath = process.env.NODE_ENV === 'production' ? 'dist/public' : 'dist/public';

// Ensure static directory exists
app.use(express.static(path.join(process.cwd(), staticPath), {
  index: false // Disable automatic serving of index.html
}));

// SPA route handling - after API routes
app.get('/*', (req, res) => {
  if (req.path.startsWith('/api')) {
    console.log('[SERVER] API 404:', req.path);
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  const indexPath = path.join(process.cwd(), staticPath, 'index.html');
  console.log('[SERVER] Serving index.html from:', indexPath);
  res.sendFile(indexPath);
});

// Error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  console.error("[ERROR]", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Dynamic port configuration with portfinder
async function startServer() {
  try {
    // Configure portfinder
    portfinder.basePort = parseInt(process.env.PORT || '5000');
    portfinder.highestPort = 6000; // Set upper limit for port searching

    console.log('[SERVER] Finding available port...');
    const port = await portfinder.getPortPromise();
    console.log(`[SERVER] Port ${port} is available`);

    // Add small delay to ensure port is clear
    await new Promise(resolve => setTimeout(resolve, 1000));

    const server = createServer(app);

    return new Promise((resolve, reject) => {
      server.listen(port, '0.0.0.0', () => {
        console.log(`[SERVER] Application started: http://0.0.0.0:${port}`);
        console.log(`[SERVER] Static files path: ${path.join(process.cwd(), staticPath)}`);
        if (process.send) {
          // Send port information to parent process
          process.send({ type: 'ready', port });
        }
        resolve(server);
      });

      server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`[SERVER] Port ${port} is already in use`);
          reject(error);
        } else {
          console.error('[SERVER] Server error:', error);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('[SERVER] Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer()
  .then(() => console.log('[SERVER] Server startup complete'))
  .catch(error => {
    console.error('[SERVER] Server startup failed:', error);
    process.exit(1);
  });

export { app };