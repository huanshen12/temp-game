import type { EvolutionBranch, WeaponEvolutionConfig } from "../core/types";

export const WEAPON_EVOLUTION_CONFIGS: WeaponEvolutionConfig[] = [
  {
    weaponId: "pistol",
    weaponName: "手枪",
    branches: [
      {
        id: "pistol_big_caliber",
        name: "巨大口径",
        description: "大幅提升子弹体积与子弹伤害，附带小幅击退，但弹道速度与移动速度下降。",
        requirements: {
          statLevels: { damage: 5, projectile_size: 5 },
        },
        effects: {
          bulletDamageMul: 1.3,
          projectileSizeMul: 1.9,
          projectileSpeedMul: 0.7,
          moveSpeedMul: 0.7,
          knockbackMul: 1.35,
        },
      },
      {
        id: "pistol_chain_burst",
        name: "连锁爆鸣",
        description: "射速大幅提高，额外发射更多子弹并收束弹道，弹道速度提升但子弹伤害下降。",
        requirements: {
          statLevels: { fire_rate: 5, projectile_count: 5 },
        },
        effects: {
          fireRateMul: 1.5,
          chainShots: 3,
          recoilSpread: -0.11,
          projectileSpeedMul: 1.3,
          bulletDamageMul: 0.75,
        },
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
        description: "射速推到极限，形成高压弹幕。",
        requirements: {
          statLevels: { fire_rate: 5, max_ammo: 5 },
        },
        effects: { fireRateMul: 1.55, projectileCount: 1, damageMul: 0.86 },
      },
      {
        id: "smg_precision",
        name: "精确扫射",
        description: "牺牲少量射速，换取更高单发与稳定命中。",
        requirements: {
          statLevels: { damage: 5, projectile_size: 5 },
        },
        effects: { damageMul: 1.48, fireRateMul: 0.86, projectileSizeMul: 1.2 },
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
          statLevels: { projectile_count: 5, fire_rate: 5 },
        },
        effects: { projectileCount: 4, projectileSizeMul: 1.3, damageMul: 0.72 },
      },
      {
        id: "shotgun_slug",
        name: "独头弹",
        description: "低弹丸高单发，专治高血量目标。",
        requirements: {
          statLevels: { damage: 5, projectile_size: 5 },
        },
        effects: { damageMul: 2.5, projectileSizeMul: 2.0, projectileCount: -3 },
      },
    ],
  },
  {
    weaponId: "rifle",
    weaponName: "步枪",
    branches: [
      {
        id: "rifle_piercer",
        name: "破阵者",
        description: "强化压制与命中，适合怪海推进。",
        requirements: {
          statLevels: { projectile_size: 5, damage: 5 },
        },
        effects: { damageMul: 1.35, projectileSpeedMul: 1.2, projectileSizeMul: 1.2 },
      },
      {
        id: "rifle_sniper",
        name: "狙击模式",
        description: "暴击能力大幅增强，单发爆发极高。",
        requirements: {
          statLevels: { projectile_count: 5, fire_rate: 5 },
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
