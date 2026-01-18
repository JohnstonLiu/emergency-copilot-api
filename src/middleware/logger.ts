import type { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware
 * Logs method, path, status code, and response time
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const { method, path, query } = req;

  // Log request start
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const queryString = Object.keys(query).length > 0 ? `?${new URLSearchParams(query as Record<string, string>)}` : '';
  const url = `${path}${queryString}`;
  
  process.stdout.write(`[${timestamp}] → ${method} ${url}\n`);

  // Capture response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const statusIcon = status >= 500 ? '✗' : status >= 400 ? '!' : '✓';
    
    process.stdout.write(`[${timestamp}] ← ${statusIcon} ${method} ${url} ${status} ${duration}ms\n`);
  });

  next();
}
