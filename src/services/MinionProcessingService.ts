import { globalJobScheduler, JobScheduler } from './JobScheduler';
import { OfflineProcessingService, MinionRepository } from './OfflineProcessingService';
import { PlayerService } from './PlayerService';
import { ResourceService } from './ResourceService';
import { config } from '../shared/config';
import { GAME_CONSTANTS } from '../shared/constants';

export interface MinionProcessingStats {
  totalRuns: number;
  lastRunTime?: Date;
  averageProcessingTime: number;
  playersProcessed: number;
  minionsProcessed: number;
  lastError?: Error;
}

export class MinionProcessingService {
  private offlineProcessingService: OfflineProcessingService;
  private jobScheduler: JobScheduler;
  private minionJobId?: string | undefined;
  private resourceJobId?: string | undefined;
  private stats: MinionProcessingStats = {
    totalRuns: 0,
    averageProcessingTime: 0,
    playersProcessed: 0,
    minionsProcessed: 0
  };

  constructor(
    minionRepository: MinionRepository,
    playerService: PlayerService,
    resourceService: ResourceService,
    jobScheduler: JobScheduler = globalJobScheduler
  ) {
    this.offlineProcessingService = new OfflineProcessingService(
      minionRepository,
      playerService
    );
    this.jobScheduler = jobScheduler;
    
    this.setupEventListeners();
  }

  /**
   * Start the minion processing background jobs
   */
  start(): void {
    // Add minion processing job
    this.minionJobId = this.jobScheduler.addJob(
      'Minion Processing',
      () => this.processMinionJob(),
      config.game.minionProcessingInterval
    );

    // Add resource node regeneration job (every 30 seconds)
    this.resourceJobId = this.jobScheduler.addJob(
      'Resource Node Regeneration',
      () => this.processResourceRegeneration(),
      GAME_CONSTANTS.RESOURCE_NODE_RESPAWN_TIME
    );

    // Start the job scheduler if not already started
    this.jobScheduler.start();
  }

  /**
   * Stop the minion processing background jobs
   */
  stop(): void {
    if (this.minionJobId) {
      this.jobScheduler.removeJob(this.minionJobId);
      this.minionJobId = undefined;
    }

    if (this.resourceJobId) {
      this.jobScheduler.removeJob(this.resourceJobId);
      this.resourceJobId = undefined;
    }
  }

  /**
   * Process a specific player's offline activity
   */
  async processPlayerActivity(playerId: string) {
    return await this.offlineProcessingService.processPlayerOfflineActivity(playerId);
  }

  /**
   * Get processing statistics
   */
  getStats(): MinionProcessingStats {
    return { ...this.stats };
  }

  /**
   * Get player offline statistics
   */
  async getPlayerOfflineStats(playerId: string) {
    return await this.offlineProcessingService.getPlayerOfflineStats(playerId);
  }

  /**
   * Force run minion processing job immediately
   */
  async runMinionProcessingNow(): Promise<boolean> {
    if (!this.minionJobId) {
      return false;
    }
    return await this.jobScheduler.runJobNow(this.minionJobId);
  }

  /**
   * Enable or disable minion processing
   */
  setMinionProcessingEnabled(enabled: boolean): boolean {
    if (!this.minionJobId) {
      return false;
    }
    return this.jobScheduler.setJobEnabled(this.minionJobId, enabled);
  }

  /**
   * Clear player overflow items
   */
  async clearPlayerOverflow(playerId: string) {
    return await this.offlineProcessingService.clearPlayerOverflow(playerId);
  }

  /**
   * Get job scheduler status
   */
  getJobSchedulerStats() {
    return this.jobScheduler.getStats();
  }

  /**
   * Main minion processing job handler
   */
  private async processMinionJob(): Promise<void> {
    const startTime = Date.now();
    
    try {
      const result = await this.offlineProcessingService.processAllActiveMinions();
      
      if (result.success && result.data) {
        // Update statistics
        this.stats.totalRuns++;
        this.stats.lastRunTime = new Date();
        this.stats.playersProcessed = result.data.playersProcessed;
        this.stats.minionsProcessed = result.data.minionsProcessed;
        
        const processingTime = Date.now() - startTime;
        this.stats.averageProcessingTime = 
          (this.stats.averageProcessingTime * (this.stats.totalRuns - 1) + processingTime) / 
          this.stats.totalRuns;

        console.log(`Minion processing completed: ${result.data.playersProcessed} players, ${result.data.minionsProcessed} minions processed in ${processingTime}ms`);
      } else {
        throw new Error(result.error || 'Unknown error during minion processing');
      }
    } catch (error) {
      this.stats.lastError = error instanceof Error ? error : new Error(String(error));
      console.error('Minion processing job failed:', error);
      throw error;
    }
  }

  /**
   * Resource node regeneration job handler
   */
  private async processResourceRegeneration(): Promise<void> {
    try {
      // This would be implemented by ResourceService
      // For now, just log that it's running
      console.log('Resource node regeneration job running...');
    } catch (error) {
      console.error('Resource regeneration job failed:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for job scheduler
   */
  private setupEventListeners(): void {
    this.jobScheduler.on('jobError', (job, error) => {
      if (job.id === this.minionJobId) {
        console.error(`Minion processing job error:`, error);
        this.stats.lastError = error;
      }
    });

    this.jobScheduler.on('jobCompleted', (job) => {
      if (job.id === this.minionJobId) {
        console.log(`Minion processing job completed successfully`);
      }
    });

    this.jobScheduler.on('jobDisabled', (job, reason) => {
      if (job.id === this.minionJobId) {
        console.warn(`Minion processing job disabled: ${reason}`);
      }
    });
  }
}

// Export a factory function to create the service with dependencies
export function createMinionProcessingService(
  minionRepository: MinionRepository,
  playerService: PlayerService,
  resourceService: ResourceService
): MinionProcessingService {
  return new MinionProcessingService(
    minionRepository,
    playerService,
    resourceService
  );
}