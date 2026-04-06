export interface PlayerStats {
  maxHealth: number;
  health: number;
  moveSpeed: number;
  damage: number;
  critChance: number;
  critMultiplier: number;
  fireRate: number;
  projectileCount: number;
  projectileSpeed: number;
  projectilePenetration: number;
  projectileSize: number;
  maxAmmo: number;
  reloadMs: number;
  expGainMultiplier: number;
  pickupRadius: number;
}

export interface UpgradeChoice {
  id: string;
  title: string;
  description: string;
  apply: (stats: PlayerStats) => void;
}

export type StatLevelKey = 
  | "projectile_count"
  | "damage" 
  | "fire_rate" 
  | "projectile_size" 
  | "projectile_speed" 
  | "penetration" 
  | "crit_up" 
  | "max_ammo" 
  | "reload_speed" 
  | "move_speed";

export interface EvolutionStatRequirements {
  [key: string]: number;
}

export interface EvolutionBehaviorRequirements {
  kill_count?: number;
  crit_hits?: number;
  damage_dealt?: number;
  time_survived_ms?: number;
  enemies_pierced?: number;
}

export interface EvolutionRequirements {
  statLevels?: EvolutionStatRequirements;
  behavior?: EvolutionBehaviorRequirements;
}

export interface EvolutionEffects {
  damageMul?: number;
  projectileSizeMul?: number;
  projectileSpeedMul?: number;
  fireRateMul?: number;
  critChanceAdd?: number;
  critMultiplierAdd?: number;
  penetrationAdd?: number;
  projectileCount?: number;
  chainShots?: number;
  recoilSpread?: number;
  explosiveRadius?: number;
  explosiveDamage?: number;
  customEffect?: string;
}

export interface EvolutionBranch {
  id: string;
  name: string;
  description: string;
  requirements: EvolutionRequirements;
  effects: EvolutionEffects;
}

export interface WeaponEvolutionConfig {
  weaponId: string;
  weaponName: string;
  branches: EvolutionBranch[];
}

export type ElementStatusKind = "burn" | "poison" | "freeze" | "lightning";

export type ElementStackRule = "none" | "refresh" | "stack";

export interface ElementStatusConfig {
  kind: ElementStatusKind;
  name: string;
  description: string;
  baseProcChance: number;
  durationMs: number;
  tickMs: number;
  basePower: number;
  stackRule: ElementStackRule;
  chainCount?: number;
  chainRange?: number;
  synergyTags?: string[];
  upgradeScalingKey?: string;
}

export interface ElementUpgradeConfig {
  id: string;
  elementKind: ElementStatusKind;
  title: string;
  description: string;
  procChanceAdd?: number;
  durationMsAdd?: number;
  powerMul?: number;
  chainCountAdd?: number;
}
