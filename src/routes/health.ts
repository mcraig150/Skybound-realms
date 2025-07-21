// Health check and monitoring endpoints
import { Router, Request, Response } from 'express';
import { HealthService } from '../services/HealthService';
import { MetricsService } from '../services/MetricsService';
import { asyncHandler } from '../middleware/errorHandler';
import { getLogger } from '../shared/logger';

const router = Router();
const logger = getLogger();

// Initialize services (these would typically be injected via DI)
let healthService: HealthService;
let metricsService: MetricsService;

// Initialize services
export const initializeHealthRoutes = (
  healthSvc: HealthService,
  metricsSvc: MetricsService
) => {
  healthService = healthSvc;
  metricsService = metricsSvc;
};

/**
 * Quick health check endpoint
 * GET /health
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const quickHealth = await healthService.getQuickHealth();
  
  res.status(200).json({
    success: true,
    data: quickHealth,
    timestamp: new Date().toISOString()
  });
}));

/**
 * Detailed health check endpoint
 * GET /health/detailed
 */
router.get('/detailed', asyncHandler(async (req: Request, res: Response) => {
  const systemHealth = await healthService.getSystemHealth();
  
  const statusCode = systemHealth.status === 'healthy' ? 200 : 
                    systemHealth.status === 'degraded' ? 200 : 503;
  
  res.status(statusCode).json({
    success: systemHealth.status !== 'unhealthy',
    data: systemHealth,
    timestamp: new Date().toISOString()
  });
}));

/**
 * Readiness probe endpoint (for Kubernetes)
 * GET /health/ready
 */
router.get('/ready', asyncHandler(async (req: Request, res: Response) => {
  const systemHealth = await healthService.getSystemHealth();
  
  if (systemHealth.status === 'unhealthy') {
    return res.status(503).json({
      success: false,
      error: 'Service not ready',
      status: systemHealth.status,
      timestamp: new Date().toISOString()
    });
  }
  
  return res.status(200).json({
    success: true,
    data: {
      status: 'ready',
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * Liveness probe endpoint (for Kubernetes)
 * GET /health/live
 */
router.get('/live', asyncHandler(async (req: Request, res: Response) => {
  // Simple liveness check - if the server can respond, it's alive
  res.status(200).json({
    success: true,
    data: {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    }
  });
}));

/**
 * System information endpoint
 * GET /health/info
 */
router.get('/info', asyncHandler(async (req: Request, res: Response) => {
  const systemInfo = healthService.getSystemInfo();
  
  res.status(200).json({
    success: true,
    data: {
      ...systemInfo,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development'
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * Metrics endpoint
 * GET /health/metrics
 */
router.get('/metrics', asyncHandler(async (req: Request, res: Response) => {
  const format = req.query.format as string;
  
  if (format === 'prometheus') {
    const prometheusMetrics = metricsService.exportPrometheusMetrics();
    res.set('Content-Type', 'text/plain');
    res.status(200).send(prometheusMetrics);
  } else {
    const metricsSummary = metricsService.getMetricsSummary();
    res.status(200).json({
      success: true,
      data: metricsSummary,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * Specific metric endpoint
 * GET /health/metrics/:metricName
 */
router.get('/metrics/:metricName', asyncHandler(async (req: Request, res: Response) => {
  const { metricName } = req.params;
  const { start, end } = req.query;
  
  const startTime = start ? new Date(start as string) : undefined;
  const endTime = end ? new Date(end as string) : undefined;
  
  const metricPoints = metricsService.getMetricPoints(startTime, endTime, metricName);
  
  if (metricPoints.length === 0) {
    return res.status(404).json({
      success: false,
      error: `Metric '${metricName}' not found or no data available`,
      timestamp: new Date().toISOString()
    });
  }
  
  return res.status(200).json({
    success: true,
    data: {
      metric: metricName,
      points: metricPoints,
      count: metricPoints.length
    },
    timestamp: new Date().toISOString()
  });
}));

/**
 * Performance dashboard data endpoint
 * GET /health/dashboard
 */
router.get('/dashboard', asyncHandler(async (req: Request, res: Response) => {
  const [systemHealth, metricsSummary] = await Promise.all([
    healthService.getSystemHealth(),
    Promise.resolve(metricsService.getMetricsSummary())
  ]);
  
  const dashboardData = {
    health: {
      status: systemHealth.status,
      uptime: systemHealth.uptime,
      checks: Object.keys(systemHealth.checks).length,
      unhealthyChecks: Object.entries(systemHealth.checks)
        .filter(([_, check]) => check.status === 'unhealthy')
        .map(([name, _]) => name)
    },
    metrics: {
      api: {
        totalRequests: metricsSummary.counters['api_requests_total'] || 0,
        totalErrors: metricsSummary.counters['api_errors_total'] || 0,
        errorRate: calculateErrorRate(
          metricsSummary.counters['api_requests_total'] || 0,
          metricsSummary.counters['api_errors_total'] || 0
        ),
        averageResponseTime: metricsSummary.timers['api_request_duration']?.average || 0
      },
      database: {
        totalQueries: metricsSummary.counters['db_queries_total'] || 0,
        totalErrors: metricsSummary.counters['db_errors_total'] || 0,
        activeConnections: metricsSummary.gauges['db_connections_active'] || 0,
        averageQueryTime: metricsSummary.timers['db_query_duration']?.average || 0
      },
      cache: {
        hits: metricsSummary.counters['cache_hits_total'] || 0,
        misses: metricsSummary.counters['cache_misses_total'] || 0,
        hitRate: calculateHitRate(
          metricsSummary.counters['cache_hits_total'] || 0,
          metricsSummary.counters['cache_misses_total'] || 0
        )
      },
      system: {
        memoryUsage: metricsSummary.gauges['memory_usage_bytes'] || 0,
        cpuUsage: metricsSummary.gauges['cpu_usage_percent'] || 0
      }
    },
    timestamp: new Date().toISOString()
  };
  
  res.status(200).json({
    success: true,
    data: dashboardData,
    timestamp: new Date().toISOString()
  });
}));

/**
 * Reset metrics endpoint (for testing/debugging)
 * POST /health/metrics/reset
 */
router.post('/metrics/reset', asyncHandler(async (req: Request, res: Response) => {
  // Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({
      success: false,
      error: 'Metrics reset not allowed in production',
      timestamp: new Date().toISOString()
    });
  }
  
  metricsService.resetAllMetrics();
  
  logger.info('Metrics reset via API endpoint', {
    requestId: req.requestId,
    userId: req.userId
  });
  
  return res.status(200).json({
    success: true,
    data: {
      message: 'All metrics have been reset'
    },
    timestamp: new Date().toISOString()
  });
}));

// Helper functions
function calculateErrorRate(totalRequests: number, totalErrors: number): number {
  if (totalRequests === 0) return 0;
  return (totalErrors / totalRequests) * 100;
}

function calculateHitRate(hits: number, misses: number): number {
  const total = hits + misses;
  if (total === 0) return 0;
  return (hits / total) * 100;
}

export default router;