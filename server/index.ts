import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const requestId = Date.now().toString(36);
  const start = Date.now();
  const path = req.path;
  
  // Monitor memory usage
  const memoryStart = process.memoryUsage();
  
  console.log(`[API] ${req.method} ${path} started`, {
    requestId,
    query: req.query,
    body: req.body,
    headers: req.headers
  });
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register API routes first
  const server = registerRoutes(app);

  // Enterprise error handling middleware
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const errorId = Date.now().toString(36);
    const errorInfo = {
      id: errorId,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
      userId: req.body?.userId || 'anonymous',
      error: {
        name: err.name,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
      }
    };
    
    console.error("[ERROR]", JSON.stringify(errorInfo));
    
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        status: "error",
        message: err.message || "Internal Server Error",
        errorId
      });
    }
  });

  // Setup Vite/static serving last
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();