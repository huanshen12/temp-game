import type { ElementStatusConfig, ElementStatusKind } from "../core/types";

export const ELEMENT_STATUS_CONFIGS: Record<ElementStatusKind, ElementStatusConfig> = {
  burn: {
    kind: "burn",
    name: "燃烧",
    description: "持续灼烧目标，造成周期伤害。",
    baseProcChance: 0.08,
    durationMs: 2200,
    tickMs: 400,
    basePower: 1,
    stackRule: "refresh",
    synergyTags: ["burn_lightning"],
    upgradeScalingKey: "burn_power",
  },
  poison: {
    kind: "poison",
    name: "中毒",
    description: "持续掉血，可叠层强化。",
    baseProcChance: 0.1,
    durationMs: 2800,
    tickMs: 350,
    basePower: 1,
    stackRule: "stack",
    synergyTags: ["poison_freeze"],
    upgradeScalingKey: "poison_power",
  },
  freeze: {
    kind: "freeze",
    name: "冰冻",
    description: "减速目标并短暂硬控。",
    baseProcChance: 0.07,
    durationMs: 1000,
    tickMs: 0,
    basePower: 0.25,
    stackRule: "refresh",
    synergyTags: ["poison_freeze"],
    upgradeScalingKey: "freeze_power",
  },
  lightning: {
    kind: "lightning",
    name: "闪电",
    description: "触发连锁电击，弹射附近目标。",
    baseProcChance: 0.06,
    durationMs: 0,
    tickMs: 0,
    basePower: 1,
    stackRule: "none",
    chainCount: 2,
    chainRange: 150,
    synergyTags: ["burn_lightning"],
    upgradeScalingKey: "lightning_power",
  },
};

export function getElementStatusConfig(kind: ElementStatusKind): ElementStatusConfig {
  return ELEMENT_STATUS_CONFIGS[kind];
}

export function getAllElementStatusConfigs(): ElementStatusConfig[] {
  return Object.values(ELEMENT_STATUS_CONFIGS);
}
