import { describe, it, expect, beforeEach } from 'vitest';
import { CombatService } from '../../services/CombatService';
import {
  CombatEntity,
  CombatAction,
  ActionType,
  EntityType,
  StatusEffectType
} from '../../models/Combat';
import { SkillType } from '../../models/Skill';

describe('CombatService', () => {
  let combatService: CombatService;
  let player: CombatEntity;
  let goblin: CombatEntity;
  let orc: CombatEntity;

  beforeEach(() => {
    combatService = new CombatService();

    player = {
      id: 'player1',
      name: 'TestPlayer',
      type: EntityType.PLAYER,
      level: 10,
      stats: {
        maxHealth: 200,
        maxMana: 100,
        damage: 30,
        defense: 15,
        critChance: 10,
        critDamage: 150,
        speed: 10,
        accuracy: 90,
        evasion: 5
      },
      currentHealth: 200,
      currentMana: 100,
      position: { x: 0, y: 0, z: 0 },
      statusEffects: []
    };

    goblin = {
      id: 'goblin1',
      name: 'goblin',
      type: EntityType.MOB,
      level: 5,
      stats: {
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
      currentHealth: 100,
      currentMana: 50,
      position: { x: 1, y: 0, z: 0 },
      statusEffects: []
    };

    orc = {
      id: 'orc1',
      name: 'orc_warrior',
      type: EntityType.MOB,
      level: 15,
      stats: {
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
      currentHealth: 300,
      currentMana: 100,
      position: { x: 2, y: 0, z: 0 },
      statusEffects: []
    };
  });

  describe('Combat Encounter Management', () => {
    it('should start a combat encounter', async () => {
      const encounterId = await combatService.startCombat([player, goblin]);

      expect(encounterId).toBeDefined();
      expect(typeof encounterId).toBe('string');

      const encounter = combatService.getCombatEncounter(encounterId);
      expect(encounter).toBeDefined();
      expect(encounter!.participants).toHaveLength(2);
      expect(encounter!.isActive).toBe(true);
      expect(encounter!.turnOrder).toHaveLength(2);
    });

    it('should order turns by speed', async () => {
      // Player has speed 10, goblin has speed 8
      const encounterId = await combatService.startCombat([player, goblin]);
      const encounter = combatService.getCombatEncounter(encounterId);

      expect(encounter!.turnOrder[0]).toBe(player.id); // Faster player goes first
      expect(encounter!.turnOrder[1]).toBe(goblin.id);
    });

    it('should handle multiple participants correctly', async () => {
      const encounterId = await combatService.startCombat([player, goblin, orc]);
      const encounter = combatService.getCombatEncounter(encounterId);

      expect(encounter!.participants).toHaveLength(3);
      expect(encounter!.turnOrder).toHaveLength(3);
      // Order should be: player (speed 10), goblin (speed 8), orc (speed 6)
      expect(encounter!.turnOrder[0]).toBe(player.id);
      expect(encounter!.turnOrder[1]).toBe(goblin.id);
      expect(encounter!.turnOrder[2]).toBe(orc.id);
    });
  });

  describe('Combat Actions', () => {
    let encounterId: string;

    beforeEach(async () => {
      encounterId = await combatService.startCombat([player, goblin]);
    });

    it('should execute basic attack', async () => {
      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: goblin.id,
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      const initialHealth = goblin.currentHealth;
      const result = await combatService.executeCombatAction(encounterId, player.id, action);

      expect(result.success).toBe(true);
      expect(result.damage).toBeGreaterThan(0);
      expect(goblin.currentHealth).toBeLessThan(initialHealth);
    });

    it('should execute skill attack', async () => {
      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: goblin.id,
        actionType: ActionType.SKILL_ATTACK,
        skillType: SkillType.COMBAT,
        cooldown: 0,
        manaCost: 20
      };

      const initialMana = player.currentMana;
      const result = await combatService.executeCombatAction(encounterId, player.id, action);

      expect(result.success).toBe(true);
      expect(player.currentMana).toBe(initialMana - 20);
    });

    it('should execute healing action', async () => {
      // Damage player first
      player.currentHealth = 150;

      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: player.id,
        actionType: ActionType.HEAL,
        healing: 30,
        cooldown: 0,
        manaCost: 15
      };

      const result = await combatService.executeCombatAction(encounterId, player.id, action);

      expect(result.success).toBe(true);
      expect(result.healing).toBe(30);
      expect(player.currentHealth).toBe(180);
    });

    it('should execute defend action', async () => {
      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: player.id,
        actionType: ActionType.DEFEND,
        cooldown: 0,
        manaCost: 0
      };

      const result = await combatService.executeCombatAction(encounterId, player.id, action);

      expect(result.success).toBe(true);
      expect(player.statusEffects).toHaveLength(1);
      expect(player.statusEffects[0].type).toBe(StatusEffectType.DEFENSE_BUFF);
    });

    it('should prevent action if insufficient mana', async () => {
      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: goblin.id,
        actionType: ActionType.SKILL_ATTACK,
        cooldown: 0,
        manaCost: 150 // More than player has
      };

      await expect(
        combatService.executeCombatAction(encounterId, player.id, action)
      ).rejects.toThrow('Insufficient mana');
    });

    it('should prevent action if actor is dead', async () => {
      player.currentHealth = 0;

      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: goblin.id,
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      await expect(
        combatService.executeCombatAction(encounterId, player.id, action)
      ).rejects.toThrow('Actor cannot act');
    });

    it('should prevent action if actor is stunned', async () => {
      player.statusEffects.push({
        id: 'stun',
        name: 'Stunned',
        type: StatusEffectType.STUN,
        duration: 1,
        remainingTurns: 1,
        value: 0,
        stackable: false,
        currentStacks: 1,
        maxStacks: 1,
        source: 'stun_spell'
      });

      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: goblin.id,
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      await expect(
        combatService.executeCombatAction(encounterId, player.id, action)
      ).rejects.toThrow('Actor cannot act');
    });
  });

  describe('Mob AI', () => {
    let encounterId: string;

    beforeEach(async () => {
      encounterId = await combatService.startCombat([player, goblin]);
    });

    it('should process mob turn', async () => {
      const result = await combatService.processMobTurn(encounterId, goblin.id);

      expect(result).toBeDefined();
      if (result) {
        expect(result.success).toBe(true);
        expect(player.currentHealth).toBeLessThan(200); // Player should take damage
      }
    });

    it('should not process turn for dead mob', async () => {
      goblin.currentHealth = 0;

      const result = await combatService.processMobTurn(encounterId, goblin.id);

      expect(result).toBeNull();
    });

    it('should not process turn for stunned mob', async () => {
      goblin.statusEffects.push({
        id: 'stun',
        name: 'Stunned',
        type: StatusEffectType.STUN,
        duration: 1,
        remainingTurns: 1,
        value: 0,
        stackable: false,
        currentStacks: 1,
        maxStacks: 1,
        source: 'stun_spell'
      });

      const result = await combatService.processMobTurn(encounterId, goblin.id);

      expect(result).toBeNull();
    });
  });

  describe('Combat End Conditions', () => {
    let encounterId: string;

    beforeEach(async () => {
      encounterId = await combatService.startCombat([player, goblin]);
    });

    it('should end combat when all mobs are defeated', async () => {
      // Kill the goblin
      goblin.currentHealth = 0;

      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: goblin.id,
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      await combatService.executeCombatAction(encounterId, player.id, action);

      const encounter = combatService.getCombatEncounter(encounterId);
      expect(encounter!.isActive).toBe(false);
      expect(encounter!.winner).toBe('players');
    });

    it('should end combat when all players are defeated', async () => {
      // Kill the player
      player.currentHealth = 0;

      const action: CombatAction = {
        id: 'action1',
        actorId: goblin.id,
        targetId: player.id,
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      await combatService.executeCombatAction(encounterId, goblin.id, action);

      const encounter = combatService.getCombatEncounter(encounterId);
      expect(encounter!.isActive).toBe(false);
      expect(encounter!.winner).toBe('mobs');
    });
  });

  describe('Status Effect Processing', () => {
    let encounterId: string;

    beforeEach(async () => {
      encounterId = await combatService.startCombat([player, goblin]);
    });

    it('should process status effects for all participants', async () => {
      // Add poison to player
      player.statusEffects.push({
        id: 'poison',
        name: 'Poison',
        type: StatusEffectType.POISON,
        duration: 3,
        remainingTurns: 3,
        value: 10,
        stackable: false,
        currentStacks: 1,
        maxStacks: 1,
        source: 'poison_dart'
      });

      // Add regeneration to goblin
      goblin.currentHealth = 80;
      goblin.statusEffects.push({
        id: 'regen',
        name: 'Regeneration',
        type: StatusEffectType.REGENERATION,
        duration: 2,
        remainingTurns: 2,
        value: 15,
        stackable: false,
        currentStacks: 1,
        maxStacks: 1,
        source: 'healing_potion'
      });

      const initialPlayerHealth = player.currentHealth;
      const initialGoblinHealth = goblin.currentHealth;

      const results = await combatService.processStatusEffects(encounterId);

      expect(results.size).toBe(2);
      expect(player.currentHealth).toBe(initialPlayerHealth - 10); // Poison damage
      expect(goblin.currentHealth).toBe(initialGoblinHealth + 15); // Regeneration healing
    });
  });

  describe('Combat Rewards', () => {
    it('should calculate rewards when players win', async () => {
      const encounterId = await combatService.startCombat([player, goblin]);
      
      // Kill the goblin to end combat
      goblin.currentHealth = 0;
      
      const rewards = await combatService.endCombat(encounterId, 'players');

      expect(rewards).toBeDefined();
      expect(rewards!.experience.has(SkillType.COMBAT)).toBe(true);
      expect(rewards!.experience.get(SkillType.COMBAT)).toBeGreaterThan(0);
      expect(rewards!.currency).toBeGreaterThan(0);
      expect(rewards!.items.length).toBeGreaterThanOrEqual(0);
    });

    it('should not give rewards when players lose', async () => {
      const encounterId = await combatService.startCombat([player, goblin]);
      
      const rewards = await combatService.endCombat(encounterId, 'mobs');

      expect(rewards).toBeDefined();
      expect(rewards!.experience.size).toBe(0);
      expect(rewards!.currency).toBe(0);
      expect(rewards!.items).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid encounter ID', async () => {
      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: goblin.id,
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      await expect(
        combatService.executeCombatAction('invalid_id', player.id, action)
      ).rejects.toThrow('Combat encounter not found');
    });

    it('should handle invalid actor ID', async () => {
      const encounterId = await combatService.startCombat([player, goblin]);
      
      const action: CombatAction = {
        id: 'action1',
        actorId: 'invalid_actor',
        targetId: goblin.id,
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      await expect(
        combatService.executeCombatAction(encounterId, 'invalid_actor', action)
      ).rejects.toThrow('Actor or target not found');
    });

    it('should handle invalid target ID', async () => {
      const encounterId = await combatService.startCombat([player, goblin]);
      
      const action: CombatAction = {
        id: 'action1',
        actorId: player.id,
        targetId: 'invalid_target',
        actionType: ActionType.BASIC_ATTACK,
        cooldown: 0,
        manaCost: 0
      };

      await expect(
        combatService.executeCombatAction(encounterId, player.id, action)
      ).rejects.toThrow('Actor or target not found');
    });
  });
});