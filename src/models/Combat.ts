import { ItemStack, StatModifiers } from './Item';
import { SkillType } from './Skill';
import { Vector3 } from '../shared/types';

// Combat Entity Types
export interface CombatEntity {
  id: string;
  name: string;
  type: EntityType;
  level: number;
  stats: CombatStats;
  currentHealth: number;
  currentMana: number;
  position: Vector3;
  statusEffects: StatusEffect[];
  equipment?: ItemStack[];
}

export enum EntityType {
  PLAYER = 'player',
  MOB = 'mob',
  BOSS = 'boss',
  NPC = 'npc'
}

export interface CombatStats {
  maxHealth: number;
  maxMana: number;
  damage: number;
  defense: number;
  critChance: number;
  critDamage: number;
  speed: number;
  accuracy: number;
  evasion: number;
}

// Status Effects System
export interface StatusEffect {
  id: string;
  name: string;
  type: StatusEffectType;
  duration: number;
  remainingTurns: number;
  value: number;
  stackable: boolean;
  currentStacks: number;
  maxStacks: number;
  source: string; // Entity ID that applied the effect
}

export enum StatusEffectType {
  DAMAGE_OVER_TIME = 'damage_over_time',
  HEAL_OVER_TIME = 'heal_over_time',
  DAMAGE_BUFF = 'damage_buff',
  DAMAGE_DEBUFF = 'damage_debuff',
  DEFENSE_BUFF = 'defense_buff',
  DEFENSE_DEBUFF = 'defense_debuff',
  SPEED_BUFF = 'speed_buff',
  SPEED_DEBUFF = 'speed_debuff',
  STUN = 'stun',
  POISON = 'poison',
  REGENERATION = 'regeneration',
  SHIELD = 'shield'
}

// Combat Actions
export interface CombatAction {
  id: string;
  actorId: string;
  targetId: string;
  actionType: ActionType;
  skillType?: SkillType;
  damage?: number;
  healing?: number;
  statusEffects?: StatusEffect[];
  cooldown: number;
  manaCost: number;
}

export enum ActionType {
  BASIC_ATTACK = 'basic_attack',
  SKILL_ATTACK = 'skill_attack',
  HEAL = 'heal',
  DEFEND = 'defend',
  USE_ITEM = 'use_item',
  FLEE = 'flee'
}

// Combat Results
export interface CombatResult {
  success: boolean;
  damage: number;
  healing: number;
  criticalHit: boolean;
  blocked: boolean;
  dodged: boolean;
  statusEffectsApplied: StatusEffect[];
  experienceGained?: number;
  itemsDropped?: ItemStack[];
}

export interface CombatZone {
  id: string;
  name: string;
  type: ZoneType;
  level: number;
  entities: Map<string, CombatEntity>; // All entities in the zone
  activeCombats: Map<string, ActiveCombat>; // Individual combat instances
  mobSpawns: MobSpawn[];
  lastUpdate: Date;
}

export interface ActiveCombat {
  id: string;
  attackerId: string;
  targetId: string;
  startTime: Date;
  lastAction: Date;
  isActive: boolean;
}

export interface MobSpawn {
  id: string;
  mobTemplateId: string;
  position: Vector3;
  respawnTime: number;
  lastSpawn: Date;
  maxCount: number;
  currentCount: number;
}

export enum ZoneType {
  PEACEFUL = 'peaceful',
  LOW_LEVEL = 'low_level',
  MID_LEVEL = 'mid_level',
  HIGH_LEVEL = 'high_level',
  DUNGEON = 'dungeon',
  BOSS_ROOM = 'boss_room'
}

export interface CombatRewards {
  experience: Map<SkillType, number>;
  items: ItemStack[];
  currency: number;
}

export interface CombatEncounter {
  id: string;
  participants: CombatEntity[];
  turnOrder: string[];
  isActive: boolean;
  winner?: 'players' | 'mobs';
  currentTurn: number;
  round: number;
}

// Mob AI and Behavior
export interface MobAI {
  mobId: string;
  behaviorType: MobBehaviorType;
  aggroRange: number;
  attackRange: number;
  currentTarget?: string;
  aggroList: Map<string, number>; // Entity ID -> Aggro amount
  lastAction: Date;
  actionCooldown: number;
}

export enum MobBehaviorType {
  PASSIVE = 'passive',
  AGGRESSIVE = 'aggressive',
  DEFENSIVE = 'defensive',
  TERRITORIAL = 'territorial',
  PACK_HUNTER = 'pack_hunter',
  BOSS = 'boss'
}

export interface MobTemplate {
  id: string;
  name: string;
  level: number;
  baseStats: CombatStats;
  behaviorType: MobBehaviorType;
  abilities: MobAbility[];
  lootTable: LootDrop[];
  experienceReward: number;
  spawnWeight: number;
}

export interface MobAbility {
  id: string;
  name: string;
  damage: number;
  manaCost: number;
  cooldown: number;
  range: number;
  statusEffects: StatusEffect[];
  usageCondition?: AbilityCondition;
}

export interface AbilityCondition {
  healthThreshold?: number; // Use when health is below this percentage
  targetCount?: number; // Use when this many targets are in range
  cooldownReady?: boolean;
}

export interface LootDrop {
  itemId: string;
  quantity: number;
  dropChance: number;
  rarityBonus?: number;
}

// Combat Calculations
export class CombatCalculator {
  /**
   * Calculate damage dealt by an attacker to a target
   */
  static calculateDamage(
    attacker: CombatEntity,
    target: CombatEntity,
    action: CombatAction,
    modifiers: StatModifiers = {}
  ): CombatResult {
    let baseDamage = action.damage || (attacker.stats.damage + (modifiers.damage || 0));
    
    // Apply skill-based damage bonuses
    if (action.skillType) {
      baseDamage *= this.getSkillDamageMultiplier(action.skillType);
    }

    // Calculate critical hit
    const critChance = attacker.stats.critChance + (modifiers.critChance || 0);
    const isCritical = Math.random() < (critChance / 100);
    
    if (isCritical) {
      const critMultiplier = 1 + ((attacker.stats.critDamage + (modifiers.critDamage || 0)) / 100);
      baseDamage *= critMultiplier;
    }

    // Apply target's defense
    const defense = target.stats.defense;
    const damageReduction = defense / (defense + 100); // Diminishing returns formula
    let finalDamage = baseDamage * (1 - damageReduction);

    // Check for dodge
    const dodgeChance = target.stats.evasion;
    const isDodged = Math.random() < (dodgeChance / 100);
    
    if (isDodged) {
      finalDamage = 0;
    } else {
      // Apply status effect modifiers
      finalDamage = this.applyStatusEffectModifiers(target, finalDamage, 'damage_taken');
      
      // Ensure minimum damage (only if not dodged)
      finalDamage = Math.max(1, Math.floor(finalDamage));
    }

    return {
      success: true,
      damage: finalDamage,
      healing: 0,
      criticalHit: isCritical,
      blocked: false,
      dodged: isDodged,
      statusEffectsApplied: action.statusEffects || []
    };
  }

  /**
   * Calculate healing amount
   */
  static calculateHealing(
    healer: CombatEntity,
    target: CombatEntity,
    baseHealing: number,
    modifiers: StatModifiers = {}
  ): number {
    let healing = baseHealing + (modifiers.health || 0);
    
    // Apply status effect modifiers
    healing = this.applyStatusEffectModifiers(target, healing, 'healing_received');
    
    // Ensure target doesn't exceed max health
    const maxHealing = target.stats.maxHealth - target.currentHealth;
    return Math.min(healing, maxHealing);
  }

  /**
   * Apply status effects to an entity
   */
  static applyStatusEffect(entity: CombatEntity, effect: StatusEffect): boolean {
    const existingEffect = entity.statusEffects.find(e => e.id === effect.id);
    
    if (existingEffect) {
      if (effect.stackable && existingEffect.currentStacks < existingEffect.maxStacks) {
        existingEffect.currentStacks++;
        existingEffect.remainingTurns = Math.max(existingEffect.remainingTurns, effect.duration);
        return true;
      } else if (!effect.stackable) {
        // Refresh duration
        existingEffect.remainingTurns = effect.duration;
        return true;
      }
      return false;
    } else {
      entity.statusEffects.push({
        ...effect,
        remainingTurns: effect.duration,
        currentStacks: 1
      });
      return true;
    }
  }

  /**
   * Process status effects over time (called periodically)
   */
  static processStatusEffects(entity: CombatEntity): CombatResult {
    let totalDamage = 0;
    let totalHealing = 0;
    const expiredEffects: string[] = [];

    entity.statusEffects.forEach(effect => {
      switch (effect.type) {
        case StatusEffectType.DAMAGE_OVER_TIME:
        case StatusEffectType.POISON:
          totalDamage += effect.value * effect.currentStacks;
          break;
        case StatusEffectType.HEAL_OVER_TIME:
        case StatusEffectType.REGENERATION:
          totalHealing += effect.value * effect.currentStacks;
          break;
      }

      effect.remainingTurns--;
      if (effect.remainingTurns <= 0) {
        expiredEffects.push(effect.id);
      }
    });

    // Remove expired effects
    entity.statusEffects = entity.statusEffects.filter(
      effect => !expiredEffects.includes(effect.id)
    );

    // Apply damage/healing
    if (totalDamage > 0) {
      entity.currentHealth = Math.max(0, entity.currentHealth - totalDamage);
    }
    if (totalHealing > 0) {
      entity.currentHealth = Math.min(entity.stats.maxHealth, entity.currentHealth + totalHealing);
    }

    return {
      success: true,
      damage: totalDamage,
      healing: totalHealing,
      criticalHit: false,
      blocked: false,
      dodged: false,
      statusEffectsApplied: []
    };
  }

  /**
   * Check if an entity is alive
   */
  static isAlive(entity: CombatEntity): boolean {
    return entity.currentHealth > 0;
  }

  /**
   * Check if an entity can act (not stunned, etc.)
   */
  static canAct(entity: CombatEntity): boolean {
    return this.isAlive(entity) && 
           !entity.statusEffects.some(effect => effect.type === StatusEffectType.STUN);
  }

  /**
   * Get skill damage multiplier
   */
  private static getSkillDamageMultiplier(skillType: SkillType): number {
    switch (skillType) {
      case SkillType.COMBAT:
        return 1.2;
      case 'magic' as SkillType:
        return 1.3;
      case 'archery' as SkillType:
        return 1.1;
      default:
        return 1.0;
    }
  }

  /**
   * Apply status effect modifiers to damage or healing
   */
  private static applyStatusEffectModifiers(
    entity: CombatEntity,
    value: number,
    type: 'damage_taken' | 'healing_received'
  ): number {
    let modifier = 1.0;

    entity.statusEffects.forEach(effect => {
      switch (effect.type) {
        case StatusEffectType.DAMAGE_BUFF:
          if (type === 'damage_taken') modifier *= (1 + (effect.value / 100));
          break;
        case StatusEffectType.DAMAGE_DEBUFF:
          if (type === 'damage_taken') modifier *= (1 - (effect.value / 100));
          break;
        case StatusEffectType.DEFENSE_BUFF:
          if (type === 'damage_taken') modifier *= (1 - (effect.value / 100));
          break;
        case StatusEffectType.DEFENSE_DEBUFF:
          if (type === 'damage_taken') modifier *= (1 + (effect.value / 100));
          break;
      }
    });

    return value * modifier;
  }
}