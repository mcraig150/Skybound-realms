// Metrics collection and reporting service
import { getLogger } from '../shared/logger';

export interface MetricPoint {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface CounterMetric {
  name: string;
  value: number;
  increment: (amount?: number) => void;
  reset: () => void;
}

export interface GaugeMetric {
  name: string;
  value: number;
  set: (value: number) => void;
  increment: (amount?: number) => void;
  decrement: (amount?: number) => void;
}

export interface HistogramMetric {
  name: string;
  values: number[];
  record: (value: number) => void;
  getPercentile: (percentile: number) => number;
  getAverage: () => number;
  getCount: () => number;
  reset: () => void;
}

export interface TimerMetric {
  name: string;
  start: () => () => void; // Returns a function to stop the timer
  record: (duration: number) => void;
  getStats: () => {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
    p99: number;
  };
}

export class MetricsService {
  private logger = getLogger();
  private counters: Map<string, CounterMetric> = new Map();
  private gauges: Map<string, GaugeMetric> = new Map();
  private histograms: Map<string, HistogramMetric> = new Map();
  private timers: Map<string, TimerMetric> = new Map();
  private metricPoints: MetricPoint[] = [];
  private maxMetricPoints = 10000; // Limit memory usage

  constructor() {
    this.setupDefaultMetrics();
  }

  /**
   * Set up default system metrics
   */
  private setupDefaultMetrics(): void {
    // API metrics
    this.createCounter('api_requests_total', 'Total number of API requests');
    this.createCounter('api_errors_total', 'Total number of API errors');
    this.createTimer('api_request_duration', 'API request duration');
    
    // Database metrics
    this.createCounter('db_queries_total', 'Total number of database queries');
    this.createCounter('db_errors_total', 'Total number of database errors');
    this.createTimer('db_query_duration', 'Database query duration');
    this.createGauge('db_connections_active', 'Active database connections');
    
    // Cache metrics
    this.createCounter('cache_hits_total', 'Total cache hits');
    this.createCounter('cache_misses_total', 'Total cache misses');
    this.createTimer('cache_operation_duration', 'Cache operation duration');
    
    // Game-specific metrics
    this.createCounter('players_online', 'Number of online players');
    this.createCounter('game_actions_total', 'Total game actions performed');
    this.createHistogram('player_session_duration', 'Player session duration');
    
    // System metrics
    this.createGauge('memory_usage_bytes', 'Memory usage in bytes');
    this.createGauge('cpu_usage_percent', 'CPU usage percentage');
  }

  /**
   * Create a counter metric
   */
  public createCounter(name: string, description?: string): CounterMetric {
    if (this.counters.has(name)) {
      return this.counters.get(name)!;
    }

    const counter: CounterMetric = {
      name,
      value: 0,
      increment: (amount = 1) => {
        counter.value += amount;
        this.recordMetricPoint(name, counter.value, { type: 'counter' });
      },
      reset: () => {
        counter.value = 0;
        this.recordMetricPoint(name, counter.value, { type: 'counter', action: 'reset' });
      }
    };

    this.counters.set(name, counter);
    this.logger.debug(`Created counter metric: ${name}`, { description });
    return counter;
  }

  /**
   * Create a gauge metric
   */
  public createGauge(name: string, description?: string): GaugeMetric {
    if (this.gauges.has(name)) {
      return this.gauges.get(name)!;
    }

    const gauge: GaugeMetric = {
      name,
      value: 0,
      set: (value: number) => {
        gauge.value = value;
        this.recordMetricPoint(name, gauge.value, { type: 'gauge' });
      },
      increment: (amount = 1) => {
        gauge.value += amount;
        this.recordMetricPoint(name, gauge.value, { type: 'gauge', action: 'increment' });
      },
      decrement: (amount = 1) => {
        gauge.value -= amount;
        this.recordMetricPoint(name, gauge.value, { type: 'gauge', action: 'decrement' });
      }
    };

    this.gauges.set(name, gauge);
    this.logger.debug(`Created gauge metric: ${name}`, { description });
    return gauge;
  }

  /**
   * Create a histogram metric
   */
  public createHistogram(name: string, description?: string): HistogramMetric {
    if (this.histograms.has(name)) {
      return this.histograms.get(name)!;
    }

    const histogram: HistogramMetric = {
      name,
      values: [],
      record: (value: number) => {
        histogram.values.push(value);
        // Keep only last 1000 values to prevent memory issues
        if (histogram.values.length > 1000) {
          histogram.values = histogram.values.slice(-1000);
        }
        this.recordMetricPoint(name, value, { type: 'histogram' });
      },
      getPercentile: (percentile: number) => {
        if (histogram.values.length === 0) return 0;
        const sorted = [...histogram.values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)] || 0;
      },
      getAverage: () => {
        if (histogram.values.length === 0) return 0;
        return histogram.values.reduce((sum, val) => sum + val, 0) / histogram.values.length;
      },
      getCount: () => histogram.values.length,
      reset: () => {
        histogram.values = [];
        this.recordMetricPoint(name, 0, { type: 'histogram', action: 'reset' });
      }
    };

    this.histograms.set(name, histogram);
    this.logger.debug(`Created histogram metric: ${name}`, { description });
    return histogram;
  }

  /**
   * Create a timer metric
   */
  public createTimer(name: string, description?: string): TimerMetric {
    if (this.timers.has(name)) {
      return this.timers.get(name)!;
    }

    const durations: number[] = [];

    const timer: TimerMetric = {
      name,
      start: () => {
        const startTime = Date.now();
        return () => {
          const duration = Date.now() - startTime;
          timer.record(duration);
        };
      },
      record: (duration: number) => {
        durations.push(duration);
        // Keep only last 1000 measurements
        if (durations.length > 1000) {
          durations.splice(0, durations.length - 1000);
        }
        this.recordMetricPoint(name, duration, { type: 'timer' });
      },
      getStats: () => {
        if (durations.length === 0) {
          return { count: 0, average: 0, min: 0, max: 0, p95: 0, p99: 0 };
        }

        const sorted = [...durations].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);
        const average = sum / count;
        const min = sorted[0] || 0;
        const max = sorted[count - 1] || 0;
        const p95 = sorted[Math.floor(count * 0.95)] || 0;
        const p99 = sorted[Math.floor(count * 0.99)] || 0;

        return { count, average, min, max, p95, p99 };
      }
    };

    this.timers.set(name, timer);
    this.logger.debug(`Created timer metric: ${name}`, { description });
    return timer;
  }

  /**
   * Get a counter metric
   */
  public getCounter(name: string): CounterMetric | undefined {
    return this.counters.get(name);
  }

  /**
   * Get a gauge metric
   */
  public getGauge(name: string): GaugeMetric | undefined {
    return this.gauges.get(name);
  }

  /**
   * Get a histogram metric
   */
  public getHistogram(name: string): HistogramMetric | undefined {
    return this.histograms.get(name);
  }

  /**
   * Get a timer metric
   */
  public getTimer(name: string): TimerMetric | undefined {
    return this.timers.get(name);
  }

  /**
   * Record a metric point
   */
  private recordMetricPoint(name: string, value: number, tags?: Record<string, string>): void {
    const point: MetricPoint = {
      name,
      value,
      timestamp: new Date(),
      tags: tags || {}
    };

    this.metricPoints.push(point);

    // Limit memory usage
    if (this.metricPoints.length > this.maxMetricPoints) {
      this.metricPoints = this.metricPoints.slice(-this.maxMetricPoints / 2);
    }
  }

  /**
   * Get all metric points within a time range
   */
  public getMetricPoints(
    startTime?: Date,
    endTime?: Date,
    metricName?: string
  ): MetricPoint[] {
    let points = this.metricPoints;

    if (metricName) {
      points = points.filter(p => p.name === metricName);
    }

    if (startTime) {
      points = points.filter(p => p.timestamp >= startTime);
    }

    if (endTime) {
      points = points.filter(p => p.timestamp <= endTime);
    }

    return points;
  }

  /**
   * Get current metrics summary
   */
  public getMetricsSummary(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; average: number; p95: number; p99: number }>;
    timers: Record<string, { count: number; average: number; min: number; max: number; p95: number; p99: number }>;
  } {
    const counters: Record<string, number> = {};
    this.counters.forEach((counter, name) => {
      counters[name] = counter.value;
    });

    const gauges: Record<string, number> = {};
    this.gauges.forEach((gauge, name) => {
      gauges[name] = gauge.value;
    });

    const histograms: Record<string, any> = {};
    this.histograms.forEach((histogram, name) => {
      histograms[name] = {
        count: histogram.getCount(),
        average: histogram.getAverage(),
        p95: histogram.getPercentile(95),
        p99: histogram.getPercentile(99)
      };
    });

    const timers: Record<string, any> = {};
    this.timers.forEach((timer, name) => {
      timers[name] = timer.getStats();
    });

    return { counters, gauges, histograms, timers };
  }

  /**
   * Reset all metrics
   */
  public resetAllMetrics(): void {
    this.counters.forEach(counter => counter.reset());
    this.histograms.forEach(histogram => histogram.reset());
    this.metricPoints = [];
    
    this.logger.info('All metrics have been reset');
  }

  /**
   * Export metrics in Prometheus format
   */
  public exportPrometheusMetrics(): string {
    const lines: string[] = [];

    // Export counters
    this.counters.forEach((counter, name) => {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${counter.value}`);
    });

    // Export gauges
    this.gauges.forEach((gauge, name) => {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${gauge.value}`);
    });

    // Export histograms
    this.histograms.forEach((histogram, name) => {
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count ${histogram.getCount()}`);
      lines.push(`${name}_sum ${histogram.values.reduce((a, b) => a + b, 0)}`);
      lines.push(`${name}_avg ${histogram.getAverage()}`);
    });

    // Export timers
    this.timers.forEach((timer, name) => {
      const stats = timer.getStats();
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count ${stats.count}`);
      lines.push(`${name}_avg ${stats.average}`);
      lines.push(`${name}_p95 ${stats.p95}`);
      lines.push(`${name}_p99 ${stats.p99}`);
    });

    return lines.join('\n');
  }

  /**
   * Start periodic metrics collection
   */
  public startPeriodicCollection(intervalMs = 30000): void {
    setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    this.logger.info(`Started periodic metrics collection with ${intervalMs}ms interval`);
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    try {
      // Memory metrics
      const memUsage = process.memoryUsage();
      const memoryGauge = this.getGauge('memory_usage_bytes');
      if (memoryGauge) {
        memoryGauge.set(memUsage.heapUsed);
      }

      // CPU metrics (simplified)
      const cpuUsage = process.cpuUsage();
      const cpuGauge = this.getGauge('cpu_usage_percent');
      if (cpuGauge) {
        // This is a simplified CPU calculation
        const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
        cpuGauge.set(cpuPercent);
      }

    } catch (error) {
      this.logger.error('Failed to collect system metrics', error as Error);
    }
  }
}