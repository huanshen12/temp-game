import type { ElementStatusKind, ElementUpgradeConfig, UpgradeChoice } from "../core/types";

export const upgradePool: UpgradeChoice[] = [
  {
    id: "projectile_count",
    title: "子弹数量 +1",
    description: "每次射击额外发射一枚子弹。",
    apply: (stats) => {
      stats.projectileCount += 1;
    },
  },
  {
    id: "fire_rate",
    title: "射速提升",
    description: "提高每秒射击次数。",
    apply: (stats) => {
      stats.fireRate += 0.35;
    },
  },
  {
    id: "damage_up",
    title: "子弹伤害提升",
    description: "每发子弹造成更高伤害。",
    apply: (stats) => {
      stats.damage += 4;
    },
  },
  {
    id: "penetration_up",
    title: "穿透 +1",
    description: "子弹可额外穿透一个目标。",
    apply: (stats) => {
      stats.projectilePenetration += 1;
    },
  },
  {
    id: "move_speed",
    title: "移动速度提升",
    description: "提高走位能力。",
    apply: (stats) => {
      stats.moveSpeed += 14;
    },
  },
  {
    id: "exp_gain",
    title: "经验获取提升",
    description: "每个经验球提供更多经验值。",
    apply: (stats) => {
      stats.expGainMultiplier += 0.12;
    },
  },
  {
    id: "pickup_range",
    title: "拾取范围提升",
    description: "扩大吸收经验的范围。",
    apply: (stats) => {
      stats.pickupRadius += 10;
    },
  },
  {
    id: "projectile_size",
    title: "子弹体积提升",
    description: "更容易命中目标。",
    apply: (stats) => {
      stats.projectileSize += 1.4;
    },
  },
  {
    id: "max_ammo",
    title: "弹夹容量提升",
    description: "每次换弹后可携带更多子弹。",
    apply: (stats) => {
      stats.maxAmmo = Math.min(20, stats.maxAmmo + 2);
    },
  },
  {
    id: "reload_speed",
    title: "换弹速度提升",
    description: "减少换弹所需时间。",
    apply: (stats) => {
      stats.reloadMs = Math.max(1000, stats.reloadMs - 200);
    },
  },
  {
    id: "crit_up",
    title: "暴击率提升",
    description: "更高概率打出暴击伤害。",
    apply: (stats) => {
      stats.critChance = Math.min(0.8, stats.critChance + 0.06);
    },
  },
];

export const elementUpgradeConfigs: ElementUpgradeConfig[] = [
  { id: "burn_chance", elementKind: "burn", title: "燃烧触发率提升", description: "提高燃烧触发概率。", procChanceAdd: 0.03 },
  { id: "burn_duration", elementKind: "burn", title: "燃烧持续时间", description: "延长燃烧持续时间。", durationMsAdd: 500 },
  { id: "burn_power", elementKind: "burn", title: "燃烧伤害提升", description: "提高燃烧每跳伤害。", powerMul: 1.2 },
  { id: "poison_chance", elementKind: "poison", title: "中毒触发率提升", description: "提高中毒触发概率。", procChanceAdd: 0.03 },
  { id: "poison_duration", elementKind: "poison", title: "中毒持续时间", description: "延长中毒持续时间。", durationMsAdd: 600 },
  { id: "poison_power", elementKind: "poison", title: "中毒伤害提升", description: "提高中毒每跳伤害。", powerMul: 1.18 },
  { id: "freeze_chance", elementKind: "freeze", title: "冰冻触发率提升", description: "提高冰冻触发概率。", procChanceAdd: 0.02 },
  { id: "freeze_duration", elementKind: "freeze", title: "冰冻持续时间", description: "延长冰冻持续时间。", durationMsAdd: 220 },
  { id: "freeze_power", elementKind: "freeze", title: "冰冻强度提升", description: "提高冰冻减速强度。", powerMul: 1.2 },
  { id: "lightning_chance", elementKind: "lightning", title: "闪电触发率提升", description: "提高闪电触发概率。", procChanceAdd: 0.02 },
  { id: "lightning_chain", elementKind: "lightning", title: "闪电连锁 +1", description: "闪电可额外弹射一个目标。", chainCountAdd: 1 },
  { id: "lightning_power", elementKind: "lightning", title: "闪电伤害提升", description: "提高闪电弹射伤害。", powerMul: 1.2 },
];

const elementUpgradePool: UpgradeChoice[] = elementUpgradeConfigs.map((config) => ({
  id: config.id,
  title: config.title,
  description: config.description,
  // Element upgrades are applied by scene-side status bonus state.
  apply: () => undefined,
}));

export const allUpgradePool: UpgradeChoice[] = [...upgradePool, ...elementUpgradePool];

export function getElementUpgradeById(id: string): ElementUpgradeConfig | undefined {
  return elementUpgradeConfigs.find((config) => config.id === id);
}

export function getElementUpgradesByKind(kind: ElementStatusKind): ElementUpgradeConfig[] {
  return elementUpgradeConfigs.filter((config) => config.elementKind === kind);
}
