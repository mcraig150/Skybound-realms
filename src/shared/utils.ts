// Shared utility functions
import { v4 as uuidv4 } from 'uuid';
import { ItemRarity } from '@models/Item';

export class Utils {
  /**
   * Generate a unique ID using UUID v4
   */
  static generateId(): string {
    return uuidv4();
  }

  /**
   * Generate a unique ID using timestamp and random string (legacy)
   */
  static generateTimestampId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Calculate experience required for a given level
   */
  static getExperienceForLevel(level: number): number {
    if (level <= 1) return 0;
    return Math.floor(level * level * 100 + level * 50);
  }

  /**
   * Calculate level from total experience
   */
  static getLevelFromExperience(experience: number): number {
    if (experience <= 0) return 1;
    
    let level = 1;
    let totalExp = 0;
    
    while (totalExp <= experience) {
      level++;
      totalExp += this.getExperienceForLevel(level);
    }
    
    return level - 1;
  }

  /**
   * Clamp a number between min and max values
   */
  static clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * Calculate distance between two 3D points
   */
  static distance3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Deep clone an object
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Validate username format
   */
  static isValidUsername(username: string): boolean {
    return /^[a-zA-Z0-9_]{3,16}$/.test(username);
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /**
   * Get random element from array
   */
  static getRandomElement<T>(array: T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot get random element from empty array');
    }
    return array[Math.floor(Math.random() * array.length)]!;
  }

  /**
   * Random number between min and max (inclusive)
   */
  static randomIntBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Format duration in milliseconds to human readable string
   */
  static formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Check if timestamp is expired
   */
  static isExpired(timestamp: Date, durationMs: number): boolean {
    return Date.now() - timestamp.getTime() > durationMs;
  }

  /**
   * Get rarity weight for drop calculations
   */
  static getRarityWeight(rarity: ItemRarity): number {
    const weights = {
      [ItemRarity.COMMON]: 100,
      [ItemRarity.UNCOMMON]: 50,
      [ItemRarity.RARE]: 25,
      [ItemRarity.EPIC]: 10,
      [ItemRarity.LEGENDARY]: 5,
      [ItemRarity.MYTHIC]: 2,
      [ItemRarity.DIVINE]: 1
    };
    return weights[rarity];
  }

  /**
   * Roll for item rarity based on weights
   */
  static rollForRarity(): ItemRarity {
    const rarities = Object.values(ItemRarity);
    const totalWeight = rarities.reduce((sum, rarity) => sum + this.getRarityWeight(rarity), 0);
    
    let random = Math.random() * totalWeight;
    
    for (const rarity of rarities) {
      random -= this.getRarityWeight(rarity);
      if (random <= 0) {
        return rarity;
      }
    }
    
    return ItemRarity.COMMON;
  }

  /**
   * Create a delay promise
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Add timeout to a promise
   */
  static timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), ms)
      )
    ]);
  }
}