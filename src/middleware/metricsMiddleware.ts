// Middleware for collecting API metrics
import { Request, Response, NextFunction } from 'express';
import { MetricsService } from '../services/MetricsService';
import { getLogger } from '../shared/logger';

export class MetricsMiddleware {
  private logger = getLogger();
  private requestsPerSecondWindow: number[] = [];
  private windowSize = 60; // 60 seconds
  private lastWindowUpdate = Date.now();

  constructor(private metricsService: MetricsService) {}

  /**
   * Middleware to collect API request metrics
   */
  public collectApiMetrics = (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Get metrics
    const requestsCounter = this.metricsService.getCounter('api_requests_total');
    const requestTimer = this.metricsService.getTimer('api_request_duration');
    
    // Increment request counter
    if (requestsCounter) {
      requestsCounter.increment();
    }

    // Track requests per second
    this.updateRequestsPerSecond();

    // Override res.end to capture response metrics
    const originalEnd = res.end.bind(res);
    const metricsService = this.metricsService;
    const logger = this.logger;
    
    res.end = function(this: Response, ...args: any[]) {
      const duration = Date.now() - startTime;
      
      // Record request duration
      if (requestTimer) {
        requestTimer.record(duration);
      }

      // Track errors
      if (res.statusCode >= 400) {
        const errorsCounter = metricsService.getCounter('api_errors_total');
        if (errorsCounter) {
          errorsCounter.increment();
        }
      }

      // Log slow requests
      if (duration > 1000) {
        logger.warn('Slow API request detected', {
          method: req.method,
          path: req.path,
          duration,
          statusCode: res.statusCode,
          requestId: req.requestId
        });
      }

      // Call original end method
      return originalEnd(...args);
    };

    next();
  };

  /**
   * Update requests per second calculation
   */
  private updateRequestsPerSecond(): void {
    const now = Date.now();
    const secondsSinceLastUpdate = Math.floor((now - this.lastWindowUpdate) / 1000);

    if (secondsSinceLastUpdate >= 1) {
      // Add current second's request count
      this.requestsPerSecondWindow.push(1);
      
      // Remove old entries (keep only last 60 seconds)
      if (this.requestsPerSecondWindow.length > this.windowSize) {
        this.requestsPerSecondWindow = this.requestsPerSecondWindow.slice(-this.windowSize);
      }
      
      this.lastWindowUpdate = now;
    } else {
      // Increment current second's count
      if (this.requestsPerSecondWindow.length > 0) {
        const lastIndex = this.requestsPerSecondWindow.length - 1;
        this.requestsPerSecondWindow[lastIndex] = (this.requestsPerSecondWindow[lastIndex] || 0) + 1;
      } else {
        this.requestsPerSecondWindow.push(1);
      }
    }

    // Update RPS gauge
    const rpsGauge = this.metricsService.getGauge('api_requests_per_second');
    if (rpsGauge) {
      const averageRps = this.requestsPerSecondWindow.length > 0 
        ? this.requestsPerSecondWindow.reduce((sum, count) => sum + count, 0) / this.requestsPerSecondWindow.length
        : 0;
      rpsGauge.set(averageRps);
    }
  }

  /**
   * Middleware to collect database query metrics
   */
  public static collectDatabaseMetrics = (metricsService: MetricsService) => {
    return {
      beforeQuery: (query: string) => {
        const queriesCounter = metricsService.getCounter('db_queries_total');
        const queryTimer = metricsService.getTimer('db_query_duration');
        
        if (queriesCounter) {
          queriesCounter.increment();
        }

        const stopTimer = queryTimer ? queryTimer.start() : () => {};
        
        return {
          stopTimer,
          query
        };
      },
      
      afterQuery: (context: { stopTimer: () => void; query: string }, error?: Error) => {
        context.stopTimer();
        
        if (error) {
          const errorsCounter = metricsService.getCounter('db_errors_total');
          if (errorsCounter) {
            errorsCounter.increment();
          }
        }
      }
    };
  };

  /**
   * Middleware to collect cache operation metrics
   */
  public static collectCacheMetrics = (metricsService: MetricsService) => {
    return {
      onHit: (key: string) => {
        const hitsCounter = metricsService.getCounter('cache_hits_total');
        if (hitsCounter) {
          hitsCounter.increment();
        }
      },
      
      onMiss: (key: string) => {
        const missesCounter = metricsService.getCounter('cache_misses_total');
        if (missesCounter) {
          missesCounter.increment();
        }
      },
      
      onOperation: (operation: string, duration: number) => {
        const operationTimer = metricsService.getTimer('cache_operation_duration');
        if (operationTimer) {
          operationTimer.record(duration);
        }
      }
    };
  };

  /**
   * Middleware to collect game-specific metrics
   */
  public static collectGameMetrics = (metricsService: MetricsService) => {
    return {
      onPlayerLogin: (playerId: string) => {
        const playersGauge = metricsService.getGauge('players_online');
        if (playersGauge) {
          playersGauge.increment();
        }
      },
      
      onPlayerLogout: (playerId: string, sessionDuration: number) => {
        const playersGauge = metricsService.getGauge('players_online');
        const sessionHistogram = metricsService.getHistogram('player_session_duration');
        
        if (playersGauge) {
          playersGauge.decrement();
        }
        
        if (sessionHistogram) {
          sessionHistogram.record(sessionDuration);
        }
      },
      
      onGameAction: (action: string, playerId: string) => {
        const actionsCounter = metricsService.getCounter('game_actions_total');
        if (actionsCounter) {
          actionsCounter.increment();
        }
      }
    };
  };
}

/**
 * Create metrics middleware instance
 */
export const createMetricsMiddleware = (metricsService: MetricsService): MetricsMiddleware => {
  return new MetricsMiddleware(metricsService);
};

/**
 * Middleware to add additional metrics to gauges
 */
export const createMetricsCollector = (metricsService: MetricsService) => {
  // Create additional gauges for RPS tracking
  metricsService.createGauge('api_requests_per_second', 'API requests per second');
  
  return {
    api: new MetricsMiddleware(metricsService),
    database: MetricsMiddleware.collectDatabaseMetrics(metricsService),
    cache: MetricsMiddleware.collectCacheMetrics(metricsService),
    game: MetricsMiddleware.collectGameMetrics(metricsService)
  };
};