import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MinionProcessingService } from '../../services/MinionProcessingService';
import { JobScheduler } from '../../services/JobScheduler';
import { MinionRepository } from '../../services/OfflineProcessingService';
import { PlayerService } from '../../services/PlayerService';
import { ResourceService } from '../../services/ResourceService';
import { MinionType } from '../../models/Minion';

describe('MinionProcessingService', () => {
  let service: MinionProcessingService;
  let mockJobScheduler: JobScheduler;
  let mockMinionRepository: MinionRepository;
  let mockPlayerService: PlayerService;
  let mockResourceService: ResourceService;

  const mockMinion = {
    id: 'minion-1',
    type: MinionType.COBBLESTONE,
    ownerId: 'player-1',
    position: { x: 0, y: 0, z: 0 },
    level: 1,
    efficiency: 0,
    storageCapacity: 64,
    collectedResources: [],
    isActive: true,
    deployedAt: new Date(),
    lastCollection: new Date()
  };

  beforeEach(() => {
    mockJobScheduler = new JobScheduler();
    
    mockMinionRepository = {
      findByOwnerId: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
      findActiveMinions: vi.fn()
    };

    mockPlayerService = {
      getPlayer: vi.fn(),
      addItemToInventory: vi.fn()
    } as any;

    mockResourceService = {} as any;

    service = new MinionProcessingService(
      mockMinionRepository,
      mockPlayerService,
      mockResourceService,
      mockJobScheduler
    );

    vi.useFakeTimers();
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Service Lifecycle', () => {
    it('should start background jobs successfully', () => {
      const initialJobCount = mockJobScheduler.getAllJobs().length;
      
      service.start();
      
      const finalJobCount = mockJobScheduler.getAllJobs().length;
      expect(finalJobCount).toBeGreaterThan(initialJobCount);
      
      const stats = service.getJobSchedulerStats();
      expect(stats.enabledJobs).toBeGreaterThan(0);
    });

    it('should stop background jobs successfully', () => {
      service.start();
      const jobCountAfterStart = mockJobScheduler.getAllJobs().length;
      
      service.stop();
      
      const jobCountAfterStop = mockJobScheduler.getAllJobs().length;
      expect(jobCountAfterStop).toBeLessThan(jobCountAfterStart);
    });

    it('should handle multiple start/stop cycles', () => {
      service.start();
      service.stop();
      service.start();
      service.stop();
      
      // Should not throw errors
      expect(true).toBe(true);
    });
  });

  describe('Job Execution', () => {
    it('should process minion jobs successfully', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions).mockResolvedValue([mockMinion]);
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([mockMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue({
        id: 'player-1',
        inventory: []
      } as any);
      vi.mocked(mockPlayerService.addItemToInventory).mockResolvedValue(true);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(mockMinion);

      service.start();
      
      // Force run the job immediately
      const success = await service.runMinionProcessingNow();
      expect(success).toBe(true);
      
      const stats = service.getStats();
      expect(stats.totalRuns).toBe(1);
      expect(stats.lastRunTime).toBeDefined();
    });

    it('should handle job execution errors', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions).mockRejectedValue(new Error('Database error'));

      service.start();
      
      // This should handle the error gracefully
      await service.runMinionProcessingNow();
      
      const stats = service.getStats();
      expect(stats.lastError).toBeDefined();
      expect(stats.lastError?.message).toBe('Database error');
    });

    it('should update processing statistics correctly', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions).mockResolvedValue([mockMinion]);
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([mockMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue({
        id: 'player-1',
        inventory: []
      } as any);
      vi.mocked(mockPlayerService.addItemToInventory).mockResolvedValue(true);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(mockMinion);

      service.start();
      
      // Run job multiple times
      await service.runMinionProcessingNow();
      await service.runMinionProcessingNow();
      
      const stats = service.getStats();
      expect(stats.totalRuns).toBe(2);
      expect(stats.averageProcessingTime).toBeGreaterThan(0);
    });
  });

  describe('Player Activity Processing', () => {
    it('should process individual player activity', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([mockMinion]);
      vi.mocked(mockPlayerService.getPlayer).mockResolvedValue({
        id: 'player-1',
        inventory: []
      } as any);
      vi.mocked(mockPlayerService.addItemToInventory).mockResolvedValue(true);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(mockMinion);

      const result = await service.processPlayerActivity('player-1');
      
      expect(result.success).toBe(true);
      expect(result.result?.playerId).toBe('player-1');
    });

    it('should get player offline statistics', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([
        { ...mockMinion, isActive: true },
        { ...mockMinion, id: 'minion-2', isActive: false }
      ]);

      const result = await service.getPlayerOfflineStats('player-1');
      
      expect(result.success).toBe(true);
      expect(result.data?.totalMinions).toBe(2);
      expect(result.data?.activeMinions).toBe(1);
    });

    it('should clear player overflow items', async () => {
      vi.mocked(mockMinionRepository.findByOwnerId).mockResolvedValue([
        {
          ...mockMinion,
          collectedResources: [{ itemId: 'cobblestone', quantity: 5 }]
        }
      ]);
      vi.mocked(mockMinionRepository.update).mockResolvedValue(mockMinion);

      const result = await service.clearPlayerOverflow('player-1');
      
      expect(result.success).toBe(true);
      expect(result.data).toBeGreaterThan(0);
    });
  });

  describe('Job Control', () => {
    it('should enable and disable minion processing', () => {
      service.start();
      
      let success = service.setMinionProcessingEnabled(false);
      expect(success).toBe(true);
      
      success = service.setMinionProcessingEnabled(true);
      expect(success).toBe(true);
    });

    it('should return false when controlling non-existent jobs', () => {
      // Don't start service, so no jobs exist
      const success = service.setMinionProcessingEnabled(false);
      expect(success).toBe(false);
    });

    it('should force run minion processing immediately', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions).mockResolvedValue([]);
      
      service.start();
      
      const success = await service.runMinionProcessingNow();
      expect(success).toBe(true);
    });

    it('should return false when force running non-existent job', async () => {
      // Don't start service
      const success = await service.runMinionProcessingNow();
      expect(success).toBe(false);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate processing statistics', () => {
      const stats = service.getStats();
      
      expect(stats).toHaveProperty('totalRuns');
      expect(stats).toHaveProperty('averageProcessingTime');
      expect(stats).toHaveProperty('playersProcessed');
      expect(stats).toHaveProperty('minionsProcessed');
      expect(stats.totalRuns).toBe(0); // Initially zero
    });

    it('should provide job scheduler statistics', () => {
      service.start();
      
      const stats = service.getJobSchedulerStats();
      
      expect(stats).toHaveProperty('totalJobs');
      expect(stats).toHaveProperty('enabledJobs');
      expect(stats).toHaveProperty('runningJobs');
      expect(stats.totalJobs).toBeGreaterThan(0);
    });

    it('should track processing times accurately', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions).mockResolvedValue([]);
      
      service.start();
      
      const startTime = Date.now();
      await service.runMinionProcessingNow();
      const endTime = Date.now();
      
      const stats = service.getStats();
      expect(stats.averageProcessingTime).toBeGreaterThanOrEqual(0);
      expect(stats.averageProcessingTime).toBeLessThanOrEqual(endTime - startTime + 100); // Allow some margin
    });
  });

  describe('Error Handling', () => {
    it('should handle repository errors gracefully', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions).mockRejectedValue(new Error('Connection failed'));
      
      service.start();
      await service.runMinionProcessingNow();
      
      const stats = service.getStats();
      expect(stats.lastError).toBeDefined();
      expect(stats.lastError?.message).toBe('Connection failed');
    });

    it('should continue processing after errors', async () => {
      vi.mocked(mockMinionRepository.findActiveMinions)
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce([]);
      
      service.start();
      
      // First run should fail
      await service.runMinionProcessingNow();
      expect(service.getStats().lastError).toBeDefined();
      
      // Second run should succeed
      await service.runMinionProcessingNow();
      expect(service.getStats().totalRuns).toBe(1); // Only successful runs count
    });
  });

  describe('Event Handling', () => {
    it('should handle job scheduler events', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      vi.mocked(mockMinionRepository.findActiveMinions).mockResolvedValue([]);
      
      service.start();
      await service.runMinionProcessingNow();
      
      // Should log completion
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle job errors and log them', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      vi.mocked(mockMinionRepository.findActiveMinions).mockRejectedValue(new Error('Test error'));
      
      service.start();
      await service.runMinionProcessingNow();
      
      expect(errorSpy).toHaveBeenCalled();
      
      errorSpy.mockRestore();
    });
  });
});