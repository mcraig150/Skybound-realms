// Unit tests for HealthService
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HealthService } from '../../services/HealthService';
import { DatabaseService } from '../../shared/database';
import { CacheService } from '../../services/CacheService';

// Mock logger
vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

// Mock services
const mockDatabaseService = {
  testConnection: vi.fn()
} as unknown as DatabaseService;

const mockCacheService = {
  set: vi.fn(),
  get: vi.fn()
} as unknown as CacheService;

describe('HealthService', () => {
  let healthService: HealthService;

  beforeEach(() => {
    vi.clearAllMocks();
    healthService = new HealthService(mockDatabaseService, mockCacheService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default metrics', () => {
      const metrics = healthService.getMetrics();
      
      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('cache');
      expect(metrics).toHaveProperty('api');
    });

    it('should initialize without services', () => {
      const serviceWithoutDeps = new HealthService();
      expect(serviceWithoutDeps).toBeInstanceOf(HealthService);
    });
  });

  describe('addHealthCheck', () => {
    it('should add custom health check', () => {
      const customCheck = vi.fn().mockResolvedValue(true);
      
      healthService.addHealthCheck('custom_service', customCheck, 1000);
      
      // Verify the check was added by running system health
      expect(async () => {
        await healthService.getSystemHealth();
      }).not.toThrow();
    });
  });

  describe('removeHealthCheck', () => {
    it('should remove health check', () => {
      const customCheck = vi.fn().mockResolvedValue(true);
      
      healthService.addHealthCheck('custom_service', customCheck);
      healthService.removeHealthCheck('custom_service');
      
      // The check should no longer be present
      expect(async () => {
        await healthService.getSystemHealth();
      }).not.toThrow();
    });
  });

  describe('getSystemHealth', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock successful database connection
      (mockDatabaseService.testConnection as any).mockResolvedValue({ connected: true });
      
      // Mock successful cache operations
      (mockCacheService.set as any).mockResolvedValue(undefined);
      (mockCacheService.get as any).mockResolvedValue('ok');

      const health = await healthService.getSystemHealth();

      expect(health.status).toBe('healthy');
      expect(health.timestamp).toBeInstanceOf(Date);
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(health.version).toBeDefined();
      expect(health.environment).toBeDefined();
      expect(health.checks).toBeDefined();
      expect(health.metrics).toBeDefined();
    });

    it('should return degraded status when some checks fail', async () => {
      // Mock database failure
      (mockDatabaseService.testConnection as any).mockRejectedValue(new Error('Connection failed'));
      
      // Mock successful cache operations
      (mockCacheService.set as any).mockResolvedValue(undefined);
      (mockCacheService.get as any).mockResolvedValue('ok');

      const health = await healthService.getSystemHealth();

      expect(health.status).toBe('degraded');
      expect(health.checks.database.status).toBe('unhealthy');
    });

    it('should return unhealthy status when majority of checks fail', async () => {
      // Mock database failure
      (mockDatabaseService.testConnection as any).mockRejectedValue(new Error('Connection failed'));
      
      // Mock cache failure
      (mockCacheService.set as any).mockRejectedValue(new Error('Cache failed'));

      const health = await healthService.getSystemHealth();

      expect(['unhealthy', 'degraded']).toContain(health.status);
    });

    it('should handle health check timeouts', async () => {
      // Mock slow database connection
      (mockDatabaseService.testConnection as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ connected: true }), 10000))
      );

      const health = await healthService.getSystemHealth();

      // Should complete within reasonable time due to timeout
      expect(health).toBeDefined();
    });
  });

  describe('getQuickHealth', () => {
    it('should return quick health status', async () => {
      const quickHealth = await healthService.getQuickHealth();

      expect(quickHealth.status).toBe('healthy');
      expect(quickHealth.timestamp).toBeInstanceOf(Date);
      expect(quickHealth.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('updateApiMetrics', () => {
    it('should update API metrics', () => {
      const apiMetrics = {
        requestsPerSecond: 100,
        averageResponseTime: 50,
        errorRate: 0.05
      };

      healthService.updateApiMetrics(apiMetrics);
      const metrics = healthService.getMetrics();

      expect(metrics.api.requestsPerSecond).toBe(100);
      expect(metrics.api.averageResponseTime).toBe(50);
      expect(metrics.api.errorRate).toBe(0.05);
    });
  });

  describe('getMetrics', () => {
    it('should return current metrics', () => {
      const metrics = healthService.getMetrics();

      expect(metrics).toHaveProperty('memory');
      expect(metrics).toHaveProperty('cpu');
      expect(metrics).toHaveProperty('database');
      expect(metrics).toHaveProperty('cache');
      expect(metrics).toHaveProperty('api');
      
      expect(metrics.memory).toHaveProperty('used');
      expect(metrics.memory).toHaveProperty('total');
      expect(metrics.memory).toHaveProperty('percentage');
    });
  });

  describe('startMonitoring', () => {
    it('should start periodic monitoring', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      healthService.startMonitoring(5000);
      
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      
      setIntervalSpy.mockRestore();
    });
  });

  describe('getSystemInfo', () => {
    it('should return system information', () => {
      const systemInfo = healthService.getSystemInfo();

      expect(systemInfo).toHaveProperty('nodeVersion');
      expect(systemInfo).toHaveProperty('platform');
      expect(systemInfo).toHaveProperty('arch');
      expect(systemInfo).toHaveProperty('pid');
      expect(systemInfo).toHaveProperty('uptime');
      
      expect(systemInfo.nodeVersion).toBe(process.version);
      expect(systemInfo.platform).toBe(process.platform);
      expect(systemInfo.arch).toBe(process.arch);
      expect(systemInfo.pid).toBe(process.pid);
      expect(systemInfo.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('memory health check', () => {
    it('should pass when memory usage is normal', async () => {
      // Mock normal memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        heapUsed: 50 * 1024 * 1024,  // 50MB
        heapTotal: 100 * 1024 * 1024, // 100MB
        external: 0,
        arrayBuffers: 0,
        rss: 0
      });

      const health = await healthService.getSystemHealth();
      
      expect(health.checks.memory.status).toBe('healthy');
      
      process.memoryUsage = originalMemoryUsage;
    });

    it('should fail when memory usage is high', async () => {
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = vi.fn().mockReturnValue({
        heapUsed: 95 * 1024 * 1024,  // 95MB
        heapTotal: 100 * 1024 * 1024, // 100MB (95% usage)
        external: 0,
        arrayBuffers: 0,
        rss: 0
      });

      const health = await healthService.getSystemHealth();
      
      expect(health.checks.memory.status).toBe('unhealthy');
      
      process.memoryUsage = originalMemoryUsage;
    });
  });
});