// Core service interfaces used across the application
import { Player } from '@models/Player';
import { IslandInstance, IslandBlueprint, VoxelChange } from '@models/Island';
import { ItemStack } from '@models/Item';
import { SkillType, SkillLevelResult } from '@models/Skill';
import { Vector3 } from './types';

// World Service Interface
export interface IWorldService {
  loadPlayerIsland(playerId: string): Promise<IslandInstance>;
  saveIslandChanges(playerId: string, changes: VoxelChange[]): Promise<void>;
  expandIsland(playerId: string, blueprint: IslandBlueprint): Promise<boolean>;
  getPublicZone(zoneId: string): Promise<PublicZone>;
}

// Player Service Interface
export interface IPlayerService {
  getPlayer(playerId: string): Promise<Player | null>;
  createPlayer(username: string): Promise<Player>;
  updatePlayer(playerId: string, updates: Partial<Player>): Promise<boolean>;
  addExperience(playerId: string, skill: SkillType, amount: number): Promise<SkillLevelResult>;
  addItemToInventory(playerId: string, item: ItemStack): Promise<boolean>;
  removeItemFromInventory(playerId: string, itemId: string, quantity: number): Promise<boolean>;
}

// Economy Service Interface
export interface IEconomyService {
  listItem(sellerId: string, item: ItemStack, price: number): Promise<string>;
  purchaseItem(buyerId: string, listingId: string): Promise<TransactionResult>;
  getMarketPrices(itemId: string): Promise<PriceHistory>;
  updateMarketTrends(): Promise<void>;
}

// Minion Service Interface
export interface IMinionService {
  deployMinion(playerId: string, minionType: string, location: Vector3): Promise<boolean>;
  upgradeMinion(minionId: string, upgradeType: string): Promise<boolean>;
  collectResources(minionId: string): Promise<ItemStack[]>;
  getMinionStatus(minionId: string): Promise<MinionStatus>;
  processOfflineMinions(playerId: string): Promise<ItemStack[]>;
}

// Supporting interfaces
export interface PublicZone {
  id: string;
  name: string;
  type: ZoneType;
  maxPlayers: number;
  currentPlayers: number;
  difficulty: number;
  features: ZoneFeature[];
}

export enum ZoneType {
  HUB = 'hub',
  COMBAT = 'combat',
  DUNGEON = 'dungeon',
  TRADING = 'trading',
  EVENT = 'event'
}

export enum ZoneFeature {
  TRADING_POST = 'trading_post',
  AUCTION_HOUSE = 'auction_house',
  BANK = 'bank',
  QUEST_GIVER = 'quest_giver',
  LEADERBOARDS = 'leaderboards',
  MOB_SPAWNS = 'mob_spawns',
  RESOURCE_NODES = 'resource_nodes'
}

export interface TransactionResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  newBalance?: number;
}

export interface PriceHistory {
  itemId: string;
  currentPrice: number;
  averagePrice: number;
  priceHistory: PricePoint[];
  trend: PriceTrend;
}

export interface PricePoint {
  price: number;
  timestamp: Date;
  volume: number;
}

export enum PriceTrend {
  RISING = 'rising',
  FALLING = 'falling',
  STABLE = 'stable',
  VOLATILE = 'volatile'
}

export interface MinionStatus {
  isActive: boolean;
  resourcesCollected: ItemStack[];
  storageCapacity: number;
  efficiency: number;
  timeUntilNextCollection: number;
}