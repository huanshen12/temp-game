import type { EvolutionBranch, WeaponEvolutionConfig } from "../core/types";

export const WEAPON_EVOLUTION_CONFIGS: WeaponEvolutionConfig[] = [
  {
    weaponId: "pistol",
    weaponName: "手枪",
    branches: [
      {
        id: "pistol_big_caliber",
        name: "巨口径",
        description: "子弹更大更疼，弹速略慢但压制力极强。",
        requirements: {
          statLevels: { damage: 5, projectile_size: 5 },
          behavior: { kill_count: 120 },
        },
        effects: { damageMul: 1.8, projectileSizeMul: 1.9, projectileSpeedMul: 0.9 },
      },
      {
        id: "pistol_chain_burst",
        name: "连锁爆鸣",
        description: "每次射击额外连发，爆发更高。",
        requirements: {
          statLevels: { fire_rate: 5, crit_up: 5 },
          behavior: { crit_hits: 80 },
        },
        effects: { chainShots: 2, recoilSpread: 0.12, damageMul: 1.25 },
      },
    ],
  },
  {
    weaponId: "smg",
    weaponName: "冲锋枪",
    branches: [
      {
        id: "smg_storm",
        name: "弹幕风暴",
        description: "射速推到极限，火力覆盖全屏。",
        requirements: {
          statLevels: { fire_rate: 5, max_ammo: 5 },
          behavior: { kill_count: 200 },
        },
        effects: { fireRateMul: 1.55, projectileCount: 1, damageMul: 0.86 },
      },
      {
        id: "smg_precision",
        name: "精准扫射",
        description: "牺牲部分射速，换取更强单发和穿透。",
        requirements: {
          statLevels: { damage: 5, penetration: 5 },
          behavior: { enemies_pierced: 150 },
        },
        effects: { damageMul: 1.48, penetrationAdd: 3, fireRateMul: 0.82 },
      },
    ],
  },
  {
    weaponId: "shotgun",
    weaponName: "霰弹枪",
    branches: [
      {
        id: "shotgun_scatter",
        name: "散射风暴",
        description: "弹丸更多，清场能力大幅上升。",
        requirements: {
          statLevels: { projectile_count: 5, projectile_size: 5 },
          behavior: { kill_count: 180 },
        },
        effects: { projectileCount: 4, projectileSizeMul: 1.3, damageMul: 0.72 },
      },
      {
        id: "shotgun_slug",
        name: "独头弹",
        description: "低弹丸高单发，专治高血目标。",
        requirements: {
          statLevels: { damage: 5, projectile_speed: 5 },
          behavior: { damage_dealt: 50000 },
        },
        effects: { damageMul: 2.5, projectileSizeMul: 2.0, projectileCount: -3 },
      },
    ],
  },
  {
    weaponId: "rifle",
    weaponName: "穿透步枪",
    branches: [
      {
        id: "rifle_piercer",
        name: "贯穿者",
        description: "超高穿透，适合怪海清线。",
        requirements: {
          statLevels: { penetration: 5, damage: 5 },
          behavior: { enemies_pierced: 300 },
        },
        effects: { penetrationAdd: 10, damageMul: 1.4, projectileSpeedMul: 1.2 },
      },
      {
        id: "rifle_sniper",
        name: "狙击模式",
        description: "暴击能力大幅增强，单发爆发极高。",
        requirements: {
          statLevels: { crit_up: 5, projectile_speed: 5 },
          behavior: { crit_hits: 200 },
        },
        effects: { critChanceAdd: 1, critMultiplierAdd: 1.5, fireRateMul: 0.62 },
      },
    ],
  },
];

export function getEvolutionConfigByWeaponId(weaponId: string): WeaponEvolutionConfig | undefined {
  return WEAPON_EVOLUTION_CONFIGS.find((config) => config.weaponId === weaponId);
}

export function getEvolutionBranchById(branchId: string): EvolutionBranch | undefined {
  for (const config of WEAPON_EVOLUTION_CONFIGS) {
    const branch = config.branches.find((item) => item.id === branchId);
    if (branch != null) {
      return branch;
    }
  }
  return undefined;
}
