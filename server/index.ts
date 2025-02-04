import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';
//import portfinder from 'portfinder'; // Removed as per edited code

const app = express();
const DEFAULT_PORT = 5000;

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

// Update static file serving configuration
const isDev = process.env.NODE_ENV !== 'production';
const staticPath = isDev ? path.join(process.cwd(), 'client') : path.join(process.cwd(), 'dist', 'public');

if (!fs.existsSync(staticPath)) {
  console.warn(`[SERVER] Static directory not found: ${staticPath}`);
  fs.mkdirSync(staticPath, { recursive: true });
}

app.use(express.static(staticPath, {
  index: false, // Disable automatic serving of index.html
  maxAge: isDev ? '0' : '1d' // Add caching in production
}));

// SPA route handling - after API routes
app.get('/*', (req, res) => {
  if (req.path.startsWith('/api')) {
    console.log('[SERVER] API 404:', req.path);
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  const indexPath = isDev 
    ? path.join(process.cwd(), 'client', 'index.html')
    : path.join(process.cwd(), 'dist', 'public', 'index.html');

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

// Server startup configuration
async function startServer() {
  try {
    const port = process.env.PORT || DEFAULT_PORT;
    console.log(`[SERVER] Attempting to start on port ${port}...`);

    const server = createServer(app);

    return new Promise((resolve, reject) => {
      server.listen(port, '0.0.0.0', () => {
        console.log(`[SERVER] Server ready! http://0.0.0.0:${port}`);
        console.log(`[SERVER] Static files path: ${staticPath}`);

        // Signal ready state to parent process
        if (process.send) {
          process.send({ type: 'ready', port });
        }

        resolve(server);
      });

      server.on('error', (error: any) => {
        console.error('[SERVER] Server error:', error);
        reject(error);
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