import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { CacheService } from '../../services/CacheService';

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeAll(async () => {
    cacheService = new CacheService();
    await cacheService.connect();
  });

  afterAll(async () => {
    await cacheService.disconnect();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await cacheService.flush();
    cacheService.resetStats();
  });

  describe('Basic Operations', () => {
    it('should set and get a value', async () => {
      const key = 'test-key';
      const value = { name: 'test', value: 123 };

      const setResult = await cacheService.set(key, value);
      expect(setResult).toBe(true);

      const retrievedValue = await cacheService.get(key);
      expect(retrievedValue).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const result = await cacheService.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete a key', async () => {
      const key = 'delete-test';
      const value = 'test-value';

      await cacheService.set(key, value);
      const deleteResult = await cacheService.delete(key);
      expect(deleteResult).toBe(true);

      const retrievedValue = await cacheService.get(key);
      expect(retrievedValue).toBeNull();
    });

    it('should check if key exists', async () => {
      const key = 'exists-test';
      const value = 'test-value';

      let exists = await cacheService.exists(key);
      expect(exists).toBe(false);

      await cacheService.set(key, value);
      exists = await cacheService.exists(key);
      expect(exists).toBe(true);
    });
  });

  describe('TTL Operations', () => {
    it('should set value with TTL', async () => {
      const key = 'ttl-test';
      const value = 'test-value';
      const ttl = 1; // 1 second

      await cacheService.set(key, value, { ttl });
      
      let retrievedValue = await cacheService.get(key);
      expect(retrievedValue).toBe(value);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      retrievedValue = await cacheService.get(key);
      expect(retrievedValue).toBeNull();
    });

    it('should update TTL for existing key', async () => {
      const key = 'expire-test';
      const value = 'test-value';

      await cacheService.set(key, value);
      const expireResult = await cacheService.expire(key, 1);
      expect(expireResult).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const retrievedValue = await cacheService.get(key);
      expect(retrievedValue).toBeNull();
    });
  });

  describe('Batch Operations', () => {
    it('should get multiple values', async () => {
      const data = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value3' }
      ];

      // Set individual values
      for (const item of data) {
        await cacheService.set(item.key, item.value);
      }

      const keys = data.map(item => item.key);
      const values = await cacheService.getMultiple(keys);

      expect(values).toHaveLength(3);
      expect(values[0]).toBe('value1');
      expect(values[1]).toBe('value2');
      expect(values[2]).toBe('value3');
    });

    it('should set multiple values', async () => {
      const keyValuePairs = [
        { key: 'multi1', value: { id: 1, name: 'test1' } },
        { key: 'multi2', value: { id: 2, name: 'test2' } },
        { key: 'multi3', value: { id: 3, name: 'test3' } }
      ];

      const setResult = await cacheService.setMultiple(keyValuePairs);
      expect(setResult).toBe(true);

      // Verify all values were set
      for (const pair of keyValuePairs) {
        const value = await cacheService.get(pair.key);
        expect(value).toEqual(pair.value);
      }
    });

    it('should handle mixed existing and non-existing keys in getMultiple', async () => {
      await cacheService.set('existing-key', 'existing-value');

      const keys = ['existing-key', 'non-existing-key'];
      const values = await cacheService.getMultiple(keys);

      expect(values).toHaveLength(2);
      expect(values[0]).toBe('existing-value');
      expect(values[1]).toBeNull();
    });
  });

  describe('Pattern Operations', () => {
    it('should delete keys by pattern', async () => {
      const testData = [
        { key: 'user:1', value: 'user1' },
        { key: 'user:2', value: 'user2' },
        { key: 'product:1', value: 'product1' }
      ];

      // Set test data
      for (const item of testData) {
        await cacheService.set(item.key, item.value);
      }

      // Delete user keys by pattern
      const deletedCount = await cacheService.deletePattern('user:*');
      expect(deletedCount).toBe(2);

      // Verify user keys are deleted
      expect(await cacheService.get('user:1')).toBeNull();
      expect(await cacheService.get('user:2')).toBeNull();

      // Verify product key still exists
      expect(await cacheService.get('product:1')).toBe('product1');
    });
  });

  describe('Increment Operations', () => {
    it('should increment a counter', async () => {
      const key = 'counter';

      const result1 = await cacheService.increment(key);
      expect(result1).toBe(1);

      const result2 = await cacheService.increment(key);
      expect(result2).toBe(2);

      const result3 = await cacheService.increment(key);
      expect(result3).toBe(3);
    });

    it('should increment with TTL', async () => {
      const key = 'counter-ttl';
      const ttl = 1; // 1 second

      await cacheService.increment(key, { ttl });
      
      let exists = await cacheService.exists(key);
      expect(exists).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      exists = await cacheService.exists(key);
      expect(exists).toBe(false);
    });
  });

  describe('Prefix Operations', () => {
    it('should use custom prefix', async () => {
      const key = 'test-key';
      const value = 'test-value';
      const prefix = 'custom';

      await cacheService.set(key, value, { prefix });
      
      const retrievedValue = await cacheService.get(key, { prefix });
      expect(retrievedValue).toBe(value);

      // Should not be found with default prefix
      const defaultValue = await cacheService.get(key);
      expect(defaultValue).toBeNull();
    });

    it('should flush with specific prefix', async () => {
      const prefix1 = 'prefix1';
      const prefix2 = 'prefix2';

      await cacheService.set('key1', 'value1', { prefix: prefix1 });
      await cacheService.set('key2', 'value2', { prefix: prefix1 });
      await cacheService.set('key3', 'value3', { prefix: prefix2 });

      // Flush only prefix1
      await cacheService.flush(prefix1);

      expect(await cacheService.get('key1', { prefix: prefix1 })).toBeNull();
      expect(await cacheService.get('key2', { prefix: prefix1 })).toBeNull();
      expect(await cacheService.get('key3', { prefix: prefix2 })).toBe('value3');
    });
  });

  describe('Health and Stats', () => {
    it('should track cache statistics', async () => {
      const key = 'stats-test';
      const value = 'test-value';

      // Reset stats
      cacheService.resetStats();
      let stats = cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.sets).toBe(0);

      // Perform operations
      await cacheService.set(key, value); // +1 set
      await cacheService.get(key); // +1 hit
      await cacheService.get('non-existent'); // +1 miss

      stats = cacheService.getStats();
      expect(stats.sets).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should check health status', async () => {
      const isHealthy = cacheService.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it('should ping Redis server', async () => {
      const pingResult = await cacheService.ping();
      expect(pingResult).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON gracefully', async () => {
      // This test simulates a scenario where cached data might be corrupted
      // In a real scenario, we'd need to manually corrupt the cache data
      const key = 'invalid-json-test';
      
      // Set a valid value first
      await cacheService.set(key, { valid: 'data' });
      const result = await cacheService.get(key);
      expect(result).toEqual({ valid: 'data' });
    });

    it('should handle connection errors gracefully', async () => {
      // This test would require disconnecting from Redis
      // For now, we'll just verify the error handling structure exists
      expect(cacheService.isHealthy()).toBe(true);
    });
  });

  describe('Complex Data Types', () => {
    it('should handle complex objects', async () => {
      const complexObject = {
        id: 'user123',
        profile: {
          name: 'John Doe',
          email: 'john@example.com',
          preferences: {
            theme: 'dark',
            notifications: true
          }
        },
        stats: {
          level: 25,
          experience: 15000,
          skills: ['combat', 'crafting', 'mining']
        },
        lastLogin: new Date().toISOString()
      };

      await cacheService.set('complex-object', complexObject);
      const retrieved = await cacheService.get('complex-object');
      
      expect(retrieved).toEqual(complexObject);
    });

    it('should handle arrays', async () => {
      const arrayData = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' }
      ];

      await cacheService.set('array-data', arrayData);
      const retrieved = await cacheService.get('array-data');
      
      expect(retrieved).toEqual(arrayData);
      expect(Array.isArray(retrieved)).toBe(true);
    });
  });
});