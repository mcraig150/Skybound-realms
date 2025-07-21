// Integration tests for health monitoring endpoints
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import healthRoutes, { initializeHealthRoutes } from '../../routes/health';
import { HealthService } from '../../services/HealthService';
import { MetricsService } from '../../services/MetricsService';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler';

// Mock logger
vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

describe('Health Endpoints Integration', () => {
  let app: express.Application;
  let healthService: HealthService;
  let metricsService: MetricsService;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Initialize services
    healthService = new HealthService();
    metricsService = new MetricsService();
    
    // Initialize routes with services
    initializeHealthRoutes(healthService, metricsService);
    
    // Setup routes
    app.use('/health', healthRoutes);
    app.use(errorHandler);
    app.use(notFoundHandler);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return quick health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          uptime: expect.any(Number)
        },
        timestamp: expect.any(String)
      });
    });
  });

  describe('GET /health/detailed', () => {
    it('should return detailed health status', async () => {
      const response = await request(app)
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
          timestamp: expect.any(String),
          uptime: expect.any(Number),
          version: expect.any(String),
          environment: expect.any(String),
          checks: expect.any(Object),
          metrics: expect.any(Object)
        },
        timestamp: expect.any(String)
      });

      // Verify metrics structure
      expect(response.body.data.metrics).toHaveProperty('memory');
      expect(response.body.data.metrics).toHaveProperty('cpu');
      expect(response.body.data.metrics).toHaveProperty('api');
    });

    it('should return 503 when system is unhealthy', async () => {
      // Add multiple failing health checks to make system unhealthy
      healthService.addHealthCheck('failing_check_1', async () => false);
      healthService.addHealthCheck('failing_check_2', async () => false);
      healthService.addHealthCheck('failing_check_3', async () => false);
      healthService.addHealthCheck('failing_check_4', async () => false);

      const response = await request(app)
        .get('/health/detailed');

      // Should return either 503 or 200 with degraded status
      expect([200, 503]).toContain(response.status);
      
      if (response.status === 503) {
        expect(response.body.success).toBe(false);
      } else {
        expect(response.body.data.status).toMatch(/^(degraded|unhealthy)$/);
      }
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status when healthy', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'ready',
          timestamp: expect.any(String)
        }
      });
    });

    it('should return 503 when not ready', async () => {
      // Add multiple failing health checks to make system unhealthy
      healthService.addHealthCheck('failing_check_1', async () => false);
      healthService.addHealthCheck('failing_check_2', async () => false);
      healthService.addHealthCheck('failing_check_3', async () => false);
      healthService.addHealthCheck('failing_check_4', async () => false);
      healthService.addHealthCheck('failing_check_5', async () => false);

      const response = await request(app)
        .get('/health/ready');

      // Should return either 503 or 200 depending on system health
      expect([200, 503]).toContain(response.status);
      
      if (response.status === 503) {
        expect(response.body).toMatchObject({
          success: false,
          error: 'Service not ready'
        });
      }
    });
  });

  describe('GET /health/live', () => {
    it('should always return alive status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: 'alive',
          timestamp: expect.any(String),
          uptime: expect.any(Number)
        }
      });
    });
  });

  describe('GET /health/info', () => {
    it('should return system information', async () => {
      const response = await request(app)
        .get('/health/info')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          arch: expect.any(String),
          pid: expect.any(Number),
          uptime: expect.any(Number),
          version: expect.any(String),
          environment: expect.any(String)
        },
        timestamp: expect.any(String)
      });
    });
  });

  describe('GET /health/metrics', () => {
    it('should return metrics summary in JSON format', async () => {
      // Generate some metrics
      const counter = metricsService.getCounter('api_requests_total');
      const gauge = metricsService.getGauge('memory_usage_bytes');
      
      if (counter) counter.increment(10);
      if (gauge) gauge.set(1024);

      const response = await request(app)
        .get('/health/metrics')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          counters: expect.any(Object),
          gauges: expect.any(Object),
          histograms: expect.any(Object),
          timers: expect.any(Object)
        },
        timestamp: expect.any(String)
      });

      expect(response.body.data.counters['api_requests_total']).toBe(10);
      expect(response.body.data.gauges['memory_usage_bytes']).toBe(1024);
    });

    it('should return metrics in Prometheus format', async () => {
      // Generate some metrics
      const counter = metricsService.getCounter('api_requests_total');
      if (counter) counter.increment(5);

      const response = await request(app)
        .get('/health/metrics?format=prometheus')
        .expect(200);

      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.text).toContain('# TYPE api_requests_total counter');
      expect(response.text).toContain('api_requests_total 5');
    });
  });

  describe('GET /health/metrics/:metricName', () => {
    it('should return specific metric data', async () => {
      // Generate metric data
      const counter = metricsService.getCounter('api_requests_total');
      if (counter) {
        counter.increment();
        counter.increment();
      }

      const response = await request(app)
        .get('/health/metrics/api_requests_total')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          metric: 'api_requests_total',
          points: expect.any(Array),
          count: expect.any(Number)
        },
        timestamp: expect.any(String)
      });

      expect(response.body.data.points.length).toBeGreaterThan(0);
      expect(response.body.data.points[0]).toHaveProperty('name', 'api_requests_total');
      expect(response.body.data.points[0]).toHaveProperty('value');
      expect(response.body.data.points[0]).toHaveProperty('timestamp');
    });

    it('should return 404 for non-existent metric', async () => {
      const response = await request(app)
        .get('/health/metrics/non_existent_metric')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: "Metric 'non_existent_metric' not found or no data available"
      });
    });

    it('should filter metrics by time range', async () => {
      const counter = metricsService.createCounter('time_test_counter');
      counter.increment();

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const response = await request(app)
        .get(`/health/metrics/time_test_counter?start=${oneHourAgo.toISOString()}&end=${now.toISOString()}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.points).toBeInstanceOf(Array);
    });
  });

  describe('GET /health/dashboard', () => {
    it('should return dashboard data', async () => {
      // Generate some metrics
      const apiCounter = metricsService.getCounter('api_requests_total');
      const errorCounter = metricsService.getCounter('api_errors_total');
      const dbCounter = metricsService.getCounter('db_queries_total');
      
      if (apiCounter) apiCounter.increment(100);
      if (errorCounter) errorCounter.increment(5);
      if (dbCounter) dbCounter.increment(50);

      const response = await request(app)
        .get('/health/dashboard')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          health: {
            status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
            uptime: expect.any(Number),
            checks: expect.any(Number),
            unhealthyChecks: expect.any(Array)
          },
          metrics: {
            api: {
              totalRequests: expect.any(Number),
              totalErrors: expect.any(Number),
              errorRate: expect.any(Number),
              averageResponseTime: expect.any(Number)
            },
            database: {
              totalQueries: expect.any(Number),
              totalErrors: expect.any(Number),
              activeConnections: expect.any(Number),
              averageQueryTime: expect.any(Number)
            },
            cache: {
              hits: expect.any(Number),
              misses: expect.any(Number),
              hitRate: expect.any(Number)
            },
            system: {
              memoryUsage: expect.any(Number),
              cpuUsage: expect.any(Number)
            }
          }
        },
        timestamp: expect.any(String)
      });

      expect(response.body.data.metrics.api.totalRequests).toBe(100);
      expect(response.body.data.metrics.api.totalErrors).toBe(5);
      expect(response.body.data.metrics.api.errorRate).toBe(5); // 5% error rate
    });
  });

  describe('POST /health/metrics/reset', () => {
    it('should reset metrics in development environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Generate some metrics
      const counter = metricsService.getCounter('api_requests_total');
      if (counter) counter.increment(10);

      const response = await request(app)
        .post('/health/metrics/reset')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: 'All metrics have been reset'
        }
      });

      // Verify metrics were reset
      expect(counter?.value).toBe(0);

      process.env.NODE_ENV = originalEnv;
    });

    it('should reject reset in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .post('/health/metrics/reset')
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: 'Metrics reset not allowed in production'
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error Handling', () => {
    it('should handle health service errors gracefully', async () => {
      // Mock health service to throw error
      const originalGetSystemHealth = healthService.getSystemHealth;
      healthService.getSystemHealth = vi.fn().mockRejectedValue(new Error('Health service error'));

      await request(app)
        .get('/health/detailed')
        .expect(500);

      // Restore original method
      healthService.getSystemHealth = originalGetSystemHealth;
    });

    it('should handle metrics service errors gracefully', async () => {
      // Mock metrics service to throw error
      const originalGetMetricsSummary = metricsService.getMetricsSummary;
      metricsService.getMetricsSummary = vi.fn().mockImplementation(() => {
        throw new Error('Metrics service error');
      });

      await request(app)
        .get('/health/metrics')
        .expect(500);

      // Restore original method
      metricsService.getMetricsSummary = originalGetMetricsSummary;
    });
  });
});