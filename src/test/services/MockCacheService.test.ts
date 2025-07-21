import { describe, it, expect, beforeEach } from 'vitest';

// Mock Redis client for testing
class MockRedisClient {
  private data: Map<string, { value: string; expiry?: number }> = new Map();
  private connected: boolean = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key);
    if (!entry) return null;
    
    if (entry.expiry && Date.now() > entry.expiry) {
      this.data.delete(key);
      return null;
    }
    
    return entry.value;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, { value });
  }

  async setEx(key: string, seconds: number, value: string): Promise<void> {
    const expiry = Date.now() + (seconds * 1000);
    this.data.set(key, { value, expiry });
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    const entry = this.data.get(key);
    if (!entry) return 0;
    
    if (entry.expiry && Date.now() > entry.expiry) {
      this.data.delete(key);
      return 0;
    }
    
    return 1;
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    const entry = this.data.get(key);
    if (!entry) return false;
    
    entry.expiry = Date.now() + (seconds * 1000);
    return true;
  }

  async incr(key: string): Promise<number> {
    const entry = this.data.get(key);
    const currentValue = entry ? parseInt(entry.value) || 0 : 0;
    const newValue = currentValue + 1;
    this.data.set(key, { value: newValue.toString() });
    return newValue;
  }

  async mGet(keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map(key => this.get(key)));
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.data.keys()).filter(key => regex.test(key));
  }

  async flushDb(): Promise<void> {
    this.data.clear();
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  multi() {
    return {
      set: (key: string, value: string) => this,
      setEx: (key: string, seconds: number, value: string) => this,
      exec: async () => {
        // Mock pipeline execution
        return [];
      }
    };
  }

  on(event: string, callback: Function): void {
    // Mock event handling
    if (event === 'connect') {
      setTimeout(() => callback(), 10);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

// Mock Cache Service using the mock Redis client
class MockCacheService {
  private client: MockRedisClient;
  private stats = { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 };

  constructor() {
    this.client = new MockRedisClient();
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
  }

  private buildKey(key: string, prefix: string = 'skybound'): string {
    return `${prefix}:${key}`;
  }

  async get<T>(key: string, options: { prefix?: string } = {}): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const value = await this.client.get(fullKey);
      
      if (value === null) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      this.stats.errors++;
      return null;
    }
  }

  async set<T>(key: string, value: T, options: { ttl?: number; prefix?: string } = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const serializedValue = JSON.stringify(value);
      
      if (options.ttl) {
        await this.client.setEx(fullKey, options.ttl, serializedValue);
      } else {
        await this.client.set(fullKey, serializedValue);
      }

      this.stats.sets++;
      return true;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  async delete(key: string, options: { prefix?: string } = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.client.del(fullKey);
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  async exists(key: string, options: { prefix?: string } = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  async expire(key: string, ttl: number, options: { prefix?: string } = {}): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      return await this.client.expire(fullKey, ttl);
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  async increment(key: string, options: { ttl?: number; prefix?: string } = {}): Promise<number> {
    try {
      const fullKey = this.buildKey(key, options.prefix);
      const result = await this.client.incr(fullKey);
      
      if (options.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }
      
      return result;
    } catch (error) {
      this.stats.errors++;
      return 0;
    }
  }

  async getMultiple<T>(keys: string[], options: { prefix?: string } = {}): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key, options.prefix));
      const values = await this.client.mGet(fullKeys);
      
      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        return JSON.parse(value) as T;
      });
    } catch (error) {
      this.stats.errors++;
      return keys.map(() => null);
    }
  }

  async setMultiple<T>(keyValuePairs: Array<{ key: string; value: T }>, options: { ttl?: number; prefix?: string } = {}): Promise<boolean> {
    try {
      for (const { key, value } of keyValuePairs) {
        await this.set(key, value, options);
      }
      return true;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  async deletePattern(pattern: string, options: { prefix?: string } = {}): Promise<number> {
    try {
      const fullPattern = this.buildKey(pattern, options.prefix);
      const keys = await this.client.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      let deletedCount = 0;
      for (const key of keys) {
        const result = await this.client.del(key);
        deletedCount += result;
      }
      
      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      this.stats.errors++;
      return 0;
    }
  }

  async flush(prefix?: string): Promise<boolean> {
    try {
      if (prefix) {
        const pattern = this.buildKey('*', prefix);
        const keys = await this.client.keys(pattern);
        if (keys.length > 0) {
          for (const key of keys) {
            await this.client.del(key);
          }
        }
      } else {
        await this.client.flushDb();
      }
      return true;
    } catch (error) {
      this.stats.errors++;
      return false;
    }
  }

  getStats() {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 };
  }

  isHealthy(): boolean {
    return this.client.isConnected();
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
}

describe('MockCacheService', () => {
  let cacheService: MockCacheService;

  beforeEach(async () => {
    cacheService = new MockCacheService();
    await cacheService.connect();
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