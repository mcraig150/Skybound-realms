// Unit tests for logging system
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Logger, LogLevel, getDefaultLoggerConfig, initializeLogger } from '../../shared/logger';
import { AppError } from '../../shared/errors';
import { ErrorCode } from '../../shared/types';

// Mock console methods
const mockConsole = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
};

describe('Logger', () => {
  let logger: Logger;
  let originalConsole: any;

  beforeEach(() => {
    // Reset singleton instance
    (Logger as any).instance = undefined;
    
    // Mock console
    originalConsole = {
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };
    
    console.error = mockConsole.error;
    console.warn = mockConsole.warn;
    console.info = mockConsole.info;
    console.debug = mockConsole.debug;
    
    // Clear mock calls
    Object.values(mockConsole).forEach(mock => mock.mockClear());
    
    // Create logger with test config
    logger = Logger.getInstance({
      level: LogLevel.DEBUG,
      enableConsole: true,
      enableFile: false,
      enableExternal: false
    });
  });

  afterEach(() => {
    // Restore console
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();
      
      expect(logger1).toBe(logger2);
    });

    it('should throw error if not initialized with config', () => {
      (Logger as any).instance = undefined;
      
      expect(() => Logger.getInstance()).toThrow('Logger must be initialized with config');
    });
  });

  describe('Log Levels', () => {
    it('should log error messages', () => {
      const error = new Error('Test error');
      const context = { userId: '123' };
      
      logger.error('Test error message', error, context);
      
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('ERROR');
      expect(logCall).toContain('Test error message');
      expect(logCall).toContain('Context:');
      expect(logCall).toContain('Error: Test error');
    });

    it('should log warning messages', () => {
      const context = { action: 'test' };
      
      logger.warn('Test warning', context);
      
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.warn.mock.calls[0][0];
      expect(logCall).toContain('WARN');
      expect(logCall).toContain('Test warning');
      expect(logCall).toContain('Context:');
    });

    it('should log info messages', () => {
      logger.info('Test info message');
      
      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('INFO');
      expect(logCall).toContain('Test info message');
    });

    it('should log debug messages when level is DEBUG', () => {
      logger.debug('Test debug message');
      
      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.debug.mock.calls[0][0];
      expect(logCall).toContain('DEBUG');
      expect(logCall).toContain('Test debug message');
    });

    it('should not log debug messages when level is INFO', () => {
      // Create logger with INFO level
      (Logger as any).instance = undefined;
      const infoLogger = Logger.getInstance({
        level: LogLevel.INFO,
        enableConsole: true,
        enableFile: false,
        enableExternal: false
      });
      
      infoLogger.debug('Test debug message');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log application errors with enhanced context', () => {
      const appError = new AppError('Test app error', 400, ErrorCode.VALIDATION_ERROR, true, {
        field: 'username'
      });
      const context = { requestId: 'req123' };
      
      logger.logAppError(appError, context);
      
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('Test app error');
      expect(logCall).toContain('errorCode');
      expect(logCall).toContain('statusCode');
      expect(logCall).toContain('isOperational');
    });

    it('should log database errors with query context', () => {
      const dbError = new Error('Connection failed');
      const query = 'SELECT * FROM players';
      const params = ['user123'];
      
      logger.logDatabaseError(dbError, query, params, { table: 'players' });
      
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('Database operation failed');
      expect(logCall).toContain('query');
      expect(logCall).toContain('params');
      expect(logCall).toContain('table');
    });

    it('should log cache errors with operation context', () => {
      const cacheError = new Error('Redis connection failed');
      
      logger.logCacheError(cacheError, 'SET', 'player:123', { ttl: 3600 });
      
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('Cache operation failed');
      expect(logCall).toContain('operation');
      expect(logCall).toContain('key');
      expect(logCall).toContain('ttl');
    });

    it('should log API requests with appropriate level', () => {
      // Successful request
      logger.logApiRequest('GET', '/api/players', 200, 150, { userId: '123' });
      
      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      let logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('GET /api/players - 200 (150ms)');
      
      // Error request
      logger.logApiRequest('POST', '/api/players', 400, 50, { error: 'Validation failed' });
      
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('POST /api/players - 400 (50ms)');
    });

    it('should log performance metrics with appropriate level', () => {
      // Fast operation
      logger.logPerformance('database_query', 500, { table: 'players' });
      
      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      let logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('Performance: database_query took 500ms');
      
      // Slow operation
      logger.logPerformance('slow_query', 2000, { table: 'items' });
      
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      logCall = mockConsole.warn.mock.calls[0][0];
      expect(logCall).toContain('Performance: slow_query took 2000ms');
    });
  });

  describe('Log Formatting', () => {
    it('should include timestamp in log messages', () => {
      logger.info('Test message');
      
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('should pad log levels consistently', () => {
      logger.error('Error message');
      logger.warn('Warning message');
      logger.info('Info message');
      logger.debug('Debug message');
      
      const errorCall = mockConsole.error.mock.calls[0][0];
      const warnCall = mockConsole.warn.mock.calls[0][0];
      const infoCall = mockConsole.info.mock.calls[0][0];
      const debugCall = mockConsole.debug.mock.calls[0][0];
      
      expect(errorCall).toContain('ERROR');
      expect(warnCall).toContain('WARN ');
      expect(infoCall).toContain('INFO ');
      expect(debugCall).toContain('DEBUG');
    });

    it('should format context as JSON', () => {
      const context = {
        userId: '123',
        action: 'login',
        nested: { key: 'value' }
      };
      
      logger.info('Test message', context);
      
      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('Context:');
      expect(logCall).toContain('"userId": "123"');
      expect(logCall).toContain('"action": "login"');
      expect(logCall).toContain('"nested"');
    });

    it('should include error stack trace', () => {
      const error = new Error('Test error');
      
      logger.error('Error occurred', error);
      
      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('Error: Test error');
      expect(logCall).toContain('Stack:');
      expect(logCall).toContain('at ');
    });
  });

  describe('Configuration', () => {
    it('should get default logger configuration', () => {
      const config = getDefaultLoggerConfig();
      
      expect(config.level).toBeDefined();
      expect(config.enableConsole).toBe(true);
      expect(typeof config.enableFile).toBe('boolean');
      expect(typeof config.enableExternal).toBe('boolean');
    });

    it('should initialize logger with default config', () => {
      (Logger as any).instance = undefined;
      
      const logger = initializeLogger();
      
      expect(logger).toBeInstanceOf(Logger);
    });

    it('should initialize logger with custom config', () => {
      (Logger as any).instance = undefined;
      
      const customConfig = {
        level: LogLevel.WARN,
        enableConsole: false,
        enableFile: true,
        enableExternal: false
      };
      
      const logger = initializeLogger(customConfig);
      
      expect(logger).toBeInstanceOf(Logger);
    });
  });
});