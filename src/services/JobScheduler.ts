import { EventEmitter } from 'events';
import { Utils } from '../shared/utils';
import { config } from '../shared/config';

export interface Job {
  id: string;
  name: string;
  handler: () => Promise<void>;
  interval: number;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  isRunning: boolean;
  runCount: number;
  errorCount: number;
  lastError?: Error | undefined;
}

export interface JobSchedulerOptions {
  maxConcurrentJobs?: number;
  errorRetryDelay?: number;
  maxRetries?: number;
}

export class JobScheduler extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private isStarted = false;
  private options: Required<JobSchedulerOptions>;

  constructor(options: JobSchedulerOptions = {}) {
    super();
    this.options = {
      maxConcurrentJobs: options.maxConcurrentJobs || 5,
      errorRetryDelay: options.errorRetryDelay || 30000, // 30 seconds
      maxRetries: options.maxRetries || 3
    };
  }

  /**
   * Add a job to the scheduler
   */
  addJob(name: string, handler: () => Promise<void>, interval: number): string {
    const jobId = Utils.generateId();
    const job: Job = {
      id: jobId,
      name,
      handler,
      interval,
      enabled: true,
      isRunning: false,
      runCount: 0,
      errorCount: 0,
      nextRun: new Date(Date.now() + interval)
    };

    this.jobs.set(jobId, job);
    
    if (this.isStarted) {
      this.scheduleJob(job);
    }

    this.emit('jobAdded', job);
    return jobId;
  }

  /**
   * Remove a job from the scheduler
   */
  removeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    // Clear the timer if it exists
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }

    this.jobs.delete(jobId);
    this.emit('jobRemoved', job);
    return true;
  }

  /**
   * Enable or disable a job
   */
  setJobEnabled(jobId: string, enabled: boolean): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    job.enabled = enabled;
    
    if (!enabled) {
      // Clear timer if disabling
      const timer = this.timers.get(jobId);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(jobId);
      }
    } else if (this.isStarted) {
      // Reschedule if enabling and scheduler is running
      this.scheduleJob(job);
    }

    this.emit('jobToggled', job);
    return true;
  }

  /**
   * Start the job scheduler
   */
  start(): void {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    
    // Schedule all enabled jobs
    for (const job of this.jobs.values()) {
      if (job.enabled) {
        this.scheduleJob(job);
      }
    }

    this.emit('started');
  }

  /**
   * Stop the job scheduler
   */
  stop(): void {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;

    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    this.emit('stopped');
  }

  /**
   * Get job status
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get running jobs count
   */
  getRunningJobsCount(): number {
    return Array.from(this.jobs.values()).filter(job => job.isRunning).length;
  }

  /**
   * Force run a job immediately
   */
  async runJobNow(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job || job.isRunning) {
      return false;
    }

    await this.executeJob(job);
    return true;
  }

  /**
   * Schedule a job to run
   */
  private scheduleJob(job: Job): void {
    if (!job.enabled || job.isRunning) {
      return;
    }

    // Clear existing timer
    const existingTimer = this.timers.get(job.id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Calculate delay until next run
    const now = Date.now();
    const nextRunTime = job.nextRun?.getTime() || now;
    const delay = Math.max(0, nextRunTime - now);

    // Schedule the job
    const timer = setTimeout(async () => {
      await this.executeJob(job);
      
      // Reschedule if still enabled and scheduler is running
      if (job.enabled && this.isStarted) {
        job.nextRun = new Date(Date.now() + job.interval);
        this.scheduleJob(job);
      }
    }, delay);

    this.timers.set(job.id, timer);
  }

  /**
   * Execute a job with error handling
   */
  private async executeJob(job: Job): Promise<void> {
    if (job.isRunning) {
      return;
    }

    // Check concurrent job limit
    const runningCount = this.getRunningJobsCount();
    if (runningCount >= this.options.maxConcurrentJobs) {
      // Reschedule for later
      job.nextRun = new Date(Date.now() + this.options.errorRetryDelay);
      this.emit('jobDeferred', job, 'Max concurrent jobs reached');
      return;
    }

    job.isRunning = true;
    job.lastRun = new Date();
    
    this.emit('jobStarted', job);

    try {
      await job.handler();
      job.runCount++;
      job.errorCount = 0; // Reset error count on success
      job.lastError = undefined;
      
      this.emit('jobCompleted', job);
    } catch (error) {
      job.errorCount++;
      job.lastError = error instanceof Error ? error : new Error(String(error));
      
      this.emit('jobError', job, job.lastError);

      // If we've exceeded max retries, disable the job
      if (job.errorCount >= this.options.maxRetries) {
        job.enabled = false;
        this.emit('jobDisabled', job, 'Max retries exceeded');
      }
    } finally {
      job.isRunning = false;
    }
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    totalJobs: number;
    enabledJobs: number;
    runningJobs: number;
    totalRuns: number;
    totalErrors: number;
  } {
    const jobs = Array.from(this.jobs.values());
    
    return {
      totalJobs: jobs.length,
      enabledJobs: jobs.filter(job => job.enabled).length,
      runningJobs: jobs.filter(job => job.isRunning).length,
      totalRuns: jobs.reduce((sum, job) => sum + job.runCount, 0),
      totalErrors: jobs.reduce((sum, job) => sum + job.errorCount, 0)
    };
  }
}

// Global job scheduler instance
export const globalJobScheduler = new JobScheduler({
  maxConcurrentJobs: 10,
  errorRetryDelay: 30000,
  maxRetries: 3
});