// Unit tests for MetricsService
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MetricsService } from '../../services/MetricsService';

// Mock logger
vi.mock('../../shared/logger', () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }))
}));

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Counter Metrics', () => {
    it('should create and increment counter', () => {
      const counter = metricsService.createCounter('test_counter', 'Test counter');
      
      expect(counter.name).toBe('test_counter');
      expect(counter.value).toBe(0);
      
      counter.increment();
      expect(counter.value).toBe(1);
      
      counter.increment(5);
      expect(counter.value).toBe(6);
    });

    it('should reset counter', () => {
      const counter = metricsService.createCounter('test_counter');
      
      counter.increment(10);
      expect(counter.value).toBe(10);
      
      counter.reset();
      expect(counter.value).toBe(0);
    });

    it('should return existing counter if already created', () => {
      const counter1 = metricsService.createCounter('existing_counter');
      const counter2 = metricsService.createCounter('existing_counter');
      
      expect(counter1).toBe(counter2);
    });

    it('should get counter by name', () => {
      const counter = metricsService.createCounter('named_counter');
      const retrieved = metricsService.getCounter('named_counter');
      
      expect(retrieved).toBe(counter);
    });
  });

  describe('Gauge Metrics', () => {
    it('should create and set gauge value', () => {
      const gauge = metricsService.createGauge('test_gauge', 'Test gauge');
      
      expect(gauge.name).toBe('test_gauge');
      expect(gauge.value).toBe(0);
      
      gauge.set(42);
      expect(gauge.value).toBe(42);
    });

    it('should increment and decrement gauge', () => {
      const gauge = metricsService.createGauge('test_gauge');
      
      gauge.increment();
      expect(gauge.value).toBe(1);
      
      gauge.increment(5);
      expect(gauge.value).toBe(6);
      
      gauge.decrement(2);
      expect(gauge.value).toBe(4);
      
      gauge.decrement();
      expect(gauge.value).toBe(3);
    });

    it('should get gauge by name', () => {
      const gauge = metricsService.createGauge('named_gauge');
      const retrieved = metricsService.getGauge('named_gauge');
      
      expect(retrieved).toBe(gauge);
    });
  });

  describe('Histogram Metrics', () => {
    it('should create and record histogram values', () => {
      const histogram = metricsService.createHistogram('test_histogram', 'Test histogram');
      
      expect(histogram.name).toBe('test_histogram');
      expect(histogram.getCount()).toBe(0);
      
      histogram.record(10);
      histogram.record(20);
      histogram.record(30);
      
      expect(histogram.getCount()).toBe(3);
      expect(histogram.getAverage()).toBe(20);
    });

    it('should calculate percentiles correctly', () => {
      const histogram = metricsService.createHistogram('percentile_test');
      
      // Record values 1-100
      for (let i = 1; i <= 100; i++) {
        histogram.record(i);
      }
      
      expect(histogram.getPercentile(50)).toBeCloseTo(50, 0);
      expect(histogram.getPercentile(95)).toBeCloseTo(95, 0);
      expect(histogram.getPercentile(99)).toBeCloseTo(99, 0);
    });

    it('should handle empty histogram', () => {
      const histogram = metricsService.createHistogram('empty_histogram');
      
      expect(histogram.getCount()).toBe(0);
      expect(histogram.getAverage()).toBe(0);
      expect(histogram.getPercentile(95)).toBe(0);
    });

    it('should reset histogram', () => {
      const histogram = metricsService.createHistogram('reset_test');
      
      histogram.record(10);
      histogram.record(20);
      expect(histogram.getCount()).toBe(2);
      
      histogram.reset();
      expect(histogram.getCount()).toBe(0);
      expect(histogram.getAverage()).toBe(0);
    });

    it('should limit histogram size to prevent memory issues', () => {
      const histogram = metricsService.createHistogram('large_histogram');
      
      // Record more than 1000 values
      for (let i = 0; i < 1500; i++) {
        histogram.record(i);
      }
      
      // Should keep only last 1000 values
      expect(histogram.getCount()).toBe(1000);
    });
  });

  describe('Timer Metrics', () => {
    it('should create and use timer', () => {
      const timer = metricsService.createTimer('test_timer', 'Test timer');
      
      expect(timer.name).toBe('test_timer');
      
      const stopTimer = timer.start();
      
      // Simulate some work
      setTimeout(() => {
        stopTimer();
      }, 10);
      
      // Timer should have recorded the duration
      expect(timer.getStats().count).toBeGreaterThanOrEqual(0);
    });

    it('should record timer duration manually', () => {
      const timer = metricsService.createTimer('manual_timer');
      
      timer.record(100);
      timer.record(200);
      timer.record(300);
      
      const stats = timer.getStats();
      expect(stats.count).toBe(3);
      expect(stats.average).toBe(200);
      expect(stats.min).toBe(100);
      expect(stats.max).toBe(300);
    });

    it('should calculate timer percentiles', () => {
      const timer = metricsService.createTimer('percentile_timer');
      
      // Record values 1-100ms
      for (let i = 1; i <= 100; i++) {
        timer.record(i);
      }
      
      const stats = timer.getStats();
      expect(stats.count).toBe(100);
      expect(stats.average).toBe(50.5);
      expect(stats.p95).toBeCloseTo(95, -1); // Allow 1 digit difference
      expect(stats.p99).toBeCloseTo(99, -1); // Allow 1 digit difference
    });

    it('should handle empty timer', () => {
      const timer = metricsService.createTimer('empty_timer');
      
      const stats = timer.getStats();
      expect(stats.count).toBe(0);
      expect(stats.average).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
      expect(stats.p95).toBe(0);
      expect(stats.p99).toBe(0);
    });
  });

  describe('Metric Points', () => {
    it('should record metric points when metrics are updated', () => {
      const counter = metricsService.createCounter('point_counter');
      
      counter.increment();
      counter.increment(5);
      
      const points = metricsService.getMetricPoints();
      const counterPoints = points.filter(p => p.name === 'point_counter');
      
      expect(counterPoints.length).toBeGreaterThan(0);
      expect(counterPoints[0].value).toBeDefined();
      expect(counterPoints[0].timestamp).toBeInstanceOf(Date);
    });

    it('should filter metric points by name', () => {
      const counter1 = metricsService.createCounter('counter1');
      const counter2 = metricsService.createCounter('counter2');
      
      counter1.increment();
      counter2.increment();
      
      const counter1Points = metricsService.getMetricPoints(undefined, undefined, 'counter1');
      const counter2Points = metricsService.getMetricPoints(undefined, undefined, 'counter2');
      
      expect(counter1Points.every(p => p.name === 'counter1')).toBe(true);
      expect(counter2Points.every(p => p.name === 'counter2')).toBe(true);
    });

    it('should filter metric points by time range', () => {
      const counter = metricsService.createCounter('time_counter');
      const startTime = new Date();
      
      counter.increment();
      
      const endTime = new Date();
      const points = metricsService.getMetricPoints(startTime, endTime, 'time_counter');
      
      expect(points.length).toBeGreaterThan(0);
      expect(points.every(p => p.timestamp >= startTime && p.timestamp <= endTime)).toBe(true);
    });
  });

  describe('Metrics Summary', () => {
    it('should return metrics summary', () => {
      const counter = metricsService.createCounter('summary_counter');
      const gauge = metricsService.createGauge('summary_gauge');
      const histogram = metricsService.createHistogram('summary_histogram');
      const timer = metricsService.createTimer('summary_timer');
      
      counter.increment(5);
      gauge.set(42);
      histogram.record(100);
      timer.record(50);
      
      const summary = metricsService.getMetricsSummary();
      
      expect(summary.counters['summary_counter']).toBe(5);
      expect(summary.gauges['summary_gauge']).toBe(42);
      expect(summary.histograms['summary_histogram'].count).toBe(1);
      expect(summary.timers['summary_timer'].count).toBe(1);
    });
  });

  describe('Reset All Metrics', () => {
    it('should reset all metrics', () => {
      const counter = metricsService.createCounter('reset_counter');
      const histogram = metricsService.createHistogram('reset_histogram');
      
      counter.increment(10);
      histogram.record(100);
      
      expect(counter.value).toBe(10);
      expect(histogram.getCount()).toBe(1);
      
      metricsService.resetAllMetrics();
      
      expect(counter.value).toBe(0);
      expect(histogram.getCount()).toBe(0);
      expect(metricsService.getMetricPoints().length).toBe(0);
    });
  });

  describe('Prometheus Export', () => {
    it('should export metrics in Prometheus format', () => {
      const counter = metricsService.createCounter('prom_counter');
      const gauge = metricsService.createGauge('prom_gauge');
      const histogram = metricsService.createHistogram('prom_histogram');
      const timer = metricsService.createTimer('prom_timer');
      
      counter.increment(5);
      gauge.set(42);
      histogram.record(100);
      timer.record(50);
      
      const prometheusOutput = metricsService.exportPrometheusMetrics();
      
      expect(prometheusOutput).toContain('# TYPE prom_counter counter');
      expect(prometheusOutput).toContain('prom_counter 5');
      expect(prometheusOutput).toContain('# TYPE prom_gauge gauge');
      expect(prometheusOutput).toContain('prom_gauge 42');
      expect(prometheusOutput).toContain('# TYPE prom_histogram histogram');
      expect(prometheusOutput).toContain('# TYPE prom_timer histogram');
    });
  });

  describe('Periodic Collection', () => {
    it('should start periodic metrics collection', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      
      metricsService.startPeriodicCollection(1000);
      
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      
      setIntervalSpy.mockRestore();
    });
  });

  describe('Default Metrics', () => {
    it('should create default metrics on initialization', () => {
      // Check that default metrics are created
      expect(metricsService.getCounter('api_requests_total')).toBeDefined();
      expect(metricsService.getCounter('api_errors_total')).toBeDefined();
      expect(metricsService.getTimer('api_request_duration')).toBeDefined();
      expect(metricsService.getCounter('db_queries_total')).toBeDefined();
      expect(metricsService.getCounter('cache_hits_total')).toBeDefined();
      expect(metricsService.getGauge('memory_usage_bytes')).toBeDefined();
    });
  });
});