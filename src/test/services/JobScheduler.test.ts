import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JobScheduler } from '../../services/JobScheduler';
import { Utils } from '../../shared/utils';

describe('JobScheduler', () => {
  let scheduler: JobScheduler;
  let mockHandler: ReturnType<typeof vi.fn<[], Promise<void>>>;

  beforeEach(() => {
    scheduler = new JobScheduler({
      maxConcurrentJobs: 2,
      errorRetryDelay: 100,
      maxRetries: 2
    });
    mockHandler = vi.fn().mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  afterEach(() => {
    scheduler.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Job Management', () => {
    it('should add a job successfully', () => {
      const jobId = scheduler.addJob('Test Job', mockHandler, 1000);
      
      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
      
      const job = scheduler.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.name).toBe('Test Job');
      expect(job?.interval).toBe(1000);
      expect(job?.enabled).toBe(true);
    });

    it('should remove a job successfully', () => {
      const jobId = scheduler.addJob('Test Job', mockHandler, 1000);
      
      const removed = scheduler.removeJob(jobId);
      expect(removed).toBe(true);
      
      const job = scheduler.getJob(jobId);
      expect(job).toBeUndefined();
    });

    it('should return false when removing non-existent job', () => {
      const removed = scheduler.removeJob('non-existent-id');
      expect(removed).toBe(false);
    });

    it('should enable and disable jobs', () => {
      const jobId = scheduler.addJob('Test Job', mockHandler, 1000);
      
      let success = scheduler.setJobEnabled(jobId, false);
      expect(success).toBe(true);
      
      const job = scheduler.getJob(jobId);
      expect(job?.enabled).toBe(false);
      
      success = scheduler.setJobEnabled(jobId, true);
      expect(success).toBe(true);
      expect(job?.enabled).toBe(true);
    });

    it('should return false when enabling/disabling non-existent job', () => {
      const success = scheduler.setJobEnabled('non-existent-id', false);
      expect(success).toBe(false);
    });
  });

  describe('Job Execution', () => {
    it('should execute jobs at specified intervals', async () => {
      const jobId = scheduler.addJob('Test Job', mockHandler, 1000);
      scheduler.start();

      // Fast-forward time to trigger job execution
      await vi.advanceTimersByTimeAsync(1000);
      
      expect(mockHandler).toHaveBeenCalledTimes(1);
      
      // Fast-forward again to trigger second execution
      await vi.advanceTimersByTimeAsync(1000);
      
      expect(mockHandler).toHaveBeenCalledTimes(2);
    });

    it('should not execute disabled jobs', async () => {
      const jobId = scheduler.addJob('Test Job', mockHandler, 1000);
      scheduler.setJobEnabled(jobId, false);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(2000);
      
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle job errors and retry', async () => {
      const errorHandler = vi.fn()
        .mockRejectedValueOnce(new Error('First error'))
        .mockResolvedValue(undefined);

      const jobId = scheduler.addJob('Error Job', errorHandler, 1000);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);
      
      expect(errorHandler).toHaveBeenCalledTimes(1);
      
      const job = scheduler.getJob(jobId);
      expect(job?.errorCount).toBe(1);
      expect(job?.lastError?.message).toBe('First error');
      
      // Job should still be enabled and retry
      expect(job?.enabled).toBe(true);
      
      await vi.advanceTimersByTimeAsync(1000);
      expect(errorHandler).toHaveBeenCalledTimes(2);
      expect(job?.errorCount).toBe(0); // Reset on success
    });

    it('should disable job after max retries', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Persistent error'));

      const jobId = scheduler.addJob('Failing Job', errorHandler, 1000);
      scheduler.start();

      // Execute job multiple times to exceed max retries
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      
      const job = scheduler.getJob(jobId);
      expect(job?.enabled).toBe(false);
      expect(job?.errorCount).toBe(2); // maxRetries from constructor
    });

    it('should respect concurrent job limits', async () => {
      const slowHandler = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      // Add 3 jobs but limit is 2
      scheduler.addJob('Job 1', slowHandler, 500);
      scheduler.addJob('Job 2', slowHandler, 500);
      scheduler.addJob('Job 3', slowHandler, 500);
      
      scheduler.start();

      await vi.advanceTimersByTimeAsync(500);
      
      // Only 2 jobs should be running due to concurrent limit
      expect(scheduler.getRunningJobsCount()).toBeLessThanOrEqual(2);
    });

    it('should run job immediately when requested', async () => {
      const jobId = scheduler.addJob('Test Job', mockHandler, 10000); // Long interval
      
      const success = await scheduler.runJobNow(jobId);
      expect(success).toBe(true);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    it('should not run job immediately if already running', async () => {
      const slowHandler = vi.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 1000))
      );

      const jobId = scheduler.addJob('Slow Job', slowHandler, 10000);
      
      // Start first execution
      const success1 = await scheduler.runJobNow(jobId);
      expect(success1).toBe(true);
      
      // Try to run again while first is still running
      const success2 = await scheduler.runJobNow(jobId);
      expect(success2).toBe(false);
    });
  });

  describe('Scheduler Control', () => {
    it('should start and stop scheduler', () => {
      expect(scheduler.getAllJobs()).toHaveLength(0);
      
      scheduler.start();
      scheduler.stop();
      
      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should not start jobs when scheduler is stopped', async () => {
      scheduler.addJob('Test Job', mockHandler, 1000);
      // Don't start scheduler
      
      await vi.advanceTimersByTimeAsync(2000);
      
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should schedule existing jobs when started', async () => {
      scheduler.addJob('Test Job', mockHandler, 1000);
      scheduler.start();
      
      await vi.advanceTimersByTimeAsync(1000);
      
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      scheduler.addJob('Job 1', mockHandler, 1000);
      scheduler.addJob('Job 2', mockHandler, 2000);
      scheduler.setJobEnabled(scheduler.getAllJobs()[1]!.id, false);
      
      const stats = scheduler.getStats();
      
      expect(stats.totalJobs).toBe(2);
      expect(stats.enabledJobs).toBe(1);
      expect(stats.runningJobs).toBe(0);
      expect(stats.totalRuns).toBe(0);
      expect(stats.totalErrors).toBe(0);
    });

    it('should update run and error counts', async () => {
      const errorHandler = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Test error'));

      scheduler.addJob('Test Job', errorHandler, 1000);
      scheduler.start();

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      
      const stats = scheduler.getStats();
      expect(stats.totalRuns).toBe(1); // Only successful runs count
      expect(stats.totalErrors).toBe(1);
    });
  });

  describe('Event Emission', () => {
    it('should emit job lifecycle events', async () => {
      const events: string[] = [];
      
      scheduler.on('jobAdded', () => events.push('added'));
      scheduler.on('jobStarted', () => events.push('started'));
      scheduler.on('jobCompleted', () => events.push('completed'));
      scheduler.on('jobRemoved', () => events.push('removed'));
      
      const jobId = scheduler.addJob('Test Job', mockHandler, 1000);
      scheduler.start();
      
      await vi.advanceTimersByTimeAsync(1000);
      
      scheduler.removeJob(jobId);
      
      expect(events).toContain('added');
      expect(events).toContain('started');
      expect(events).toContain('completed');
      expect(events).toContain('removed');
    });

    it('should emit error events', async () => {
      const errorEvents: Error[] = [];
      
      scheduler.on('jobError', (job, error) => errorEvents.push(error));
      
      const errorHandler = vi.fn().mockRejectedValue(new Error('Test error'));
      scheduler.addJob('Error Job', errorHandler, 1000);
      scheduler.start();
      
      await vi.advanceTimersByTimeAsync(1000);
      
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]?.message).toBe('Test error');
    });
  });
});