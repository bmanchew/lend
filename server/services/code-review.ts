import { OpenAI } from 'openai';
import { logger } from '../lib/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface AnalysisResult {
  issues: Array<{
    severity: 'error' | 'warning' | 'info';
    message: string;
    line?: number;
    column?: number;
  }>;
  suggestions: string[];
  summary: string;
}

class CodeReviewService {
  static async analyzeInRealTime(code: string, language: string): Promise<AnalysisResult> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{
          role: "system",
          content: "Analyze this code in real-time for potential issues, bugs, and improvements. Focus on security, performance, and best practices."
        }, {
          role: "user",
          content: `Please analyze this ${language} code:\n\n${code}`
        }],
        temperature: 0.3,
        max_tokens: 1000
      });

      const analysis = response.choices[0].message.content || '';

      // Parse the analysis into structured format
      const issues: AnalysisResult['issues'] = [];
      const suggestions: string[] = [];
      let summary = '';

      try {
        const parsed = JSON.parse(analysis);
        return parsed as AnalysisResult;
      } catch {
        // If not JSON, provide basic analysis
        return {
          issues: [{
            severity: 'info',
            message: analysis
          }],
          suggestions: [],
          summary: analysis.split('\n')[0] || 'Analysis completed'
        };
      }
    } catch (err: any) {
      logger.error('Real-time code analysis error:', err);
      return {
        issues: [{
          severity: 'error',
          message: err.message
        }],
        suggestions: [],
        summary: 'Analysis failed'
      };
    }
  }
  static async reviewCode(code: string, language: string) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{
          role: "system",
          content: "You are a code review expert. Analyze the code for bugs, security issues, and best practices."
        }, {
          role: "user",
          content: `Please review this ${language} code:\n\n${code}`
        }],
        temperature: 0.7,
        max_tokens: 1500
      });

      return {
        success: true,
        analysis: response.choices[0].message.content
      };
    } catch (err: any) {
      logger.error('Code review error:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  static async analyzeRepository(files: {path: string, content: string}[]) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{
          role: "system", 
          content: "Analyze this codebase for architectural patterns, potential issues, and improvements."
        }, {
          role: "user",
          content: `Review these files:\n\n${files.map(f => `${f.path}:\n${f.content}\n---\n`).join('\n')}`
        }],
        temperature: 0.7,
        max_tokens: 2000
      });

      return {
        success: true,
        analysis: response.choices[0].message.content
      };
    } catch (err: any) {
      logger.error('Repository analysis error:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }
  static async analyzeWebSocketConfig() {
    try {
      const socketConfig = `
      const io = new SocketIOServer(httpServer, {
        cors: {
          origin: ["https://shi-fi-lend-brandon263.replit.app"],
          methods: ["GET", "POST"],
          credentials: true
        },
        path: "/socket.io/",
        transports: ['websocket', 'polling'],
        pingTimeout: 20000,
        pingInterval: 10000,
        maxHttpBufferSize: 1e6,
        allowUpgrades: true,
        cookie: {
          secure: true,
          sameSite: 'none'
        }
      });

      // Client config
      const socket = io({
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 60000,
        upgrade: true,
        rememberUpgrade: true,
        forceNew: true
      });`;

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: "Analyze this WebSocket configuration for potential issues with HTTPS/WSS security and upgrade paths. Focus on secure WebSocket setup and mixed content prevention."
          },
          {
            role: "user", 
            content: `Review this Socket.IO configuration for security and upgrade issues:\n${socketConfig}\n\nCurrent errors: SecurityError: Failed to construct 'WebSocket': An insecure WebSocket connection may not be initiated from a page loaded over HTTPS`
          }
        ]
      });

      const analysis = response.choices[0].message.content;
      logger.info('WebSocket Security Analysis:', analysis);
      return response.choices[0].message.content;

    } catch (error) {
      logger.error('Error analyzing WebSocket config:', error);
      throw error;
    }
  }
}