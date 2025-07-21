// Health monitoring service for system health checks
import { getLogger } from '../shared/logger';
import { createHealthCheck, HealthCheckResult } from '../shared/errorUtils';
import { DatabaseConnection, database } from '../shared/database';
import { CacheService } from './CacheService';

export interface SystemHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    [key: string]: HealthCheckResult;
  };
  metrics: SystemMetrics;
}

export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  database: {
    connections: {
      active: number;
      idle: number;
      total: number;
    };
    queryTime: {
      average: number;
      p95: number;
      p99: number;
    };
  };
  cache: {
    hitRate: number;
    missRate: number;
    keyCount: number;
    memoryUsage: number;
  };
  api: {
    requestsPerSecond: number;
    averageResponseTime: number;
    errorRate: number;
  };
}

export class HealthService {
  private logger = getLogger();
  private healthChecks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private metrics: SystemMetrics;
  private startTime: Date;

  constructor(
    private databaseService?: DatabaseConnection,
    private cacheService?: CacheService
  ) {
    this.startTime = new Date();
    this.metrics = this.initializeMetrics();
    this.setupHealthChecks();
  }

  /**
   * Initialize system metrics with default values
   */
  private initializeMetrics(): SystemMetrics {
    return {
      memory: {
        used: 0,
        total: 0,
        percentage: 0
      },
      cpu: {
        usage: 0
      },
      database: {
        connections: {
          active: 0,
          idle: 0,
          total: 0
        },
        queryTime: {
          average: 0,
          p95: 0,
          p99: 0
        }
      },
      cache: {
        hitRate: 0,
        missRate: 0,
        keyCount: 0,
        memoryUsage: 0
      },
      api: {
        requestsPerSecond: 0,
        averageResponseTime: 0,
        errorRate: 0
      }
    };
  }

  /**
   * Set up health checks for various system components
   */
  private setupHealthChecks(): void {
    // Database health check
    if (this.databaseService) {
      this.healthChecks.set('database', createHealthCheck(
        'database',
        async () => {
          try {
            const result = await this.databaseService!.testConnection();
            return result.success;
          } catch (error) {
            return false;
          }
        },
        5000
      ));
    }

    // Cache health check
    if (this.cacheService) {
      this.healthChecks.set('cache', createHealthCheck(
        'cache',
        async () => {
          try {
            await this.cacheService!.set('health_check', 'ok', { ttl: 10 });
            const result = await this.cacheService!.get('health_check');
            return result === 'ok';
          } catch (error) {
            return false;
          }
        },
        3000
      ));
    }

    // Memory health check
    this.healthChecks.set('memory', createHealthCheck(
      'memory',
      async () => {
        const memUsage = process.memoryUsage();
        const totalMem = memUsage.heapTotal;
        const usedMem = memUsage.heapUsed;
        const memoryUsagePercentage = (usedMem / totalMem) * 100;
        
        // Consider unhealthy if memory usage is above 90%
        return memoryUsagePercentage < 90;
      },
      1000
    ));

    // Disk space health check
    this.healthChecks.set('disk', createHealthCheck(
      'disk',
      async () => {
        // In a real implementation, you would check actual disk usage
        // For now, we'll simulate a healthy disk
        return true;
      },
      2000
    ));

    // External services health check (placeholder)
    this.healthChecks.set('external_services', createHealthCheck(
      'external_services',
      async () => {
        // Check external dependencies like payment services, email services, etc.
        // For now, we'll simulate healthy external services
        return true;
      },
      5000
    ));
  }

  /**
   * Add a custom health check
   */
  public addHealthCheck(
    name: string,
    checkFn: () => Promise<boolean>,
    timeout = 5000
  ): void {
    this.healthChecks.set(name, createHealthCheck(name, checkFn, timeout));
    this.logger.info(`Added health check: ${name}`);
  }

  /**
   * Remove a health check
   */
  public removeHealthCheck(name: string): void {
    this.healthChecks.delete(name);
    this.logger.info(`Removed health check: ${name}`);
  }

  /**
   * Get comprehensive system health status
   */
  public async getSystemHealth(): Promise<SystemHealth> {
    const checks: { [key: string]: HealthCheckResult } = {};
    let overallStatus: 'healthy' | 'unhealthy' | 'degraded' = 'healthy';

    // Run all health checks in parallel
    const healthCheckPromises = Array.from(this.healthChecks.entries()).map(
      async ([name, checkFn]) => {
        try {
          const result = await checkFn();
          checks[name] = result;
          return result;
        } catch (error) {
          const errorResult: HealthCheckResult = {
            status: 'unhealthy',
            message: `Health check ${name} failed: ${(error as Error).message}`,
            timestamp: new Date()
          };
          checks[name] = errorResult;
          return errorResult;
        }
      }
    );

    const results = await Promise.all(healthCheckPromises);

    // Determine overall status
    const unhealthyCount = results.filter(r => r.status === 'unhealthy').length;
    const degradedCount = results.filter(r => r.status === 'degraded').length;

    if (unhealthyCount > 0) {
      overallStatus = unhealthyCount > results.length / 2 ? 'unhealthy' : 'degraded';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    // Update metrics
    await this.updateMetrics();

    const systemHealth: SystemHealth = {
      status: overallStatus,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
      metrics: this.metrics
    };

    // Log health status
    this.logger.info('System health check completed', {
      status: overallStatus,
      checksCount: Object.keys(checks).length,
      unhealthyCount,
      degradedCount
    });

    return systemHealth;
  }

  /**
   * Get quick health status (lightweight check)
   */
  public async getQuickHealth(): Promise<{ status: string; timestamp: Date; uptime: number }> {
    return {
      status: 'healthy', // Quick check assumes healthy unless critical issues
      timestamp: new Date(),
      uptime: Date.now() - this.startTime.getTime()
    };
  }

  /**
   * Update system metrics
   */
  private async updateMetrics(): Promise<void> {
    try {
      // Memory metrics
      const memUsage = process.memoryUsage();
      this.metrics.memory = {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100
      };

      // CPU metrics (simplified - in production you'd use a proper CPU monitoring library)
      this.metrics.cpu = {
        usage: process.cpuUsage().user / 1000000 // Convert to seconds
      };

      // Database metrics
      if (this.databaseService) {
        // In a real implementation, you would get actual connection pool stats
        this.metrics.database = {
          connections: {
            active: 5, // Placeholder
            idle: 10,  // Placeholder
            total: 15  // Placeholder
          },
          queryTime: {
            average: 50,  // Placeholder
            p95: 100,     // Placeholder
            p99: 200      // Placeholder
          }
        };
      }

      // Cache metrics
      if (this.cacheService) {
        // In a real implementation, you would get actual cache stats
        this.metrics.cache = {
          hitRate: 0.85,      // Placeholder
          missRate: 0.15,     // Placeholder
          keyCount: 1000,     // Placeholder
          memoryUsage: 50000  // Placeholder
        };
      }

      // API metrics would be updated by middleware
      // This is just initialization
      this.metrics.api = {
        requestsPerSecond: 0,
        averageResponseTime: 0,
        errorRate: 0
      };

    } catch (error) {
      this.logger.error('Failed to update metrics', error as Error);
    }
  }

  /**
   * Update API metrics (called by middleware)
   */
  public updateApiMetrics(metrics: Partial<SystemMetrics['api']>): void {
    this.metrics.api = {
      ...this.metrics.api,
      ...metrics
    };
  }

  /**
   * Get current metrics
   */
  public getMetrics(): SystemMetrics {
    return { ...this.metrics };
  }

  /**
   * Start periodic health monitoring
   */
  public startMonitoring(intervalMs = 60000): void {
    setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        
        if (health.status !== 'healthy') {
          this.logger.warn('System health degraded', {
            status: health.status,
            unhealthyChecks: Object.entries(health.checks)
              .filter(([_, check]) => check.status === 'unhealthy')
              .map(([name, _]) => name)
          });
        }
      } catch (error) {
        this.logger.error('Health monitoring failed', error as Error);
      }
    }, intervalMs);

    this.logger.info(`Started health monitoring with ${intervalMs}ms interval`);
  }

  /**
   * Get system information
   */
  public getSystemInfo(): {
    nodeVersion: string;
    platform: string;
    arch: string;
    pid: number;
    uptime: number;
  } {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime()
    };
  }
}