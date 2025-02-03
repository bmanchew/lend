
import { OpenAI } from 'openai';
import { logger } from '../lib/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class CodeReviewService {
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
}
