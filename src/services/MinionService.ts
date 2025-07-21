import { Minion, MinionStatus, MinionType } from '../models/Minion';
import { ItemStack } from '../models/Item';
import { Vector3 } from '@shared/types';

export interface MinionService {
  deployMinion(playerId: string, minionType: MinionType, location: Vector3): Promise<boolean>;
  upgradeMinion(minionId: string, upgradeType: string): Promise<boolean>;
  collectResources(minionId: string): Promise<ItemStack[]>;
  getMinionStatus(minionId: string): Promise<MinionStatus>;
  processOfflineMinions(playerId: string, offlineTime: number): Promise<ItemStack[]>;
}

export interface MinionRepository {
  findByPlayerId(playerId: string): Promise<Minion[]>;
  findById(minionId: string): Promise<Minion | null>;
  save(minion: Minion): Promise<void>;
  delete(minionId: string): Promise<void>;
}