export interface SkillSystem {
  skills: Map<SkillType, SkillData>;
  addExperience(skill: SkillType, amount: number): SkillLevelResult;
  getSkillLevel(skill: SkillType): number;
  getActivePerks(skill: SkillType): Perk[];
  prestigeSkill(skill: SkillType): Promise<boolean>;
}

export interface SkillData {
  experience: number;
  level: number;
  prestige: number;
  unlockedPerks: string[];
}

export enum SkillType {
  MINING = 'mining',
  FARMING = 'farming',
  COMBAT = 'combat',
  CRAFTING = 'crafting',
  FISHING = 'fishing',
  FORAGING = 'foraging',
  ENCHANTING = 'enchanting',
  ALCHEMY = 'alchemy'
}

export interface SkillLevelResult {
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
  newPerksUnlocked: Perk[];
}

export interface Perk {
  id: string;
  name: string;
  description: string;
  skillType: SkillType;
  requiredLevel: number;
  requiredPrestige: number;
  effects: PerkEffect[];
}

export interface PerkEffect {
  type: PerkEffectType;
  value: number;
  description: string;
}

export enum PerkEffectType {
  DAMAGE_BONUS = 'damage_bonus',
  DEFENSE_BONUS = 'defense_bonus',
  EXPERIENCE_MULTIPLIER = 'experience_multiplier',
  RESOURCE_YIELD = 'resource_yield',
  CRAFTING_SPEED = 'crafting_speed',
  MINION_EFFICIENCY = 'minion_efficiency',
  RARE_DROP_CHANCE = 'rare_drop_chance'
}

export interface ExperienceTable {
  level: number;
  requiredExperience: number;
  cumulativeExperience: number;
}