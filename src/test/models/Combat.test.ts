import { describe, it, expect, beforeEach } from 'vitest';
import {
  CombatEntity,
  CombatAction,
  CombatCalculator,
  StatusEffect,
  StatusEffectType,
  ActionType,
  EntityType
} from '../../models/Combat';
import { SkillType } from '../../models/Skill';

describe('Combat System', () => {
  let player: CombatEntity;
  let goblin: CombatEntity;

  beforeEach(() => {
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
      name: 'Goblin',
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
  });

  describe('CombatCalculator', () => {
    describe('calculateDamage', () => {
      it('should calculate basic damage correctly', () => {
        const action: CombatAction = {
          id: 'action1',
          actorId: player.id,
          targetId: goblin.id,
          actionType: ActionType.BASIC_ATTACK,
          cooldown: 0,
          manaCost: 0
        };

        const result = CombatCalculator.calculateDamage(player, goblin, action);

        expect(result.success).toBe(true);
        expect(result.damage).toBeGreaterThan(0);
        expect(result.damage).toBeLessThanOrEqual(player.stats.damage);
      });

      it('should apply defense reduction correctly', () => {
        const action: CombatAction = {
          id: 'action1',
          actorId: player.id,
          targetId: goblin.id,
          actionType: ActionType.BASIC_ATTACK,
          cooldown: 0,
          manaCost: 0
        };

        // Test with high defense target (remove randomness)
        const normalTarget = { 
          ...goblin, 
          stats: { ...goblin.stats, evasion: 0, critChance: 0 }
        };
        const armoredTarget = { 
          ...goblin, 
          stats: { ...goblin.stats, defense: 100, evasion: 0, critChance: 0 }
        };

        const normalResult = CombatCalculator.calculateDamage(player, normalTarget, action);
        const armoredResult = CombatCalculator.calculateDamage(player, armoredTarget, action);

        expect(armoredResult.damage).toBeLessThan(normalResult.damage);
      });

      it('should handle critical hits', () => {
        const action: CombatAction = {
          id: 'action1',
          actorId: player.id,
          targetId: goblin.id,
          actionType: ActionType.BASIC_ATTACK,
          cooldown: 0,
          manaCost: 0
        };

        // Force critical hit by setting 100% crit chance
        const critPlayer = { ...player };
        critPlayer.stats.critChance = 100;

        const result = CombatCalculator.calculateDamage(critPlayer, goblin, action);

        expect(result.criticalHit).toBe(true);
        expect(result.damage).toBeGreaterThan(player.stats.damage);
      });

      it('should handle dodge correctly', () => {
        const action: CombatAction = {
          id: 'action1',
          actorId: player.id,
          targetId: goblin.id,
          actionType: ActionType.BASIC_ATTACK,
          cooldown: 0,
          manaCost: 0
        };

        // Force dodge by setting 100% evasion
        const evasiveTarget = { ...goblin };
        evasiveTarget.stats.evasion = 100;

        const result = CombatCalculator.calculateDamage(player, evasiveTarget, action);

        expect(result.dodged).toBe(true);
        expect(result.damage).toBe(0);
      });

      it('should apply skill damage multipliers', () => {
        const basicAction: CombatAction = {
          id: 'action1',
          actorId: player.id,
          targetId: goblin.id,
          actionType: ActionType.BASIC_ATTACK,
          cooldown: 0,
          manaCost: 0
        };

        const skillAction: CombatAction = {
          id: 'action2',
          actorId: player.id,
          targetId: goblin.id,
          actionType: ActionType.SKILL_ATTACK,
          skillType: SkillType.COMBAT,
          cooldown: 0,
          manaCost: 10
        };

        // Set fixed values to avoid randomness
        const testPlayer = { ...player };
        testPlayer.stats.critChance = 0;
        const testGoblin = { ...goblin };
        testGoblin.stats.evasion = 0;

        const basicResult = CombatCalculator.calculateDamage(testPlayer, testGoblin, basicAction);
        const skillResult = CombatCalculator.calculateDamage(testPlayer, testGoblin, skillAction);

        expect(skillResult.damage).toBeGreaterThan(basicResult.damage);
      });
    });

    describe('calculateHealing', () => {
      it('should calculate healing correctly', () => {
        const damagedPlayer = { ...player };
        damagedPlayer.currentHealth = 100;

        const healing = CombatCalculator.calculateHealing(player, damagedPlayer, 50);

        expect(healing).toBe(50);
      });

      it('should not exceed max health', () => {
        const nearFullPlayer = { ...player };
        nearFullPlayer.currentHealth = 190;

        const healing = CombatCalculator.calculateHealing(player, nearFullPlayer, 50);

        expect(healing).toBe(10); // Only heal to max health
      });

      it('should not heal if already at max health', () => {
        const healing = CombatCalculator.calculateHealing(player, player, 50);

        expect(healing).toBe(0);
      });
    });

    describe('Status Effects', () => {
      it('should apply new status effects', () => {
        const poisonEffect: StatusEffect = {
          id: 'poison',
          name: 'Poison',
          type: StatusEffectType.POISON,
          duration: 3,
          remainingTurns: 3,
          value: 10,
          stackable: false,
          currentStacks: 1,
          maxStacks: 1,
          source: 'goblin1'
        };

        const applied = CombatCalculator.applyStatusEffect(player, poisonEffect);

        expect(applied).toBe(true);
        expect(player.statusEffects).toHaveLength(1);
        expect(player.statusEffects[0]?.id).toBe('poison');
      });

      it('should stack stackable effects', () => {
        const stackableEffect: StatusEffect = {
          id: 'burn',
          name: 'Burning',
          type: StatusEffectType.DAMAGE_OVER_TIME,
          duration: 3,
          remainingTurns: 3,
          value: 5,
          stackable: true,
          currentStacks: 1,
          maxStacks: 3,
          source: 'fire_spell'
        };

        // Apply first stack
        CombatCalculator.applyStatusEffect(player, stackableEffect);
        expect(player.statusEffects[0]?.currentStacks).toBe(1);

        // Apply second stack
        CombatCalculator.applyStatusEffect(player, stackableEffect);
        expect(player.statusEffects[0]?.currentStacks).toBe(2);

        // Try to apply beyond max stacks
        CombatCalculator.applyStatusEffect(player, stackableEffect);
        CombatCalculator.applyStatusEffect(player, stackableEffect);
        expect(player.statusEffects[0]?.currentStacks).toBe(3); // Should not exceed max
      });

      it('should refresh non-stackable effects', () => {
        const effect: StatusEffect = {
          id: 'stun',
          name: 'Stunned',
          type: StatusEffectType.STUN,
          duration: 2,
          remainingTurns: 2,
          value: 0,
          stackable: false,
          currentStacks: 1,
          maxStacks: 1,
          source: 'hammer_blow'
        };

        // Apply effect
        CombatCalculator.applyStatusEffect(player, effect);
        
        // Reduce duration
        if (player.statusEffects[0]) {
          player.statusEffects[0].remainingTurns = 1;
        }

        // Apply again - should refresh duration
        CombatCalculator.applyStatusEffect(player, effect);
        expect(player.statusEffects[0]?.remainingTurns).toBe(2);
      });

      it('should process damage over time effects', () => {
        const poisonEffect: StatusEffect = {
          id: 'poison',
          name: 'Poison',
          type: StatusEffectType.POISON,
          duration: 3,
          remainingTurns: 3,
          value: 15,
          stackable: false,
          currentStacks: 1,
          maxStacks: 1,
          source: 'poison_dart'
        };

        player.statusEffects.push(poisonEffect);
        const initialHealth = player.currentHealth;

        const result = CombatCalculator.processStatusEffects(player);

        expect(result.damage).toBe(15);
        expect(player.currentHealth).toBe(initialHealth - 15);
        expect(player.statusEffects[0]?.remainingTurns).toBe(2);
      });

      it('should process healing over time effects', () => {
        const regenEffect: StatusEffect = {
          id: 'regeneration',
          name: 'Regeneration',
          type: StatusEffectType.REGENERATION,
          duration: 3,
          remainingTurns: 3,
          value: 20,
          stackable: false,
          currentStacks: 1,
          maxStacks: 1,
          source: 'healing_potion'
        };

        player.currentHealth = 150; // Damage player first
        player.statusEffects.push(regenEffect);

        const result = CombatCalculator.processStatusEffects(player);

        expect(result.healing).toBe(20);
        expect(player.currentHealth).toBe(170);
        expect(player.statusEffects[0]?.remainingTurns).toBe(2);
      });

      it('should remove expired effects', () => {
        const expiredEffect: StatusEffect = {
          id: 'temp_buff',
          name: 'Temporary Buff',
          type: StatusEffectType.DAMAGE_BUFF,
          duration: 1,
          remainingTurns: 1,
          value: 25,
          stackable: false,
          currentStacks: 1,
          maxStacks: 1,
          source: 'buff_spell'
        };

        player.statusEffects.push(expiredEffect);
        
        CombatCalculator.processStatusEffects(player);

        expect(player.statusEffects).toHaveLength(0);
      });
    });

    describe('Entity State Checks', () => {
      it('should correctly identify alive entities', () => {
        expect(CombatCalculator.isAlive(player)).toBe(true);
        
        player.currentHealth = 0;
        expect(CombatCalculator.isAlive(player)).toBe(false);
        
        player.currentHealth = -10;
        expect(CombatCalculator.isAlive(player)).toBe(false);
      });

      it('should correctly identify if entity can act', () => {
        expect(CombatCalculator.canAct(player)).toBe(true);
        
        // Dead entity cannot act
        player.currentHealth = 0;
        expect(CombatCalculator.canAct(player)).toBe(false);
        
        // Stunned entity cannot act
        player.currentHealth = 100;
        const stunEffect: StatusEffect = {
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
        };
        player.statusEffects.push(stunEffect);
        
        expect(CombatCalculator.canAct(player)).toBe(false);
      });
    });
  });
});