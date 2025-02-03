type LogLevel = 'info' | 'error' | 'warn' | 'debug';

class Logger {
  private log(level: LogLevel, message: string, ...args: any[]) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
  }

  info(message: string, ...args: any[]) {
    this.log('info', message, ...args);
  }

  error(message: string, data?: any, requestId?: string) {
    const logData = {
      timestamp: new Date().toISOString(),
      message,
      data,
      requestId: requestId || Date.now().toString(36)
    };
    console.error('[ERROR]', JSON.stringify(logData, null, 2));
    
    // Log stack trace in development
    if (process.env.NODE_ENV === 'development' && data?.stack) {
      console.error('[ERROR] Stack trace:', data.stack);
    }
  }

  warn(message: string, ...args: any[]) {
    this.log('warn', message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log('debug', message, ...args);
  }
}

export const logger = new Logger();