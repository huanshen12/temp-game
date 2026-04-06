export type EliteAffixId = "shield" | "berserk" | "summoner" | "sniper";

export interface EliteAffixConfig {
  id: EliteAffixId;
  name: string;
  hpMul: number;
  speedMul: number;
  damageMul: number;
  expMul: number;
  tintColor: number;
}

const ELITE_AFFIX_CONFIGS: Record<EliteAffixId, EliteAffixConfig> = {
  shield: {
    id: "shield",
    name: "护盾",
    hpMul: 1.9,
    speedMul: 0.92,
    damageMul: 1,
    expMul: 1.35,
    tintColor: 0x93c5fd,
  },
  berserk: {
    id: "berserk",
    name: "狂暴",
    hpMul: 1.2,
    speedMul: 1.18,
    damageMul: 1.32,
    expMul: 1.3,
    tintColor: 0xfb7185,
  },
  summoner: {
    id: "summoner",
    name: "召唤",
    hpMul: 1.4,
    speedMul: 1,
    damageMul: 1.08,
    expMul: 1.4,
    tintColor: 0xc4b5fd,
  },
  sniper: {
    id: "sniper",
    name: "狙击",
    hpMul: 1.15,
    speedMul: 1.08,
    damageMul: 1.42,
    expMul: 1.35,
    tintColor: 0xfbbf24,
  },
};

export function getEliteAffixConfig(id: EliteAffixId): EliteAffixConfig {
  return ELITE_AFFIX_CONFIGS[id];
}

export function getRandomEliteAffix(): EliteAffixId {
  const ids: EliteAffixId[] = ["shield", "berserk", "summoner", "sniper"];
  return ids[Math.floor(Math.random() * ids.length)];
}
