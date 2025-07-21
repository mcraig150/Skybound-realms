import {
  CombatEntity,
  CombatAction,
  CombatResult,
  CombatZone,
  CombatEncounter,
  ActiveCombat,
  MobSpawn,
  CombatRewards,
  MobAI,
  MobBehaviorType,
  MobTemplate,
  MobAbility,
  StatusEffect,
  StatusEffectType,
  ActionType,
  EntityType,
  ZoneType,
  CombatCalculator
} from '../models/Combat';
import { ItemStack } from '../models/Item';
import { SkillType } from '../models/Skill';
import { Vector3 } from '../shared/types';
import { Utils } from '../shared/utils';
import { GAME_CONSTANTS } from '../shared/constants';

export class CombatService {
  private combatZones: Map<string, CombatZone> = new Map();
  private mobAIs: Map<string, MobAI> = new Map();
  private mobTemplates: Map<string, MobTemplate> = new Map();
  private actionCooldowns: Map<string, Map<string, number>> = new Map(); // entityId -> actionType -> cooldownEnd

  constructor() {
    this.initializeMobTemplates();
    this.startCombatLoop();
  }

  /**
   * Start a combat encounter with multiple participants
   */
  async startCombat(participants: CombatEntity[]): Promise<string> {
    if (participants.length < 2) {
      throw new Error('Combat requires at least 2 participants');
    }

    // Create a temporary combat zone for this encounter
    const zoneId = `combat_${Utils.generateId()}`;
    const zone = await this.createCombatZone(zoneId, 'Combat Zone', ZoneType.DUNGEON, 1);

    // Add all participants to the zone
    for (const participant of participants) {
      zone.entities.set(participant.id, participant);
      
      // Initialize AI for mobs
      if (participant.type === EntityType.MOB || participant.type === EntityType.BOSS) {
        this.initializeMobAI(participant);
      }
    }

    return zoneId;
  }

  /**
   * Get combat encounter by ID
   */
  getCombatEncounter(encounterId: string): CombatEncounter | null {
    const zone = this.combatZones.get(encounterId);
    if (!zone) {
      return null;
    }

    // Convert zone to encounter format expected by tests
    const participants = Array.from(zone.entities.values());
    const turnOrder = participants
      .sort((a, b) => b.stats.speed - a.stats.speed)
      .map(p => p.id);

    // Check if combat is still active
    const alivePlayers = participants.filter(p => p.type === EntityType.PLAYER && CombatCalculator.isAlive(p));
    const aliveMobs = participants.filter(p => (p.type === EntityType.MOB || p.type === EntityType.BOSS) && CombatCalculator.isAlive(p));
    
    const isActive = alivePlayers.length > 0 && aliveMobs.length > 0;
    
    const encounter: CombatEncounter = {
      id: encounterId,
      participants,
      turnOrder,
      isActive,
      currentTurn: 0,
      round: 1
    };
    
    if (!isActive) {
      encounter.winner = alivePlayers.length > 0 ? 'players' : 'mobs';
    }

    return encounter;
  }

  /**
   * End combat and calculate rewards
   */
  async endCombat(encounterId: string, winner: 'players' | 'mobs'): Promise<CombatRewards> {
    const zone = this.combatZones.get(encounterId);
    if (!zone) {
      return {
        experience: new Map(),
        items: [],
        currency: 0
      };
    }

    let rewards: CombatRewards = {
      experience: new Map(),
      items: [],
      currency: 0
    };

    if (winner === 'players') {
      // Calculate rewards for players
      const defeatedMobs = Array.from(zone.entities.values()).filter(e => 
        (e.type === EntityType.MOB || e.type === EntityType.BOSS) && !CombatCalculator.isAlive(e)
      );

      defeatedMobs.forEach(mob => {
        const template = this.mobTemplates.get(mob.name);
        if (template) {
          const mobRewards = this.calculateMobRewards(template);
          
          // Combine experience
          mobRewards.experience.forEach((exp, skill) => {
            const currentExp = rewards.experience.get(skill) || 0;
            rewards.experience.set(skill, currentExp + exp);
          });

          // Combine items
          rewards.items.push(...mobRewards.items);
          rewards.currency += mobRewards.currency;
        }
      });
    }

    // Clean up the combat zone
    this.combatZones.delete(encounterId);

    return rewards;
  }

  /**
   * Create or get a combat zone
   */
  async createCombatZone(zoneId: string, name: string, type: ZoneType, level: number): Promise<CombatZone> {
    if (this.combatZones.has(zoneId)) {
      return this.combatZones.get(zoneId)!;
    }

    const zone: CombatZone = {
      id: zoneId,
      name,
      type,
      level,
      entities: new Map(),
      activeCombats: new Map(),
      mobSpawns: [],
      lastUpdate: new Date()
    };

    this.combatZones.set(zoneId, zone);
    this.initializeZoneMobSpawns(zone);
    
    return zone;
  }

  /**
   * Add player to combat zone
   */
  async enterZone(zoneId: string, player: CombatEntity): Promise<boolean> {
    const zone = this.combatZones.get(zoneId);
    if (!zone) {
      throw new Error('Combat zone not found');
    }

    zone.entities.set(player.id, player);
    return true;
  }

  /**
   * Remove player from combat zone
   */
  async exitZone(zoneId: string, playerId: string): Promise<boolean> {
    const zone = this.combatZones.get(zoneId);
    if (!zone) {
      return false;
    }

    zone.entities.delete(playerId);
    
    // Remove any active combats involving this player
    const combatsToRemove: string[] = [];
    zone.activeCombats.forEach((combat, combatId) => {
      if (combat.attackerId === playerId || combat.targetId === playerId) {
        combatsToRemove.push(combatId);
      }
    });
    
    combatsToRemove.forEach(combatId => {
      zone.activeCombats.delete(combatId);
    });

    return true;
  }

  /**
   * Execute a combat action in real-time
   */
  async executeCombatAction(
    zoneId: string,
    actorId: string,
    action: CombatAction
  ): Promise<CombatResult> {
    const zone = this.combatZones.get(zoneId);
    if (!zone) {
      throw new Error('Combat encounter not found');
    }

    const actor = zone.entities.get(actorId);
    const target = zone.entities.get(action.targetId);

    if (!actor || !target) {
      throw new Error('Actor or target not found in zone');
    }

    if (!CombatCalculator.canAct(actor)) {
      throw new Error('Actor cannot act (stunned, dead, etc.)');
    }

    // Check cooldowns
    if (!this.canPerformAction(actorId, action.actionType)) {
      throw new Error('Action is on cooldown');
    }

    // Validate mana cost
    if (actor.currentMana < action.manaCost) {
      throw new Error('Insufficient mana');
    }

    // Check range for attacks
    if (action.actionType === ActionType.BASIC_ATTACK || action.actionType === ActionType.SKILL_ATTACK) {
      const distance = this.calculateDistance(actor.position, target.position);
      const maxRange = action.actionType === ActionType.SKILL_ATTACK ? 10 : 2; // Skills have longer range
      if (distance > maxRange) {
        throw new Error('Target is out of range');
      }
    }

    let result: CombatResult;

    switch (action.actionType) {
      case ActionType.BASIC_ATTACK:
      case ActionType.SKILL_ATTACK:
        result = CombatCalculator.calculateDamage(actor, target, action);
        target.currentHealth = Math.max(0, target.currentHealth - result.damage);
        
        // Start combat between these entities
        this.startCombatBetween(zone, actorId, action.targetId);
        break;

      case ActionType.HEAL:
        const healing = CombatCalculator.calculateHealing(actor, target, action.healing || 0);
        target.currentHealth = Math.min(target.stats.maxHealth, target.currentHealth + healing);
        result = {
          success: true,
          damage: 0,
          healing,
          criticalHit: false,
          blocked: false,
          dodged: false,
          statusEffectsApplied: action.statusEffects || []
        };
        break;

      case ActionType.DEFEND:
        // Apply defense buff
        const defenseEffect: StatusEffect = {
          id: 'defend_buff',
          name: 'Defending',
          type: StatusEffectType.DEFENSE_BUFF,
          duration: 5000, // 5 seconds in milliseconds
          remainingTurns: 5000,
          value: 50, // 50% damage reduction
          stackable: false,
          currentStacks: 1,
          maxStacks: 1,
          source: actorId
        };
        CombatCalculator.applyStatusEffect(actor, defenseEffect);
        result = {
          success: true,
          damage: 0,
          healing: 0,
          criticalHit: false,
          blocked: false,
          dodged: false,
          statusEffectsApplied: [defenseEffect]
        };
        break;

      default:
        throw new Error('Invalid action type');
    }

    // Apply status effects
    if (action.statusEffects) {
      action.statusEffects.forEach(effect => {
        CombatCalculator.applyStatusEffect(target, effect);
      });
    }

    // Consume mana
    actor.currentMana = Math.max(0, actor.currentMana - action.manaCost);

    // Set cooldown
    this.setCooldown(actorId, action.actionType, action.cooldown);

    // Check if target died
    if (!CombatCalculator.isAlive(target)) {
      await this.handleEntityDeath(zone, target);
    }

    return result;
  }

  /**
   * Start combat loop for real-time processing
   */
  private startCombatLoop(): void {
    setInterval(() => {
      this.processCombatZones();
    }, 100); // Process every 100ms for real-time feel
  }

  /**
   * Process all combat zones
   */
  private processCombatZones(): void {
    this.combatZones.forEach(zone => {
      this.processZone(zone);
    });
  }

  /**
   * Process a single combat zone
   */
  private processZone(zone: CombatZone): void {
    // Process mob AI
    zone.entities.forEach(entity => {
      if ((entity.type === EntityType.MOB || entity.type === EntityType.BOSS) && CombatCalculator.isAlive(entity)) {
        this.processMobAI(zone, entity);
      }
    });

    // Process status effects for all entities
    zone.entities.forEach(entity => {
      if (CombatCalculator.isAlive(entity)) {
        CombatCalculator.processStatusEffects(entity);
      }
    });

    // Spawn mobs if needed
    this.processMobSpawns(zone);

    // Clean up dead entities and inactive combats
    this.cleanupZone(zone);
  }

  /**
   * Process mob AI in real-time
   */
  private processMobAI(zone: CombatZone, mob: CombatEntity): void {
    const ai = this.mobAIs.get(mob.id);
    if (!ai || !CombatCalculator.canAct(mob)) {
      return;
    }

    // Check if enough time has passed since last action
    const now = new Date();
    if (now.getTime() - ai.lastAction.getTime() < ai.actionCooldown) {
      return;
    }

    // Find nearby players to target
    const nearbyPlayers = Array.from(zone.entities.values()).filter(entity => 
      entity.type === EntityType.PLAYER && 
      CombatCalculator.isAlive(entity) &&
      this.calculateDistance(mob.position, entity.position) <= ai.aggroRange
    );

    if (nearbyPlayers.length === 0) {
      return;
    }

    // Select target
    const target = this.selectTarget(mob, nearbyPlayers, ai);
    if (!target) {
      return;
    }

    // Check if target is in attack range
    const distance = this.calculateDistance(mob.position, target.position);
    if (distance > ai.attackRange) {
      // Move towards target (simplified - just reduce distance)
      const moveSpeed = mob.stats.speed * 0.1;
      const direction = {
        x: (target.position.x - mob.position.x) / distance,
        y: (target.position.y - mob.position.y) / distance,
        z: (target.position.z - mob.position.z) / distance
      };
      
      mob.position.x += direction.x * moveSpeed;
      mob.position.y += direction.y * moveSpeed;
      mob.position.z += direction.z * moveSpeed;
      return;
    }

    // Execute attack
    const action = this.selectMobAction(mob, target, ai);
    if (action) {
      this.executeCombatAction(zone.id, mob.id, action).catch(console.error);
      ai.lastAction = now;
    }
  }

  /**
   * Initialize mob spawns for a zone
   */
  private initializeZoneMobSpawns(zone: CombatZone): void {
    // Add some basic mob spawns based on zone type and level
    const spawnCount = Math.min(5, Math.max(1, Math.floor(zone.level / 10)));
    
    for (let i = 0; i < spawnCount; i++) {
      const spawn: MobSpawn = {
        id: Utils.generateId(),
        mobTemplateId: this.selectMobTemplateForZone(zone),
        position: this.generateRandomPosition(zone),
        respawnTime: 30000, // 30 seconds
        lastSpawn: new Date(0), // Force immediate spawn
        maxCount: 2,
        currentCount: 0
      };
      
      zone.mobSpawns.push(spawn);
    }
  }

  /**
   * Process mob spawns
   */
  private processMobSpawns(zone: CombatZone): void {
    const now = new Date();
    
    zone.mobSpawns.forEach(spawn => {
      if (spawn.currentCount < spawn.maxCount && 
          now.getTime() - spawn.lastSpawn.getTime() >= spawn.respawnTime) {
        
        const template = this.mobTemplates.get(spawn.mobTemplateId);
        if (template) {
          const mob = this.createMobFromTemplate(template, spawn.position);
          zone.entities.set(mob.id, mob);
          this.initializeMobAI(mob);
          
          spawn.currentCount++;
          spawn.lastSpawn = now;
        }
      }
    });
  }

  /**
   * Create mob from template
   */
  private createMobFromTemplate(template: MobTemplate, position: Vector3): CombatEntity {
    return {
      id: Utils.generateId(),
      name: template.name,
      type: template.behaviorType === MobBehaviorType.BOSS ? EntityType.BOSS : EntityType.MOB,
      level: template.level,
      stats: { ...template.baseStats },
      currentHealth: template.baseStats.maxHealth,
      currentMana: template.baseStats.maxMana,
      position: { ...position },
      statusEffects: []
    };
  }

  /**
   * Handle entity death
   */
  private async handleEntityDeath(zone: CombatZone, entity: CombatEntity): Promise<void> {
    if (entity.type === EntityType.MOB || entity.type === EntityType.BOSS) {
      // Calculate rewards for nearby players
      const nearbyPlayers = Array.from(zone.entities.values()).filter(e => 
        e.type === EntityType.PLAYER && 
        this.calculateDistance(e.position, entity.position) <= 10
      );

      if (nearbyPlayers.length > 0) {
        const template = this.mobTemplates.get(entity.name);
        if (template) {
          const rewards = this.calculateMobRewards(template);
          // TODO: Distribute rewards to nearby players
        }
      }

      // Update spawn count
      zone.mobSpawns.forEach(spawn => {
        if (spawn.mobTemplateId === entity.name) {
          spawn.currentCount = Math.max(0, spawn.currentCount - 1);
        }
      });
    }

    // Remove entity from zone
    zone.entities.delete(entity.id);
    this.mobAIs.delete(entity.id);
  }

  /**
   * Calculate rewards for defeating a mob
   */
  private calculateMobRewards(template: MobTemplate): CombatRewards {
    const rewards: CombatRewards = {
      experience: new Map(),
      items: [],
      currency: 0
    };

    // Add experience
    rewards.experience.set(SkillType.COMBAT, template.experienceReward);

    // Add currency
    rewards.currency = Math.floor(template.level * 10);

    // Roll for loot drops
    template.lootTable.forEach(drop => {
      if (Math.random() < drop.dropChance) {
        rewards.items.push({
          itemId: drop.itemId,
          quantity: drop.quantity
        });
      }
    });

    return rewards;
  }

  /**
   * Start combat between two entities
   */
  private startCombatBetween(zone: CombatZone, attackerId: string, targetId: string): void {
    const combatId = `${attackerId}_${targetId}`;
    
    if (!zone.activeCombats.has(combatId)) {
      const combat: ActiveCombat = {
        id: combatId,
        attackerId,
        targetId,
        startTime: new Date(),
        lastAction: new Date(),
        isActive: true
      };
      
      zone.activeCombats.set(combatId, combat);
    } else {
      // Update last action time
      const combat = zone.activeCombats.get(combatId)!;
      combat.lastAction = new Date();
    }
  }

  /**
   * Check if an action can be performed (cooldown check)
   */
  private canPerformAction(entityId: string, actionType: ActionType): boolean {
    const entityCooldowns = this.actionCooldowns.get(entityId);
    if (!entityCooldowns) {
      return true;
    }

    const cooldownEnd = entityCooldowns.get(actionType);
    if (!cooldownEnd) {
      return true;
    }

    return Date.now() >= cooldownEnd;
  }

  /**
   * Set cooldown for an action
   */
  private setCooldown(entityId: string, actionType: ActionType, cooldownMs: number): void {
    if (!this.actionCooldowns.has(entityId)) {
      this.actionCooldowns.set(entityId, new Map());
    }

    const entityCooldowns = this.actionCooldowns.get(entityId)!;
    entityCooldowns.set(actionType, Date.now() + cooldownMs);
  }

  /**
   * Clean up dead entities and inactive combats
   */
  private cleanupZone(zone: CombatZone): void {
    const now = new Date();
    
    // Remove inactive combats (no action for 30 seconds)
    const combatsToRemove: string[] = [];
    zone.activeCombats.forEach((combat, combatId) => {
      if (now.getTime() - combat.lastAction.getTime() > 30000) {
        combatsToRemove.push(combatId);
      }
    });
    
    combatsToRemove.forEach(combatId => {
      zone.activeCombats.delete(combatId);
    });
  }

  /**
   * Select appropriate mob template for zone
   */
  private selectMobTemplateForZone(zone: CombatZone): string {
    // Simple selection based on zone level
    if (zone.level <= 10) {
      return 'goblin';
    } else if (zone.level <= 30) {
      return 'orc_warrior';
    } else {
      return 'fire_dragon';
    }
  }

  /**
   * Generate random position within zone
   */
  private generateRandomPosition(zone: CombatZone): Vector3 {
    // Simple random position generation
    return {
      x: Math.random() * 100 - 50,
      y: 0,
      z: Math.random() * 100 - 50
    };
  }

  /**
   * Initialize mob AI
   */
  private initializeMobAI(mob: CombatEntity): void {
    const template = this.mobTemplates.get(mob.name);
    if (!template) {
      return;
    }

    const ai: MobAI = {
      mobId: mob.id,
      behaviorType: template.behaviorType,
      aggroRange: 10,
      attackRange: 2,
      aggroList: new Map(),
      lastAction: new Date(),
      actionCooldown: 1000 // 1 second
    };

    this.mobAIs.set(mob.id, ai);
  }

  /**
   * Select target for mob AI
   */
  private selectTarget(
    mob: CombatEntity,
    participants: CombatEntity[],
    ai: MobAI
  ): CombatEntity | null {
    const players = participants.filter(p => 
      p.type === EntityType.PLAYER && 
      CombatCalculator.isAlive(p)
    );

    if (players.length === 0) {
      return null;
    }

    switch (ai.behaviorType) {
      case MobBehaviorType.AGGRESSIVE:
        // Target player with highest aggro
        let highestAggro = 0;
        let target: CombatEntity | null = null;
        
        players.forEach(player => {
          const aggro = ai.aggroList.get(player.id) || 0;
          if (aggro > highestAggro) {
            highestAggro = aggro;
            target = player;
          }
        });

        return target ?? (players.length > 0 ? players[0] ?? null : null);

      case MobBehaviorType.DEFENSIVE:
        // Target closest player
        return this.getClosestEntity(mob, players);

      case MobBehaviorType.BOSS:
        // Complex targeting logic for bosses
        return this.getBossTarget(mob, players, ai);

      default:
        return players.length > 0 ? players[0] ?? null : null;
    }
  }

  /**
   * Select action for mob AI
   */
  private selectMobAction(
    mob: CombatEntity,
    target: CombatEntity,
    ai: MobAI
  ): CombatAction | null {
    const template = this.mobTemplates.get(mob.name);
    if (!template) {
      return this.createBasicAttack(mob, target);
    }

    // Check if any abilities can be used
    const usableAbilities = template.abilities.filter(ability => 
      this.canUseAbility(mob, ability)
    );

    if (usableAbilities.length > 0) {
      // Select ability based on conditions
      const selectedAbility = this.selectBestAbility(mob, target, usableAbilities);
      if (selectedAbility) {
        return this.createAbilityAction(mob, target, selectedAbility);
      }
    }

    return this.createBasicAttack(mob, target);
  }

  /**
   * Create basic attack action
   */
  private createBasicAttack(attacker: CombatEntity, target: CombatEntity): CombatAction {
    return {
      id: Utils.generateId(),
      actorId: attacker.id,
      targetId: target.id,
      actionType: ActionType.BASIC_ATTACK,
      damage: attacker.stats.damage,
      cooldown: 0,
      manaCost: 0
    };
  }

  /**
   * Create ability action
   */
  private createAbilityAction(
    attacker: CombatEntity,
    target: CombatEntity,
    ability: MobAbility
  ): CombatAction {
    return {
      id: Utils.generateId(),
      actorId: attacker.id,
      targetId: target.id,
      actionType: ActionType.SKILL_ATTACK,
      damage: ability.damage,
      statusEffects: ability.statusEffects,
      cooldown: ability.cooldown,
      manaCost: ability.manaCost
    };
  }



  /**
   * Get closest entity
   */
  private getClosestEntity(from: CombatEntity, entities: CombatEntity[]): CombatEntity | null {
    if (entities.length === 0) return null;

    let closest = entities[0];
    if (!closest) return null;
    
    let closestDistance = this.calculateDistance(from.position, closest.position);

    entities.forEach(entity => {
      const distance = this.calculateDistance(from.position, entity.position);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = entity;
      }
    });

    return closest;
  }

  /**
   * Calculate distance between two positions
   */
  private calculateDistance(pos1: Vector3, pos2: Vector3): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Get boss target (more complex logic)
   */
  private getBossTarget(
    boss: CombatEntity,
    players: CombatEntity[],
    ai: MobAI
  ): CombatEntity | null {
    // Boss AI can switch targets based on various factors
    // For now, target the player with lowest health percentage
    if (players.length === 0) return null;
    
    let target = players[0];
    if (!target) return null;
    let lowestHealthPercent = target.currentHealth / target.stats.maxHealth;

    players.forEach(player => {
      const healthPercent = player.currentHealth / player.stats.maxHealth;
      if (healthPercent < lowestHealthPercent) {
        lowestHealthPercent = healthPercent;
        target = player;
      }
    });

    return target ?? null;
  }

  /**
   * Check if mob can use ability
   */
  private canUseAbility(mob: CombatEntity, ability: MobAbility): boolean {
    if (mob.currentMana < ability.manaCost) {
      return false;
    }

    if (ability.usageCondition) {
      const condition = ability.usageCondition;
      
      if (condition.healthThreshold) {
        const healthPercent = (mob.currentHealth / mob.stats.maxHealth) * 100;
        if (healthPercent > condition.healthThreshold) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Select best ability for current situation
   */
  private selectBestAbility(
    mob: CombatEntity,
    target: CombatEntity,
    abilities: MobAbility[]
  ): MobAbility | null {
    // Simple selection - prefer higher damage abilities
    return abilities.reduce((best, current) => 
      current.damage > best.damage ? current : best
    );
  }

  /**
   * Process mob turn (for turn-based combat tests)
   */
  async processMobTurn(encounterId: string, mobId: string): Promise<CombatResult | null> {
    const zone = this.combatZones.get(encounterId);
    if (!zone) {
      return null;
    }

    const mob = zone.entities.get(mobId);
    if (!mob || !CombatCalculator.canAct(mob)) {
      return null;
    }

    // Find a target to attack
    const players = Array.from(zone.entities.values()).filter(e => 
      e.type === EntityType.PLAYER && CombatCalculator.isAlive(e)
    );

    if (players.length === 0) {
      return null;
    }

    const target = players[0]; // Simple target selection
    if (!target) return null;
    const action = this.createBasicAttack(mob, target);
    
    return await this.executeCombatAction(encounterId, mobId, action);
  }

  /**
   * Process status effects for all participants in an encounter
   */
  async processStatusEffects(encounterId: string): Promise<Map<string, CombatResult>> {
    const zone = this.combatZones.get(encounterId);
    const results = new Map<string, CombatResult>();
    
    if (!zone) {
      return results;
    }

    zone.entities.forEach((entity, entityId) => {
      if (CombatCalculator.isAlive(entity)) {
        const result = CombatCalculator.processStatusEffects(entity);
        results.set(entityId, result);
      }
    });

    return results;
  }

  /**
   * Initialize mob templates
   */
  private initializeMobTemplates(): void {
    // Basic Goblin
    this.mobTemplates.set('goblin', {
      id: 'goblin',
      name: 'Goblin',
      level: 5,
      baseStats: {
        maxHealth: 100,
        maxMana: 50,
        damage: 15,
        defense: 5,
        critChance: 5,
        critDamage: 150,
        speed: 8,
        accuracy: 85,
        evasion: 10
      },
      behaviorType: MobBehaviorType.AGGRESSIVE,
      abilities: [],
      lootTable: [
        { itemId: 'goblin_ear', quantity: 1, dropChance: 0.8 },
        { itemId: 'copper_coin', quantity: 5, dropChance: 0.6 }
      ],
      experienceReward: 25,
      spawnWeight: 10
    });

    // Orc Warrior
    this.mobTemplates.set('orc_warrior', {
      id: 'orc_warrior',
      name: 'Orc Warrior',
      level: 15,
      baseStats: {
        maxHealth: 300,
        maxMana: 100,
        damage: 35,
        defense: 20,
        critChance: 10,
        critDamage: 175,
        speed: 6,
        accuracy: 80,
        evasion: 5
      },
      behaviorType: MobBehaviorType.AGGRESSIVE,
      abilities: [
        {
          id: 'power_strike',
          name: 'Power Strike',
          damage: 50,
          manaCost: 20,
          cooldown: 3,
          range: 2,
          statusEffects: [],
          usageCondition: { healthThreshold: 50 }
        }
      ],
      lootTable: [
        { itemId: 'orc_tusk', quantity: 1, dropChance: 0.7 },
        { itemId: 'iron_sword', quantity: 1, dropChance: 0.1 },
        { itemId: 'silver_coin', quantity: 10, dropChance: 0.8 }
      ],
      experienceReward: 75,
      spawnWeight: 5
    });

    // Dragon Boss
    this.mobTemplates.set('fire_dragon', {
      id: 'fire_dragon',
      name: 'Fire Dragon',
      level: 50,
      baseStats: {
        maxHealth: 2000,
        maxMana: 500,
        damage: 100,
        defense: 50,
        critChance: 20,
        critDamage: 200,
        speed: 12,
        accuracy: 95,
        evasion: 15
      },
      behaviorType: MobBehaviorType.BOSS,
      abilities: [
        {
          id: 'fire_breath',
          name: 'Fire Breath',
          damage: 150,
          manaCost: 50,
          cooldown: 5,
          range: 10,
          statusEffects: [
            {
              id: 'burn',
              name: 'Burning',
              type: StatusEffectType.DAMAGE_OVER_TIME,
              duration: 3,
              remainingTurns: 3,
              value: 20,
              stackable: true,
              currentStacks: 1,
              maxStacks: 3,
              source: 'fire_dragon'
            }
          ]
        }
      ],
      lootTable: [
        { itemId: 'dragon_scale', quantity: 3, dropChance: 1.0 },
        { itemId: 'dragon_heart', quantity: 1, dropChance: 0.5 },
        { itemId: 'legendary_weapon', quantity: 1, dropChance: 0.1 },
        { itemId: 'gold_coin', quantity: 100, dropChance: 1.0 }
      ],
      experienceReward: 500,
      spawnWeight: 1
    });
  }
}