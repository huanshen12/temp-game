import type { PassiveDropKind } from "../entities/PassiveDrop";

export interface PassiveState {
  lowHpThresholdRatio: number;
  lowHpDamageMultiplier: number;
  lowHpMoveMultiplier: number;
  killBlastRadius: number;
  killBlastDamage: number;
  bloodTriggerChance: number;
  bloodTriggerDamageMultiplier: number;
  painRushDurationMs: number;
  painRushFireRateMultiplier: number;
  painRushMoveMultiplier: number;
  painRushUntil: number;
  deathDefyCooldownMs: number;
  deathDefyInvincibleMs: number;
  deathDefyNextReadyAt: number;
  threatSenseMoveMultiplier: number;
  threatSenseReloadMultiplier: number;
  threatSenseFireRateMultiplier: number;
  threatSenseRadius: number;
  threatSenseActive: boolean;
  invincibleUntil: number;
  expGainMultiplier: number;
  pickupRadiusMultiplier: number;
  details: string[];
}

export interface PassiveOption {
  kind: PassiveDropKind;
  title: string;
  description: string;
}

export type PassiveLevels = Record<PassiveDropKind, number>;

const ALL_PASSIVES: PassiveDropKind[] = [
  "last_stand",
  "blast_core",
  "blood_trigger",
  "pain_rush",
  "grim_resolve",
  "threat_sensor",
];

export function createPassiveState(): PassiveState {
  return {
    lowHpThresholdRatio: 0,
    lowHpDamageMultiplier: 1,
    lowHpMoveMultiplier: 1,
    killBlastRadius: 0,
    killBlastDamage: 0,
    bloodTriggerChance: 0,
    bloodTriggerDamageMultiplier: 1,
    painRushDurationMs: 0,
    painRushFireRateMultiplier: 1,
    painRushMoveMultiplier: 1,
    painRushUntil: 0,
    deathDefyCooldownMs: 0,
    deathDefyInvincibleMs: 0,
    deathDefyNextReadyAt: 0,
    threatSenseMoveMultiplier: 1,
    threatSenseReloadMultiplier: 1,
    threatSenseFireRateMultiplier: 1,
    threatSenseRadius: 0,
    threatSenseActive: false,
    invincibleUntil: 0,
    expGainMultiplier: 1,
    pickupRadiusMultiplier: 1,
    details: [],
  };
}

export function createPassiveLevels(): PassiveLevels {
  return {
    last_stand: 0,
    blast_core: 0,
    blood_trigger: 0,
    pain_rush: 0,
    grim_resolve: 0,
    threat_sensor: 0,
  };
}

function hasPassive(levels: PassiveLevels, kind: PassiveDropKind): boolean {
  return (levels[kind] ?? 0) > 0;
}

export function getPassiveOptionByKind(levels: PassiveLevels, kind: PassiveDropKind): PassiveOption {
  const ownedSuffix = hasPassive(levels, kind) ? "（已拥有）" : "";

  if (kind === "last_stand") {
    return {
      kind,
      title: `绝境反击${ownedSuffix}`,
      description: "生命低于35%时，伤害+30%，移速+18%。",
    };
  }
  if (kind === "blast_core") {
    return {
      kind,
      title: `裂解余震${ownedSuffix}`,
      description: "击杀敌人时触发小范围爆裂，伤害随当前输出同步提升。",
    };
  }
  if (kind === "blood_trigger") {
    return {
      kind,
      title: `血契扳机${ownedSuffix}`,
      description: "每次射击有14%概率失去1点生命，所有伤害提高30%。",
    };
  }
  if (kind === "pain_rush") {
    return {
      kind,
      title: `逆痛狂热${ownedSuffix}`,
      description: "每次生命下降后，获得2.2秒射速+22%、移速+16%。",
    };
  }
  if (kind === "grim_resolve") {
    return {
      kind,
      title: `不屈遗志${ownedSuffix}`,
      description: "致命伤时保留1点生命并获得1.5秒无敌，冷却40秒。",
    };
  }
  return {
    kind,
    title: `猎场感知${ownedSuffix}`,
    description: "附近存在精英或Boss时，射速+20%、移速+14%、换弹时间-20%。",
  };
}

export function getRandomPassiveOption(levels: PassiveLevels, exclude?: PassiveDropKind): PassiveOption | undefined {
  const candidates = ALL_PASSIVES.filter((kind) => !hasPassive(levels, kind) && kind !== exclude);
  if (candidates.length === 0) {
    return undefined;
  }
  const kind = candidates[Math.floor(Math.random() * candidates.length)];
  return getPassiveOptionByKind(levels, kind);
}

export function applyPassiveDrop(
  passive: PassiveState,
  levels: PassiveLevels,
  kind: PassiveDropKind,
  now: number,
): number {
  if (hasPassive(levels, kind)) {
    return levels[kind];
  }
  levels[kind] = 1;

  if (kind === "last_stand") {
    passive.lowHpThresholdRatio = 0.35;
    passive.lowHpDamageMultiplier = 1.3;
    passive.lowHpMoveMultiplier = 1.18;
    return 1;
  }
  if (kind === "blast_core") {
    passive.killBlastRadius = 86;
    passive.killBlastDamage = 0;
    return 1;
  }
  if (kind === "blood_trigger") {
    passive.bloodTriggerChance = 0.14;
    passive.bloodTriggerDamageMultiplier = 1.3;
    return 1;
  }
  if (kind === "pain_rush") {
    passive.painRushDurationMs = 2200;
    passive.painRushFireRateMultiplier = 1.22;
    passive.painRushMoveMultiplier = 1.16;
    passive.painRushUntil = now;
    return 1;
  }
  if (kind === "grim_resolve") {
    passive.deathDefyCooldownMs = 40000;
    passive.deathDefyInvincibleMs = 1500;
    passive.deathDefyNextReadyAt = now;
    return 1;
  }
  passive.threatSenseMoveMultiplier = 1.14;
  passive.threatSenseReloadMultiplier = 0.8;
  passive.threatSenseFireRateMultiplier = 1.2;
  passive.threatSenseRadius = 340;
  passive.threatSenseActive = false;
  return 1;
}

export function buildPassiveDetails(passive: PassiveState, levels: PassiveLevels): string[] {
  const details: string[] = [];
  if (levels.last_stand > 0) {
    details.push(
      `绝境反击：生命<=${Math.round(passive.lowHpThresholdRatio * 100)}%时，伤害+${Math.round((passive.lowHpDamageMultiplier - 1) * 100)}%，移速+${Math.round((passive.lowHpMoveMultiplier - 1) * 100)}%`,
    );
  }
  if (levels.blast_core > 0) {
    details.push("裂解余震：击杀会触发一次范围爆裂。");
  }
  if (levels.blood_trigger > 0) {
    details.push(
      `血契扳机：射击自损 ${(passive.bloodTriggerChance * 100).toFixed(0)}%，伤害+${Math.round((passive.bloodTriggerDamageMultiplier - 1) * 100)}%`,
    );
  }
  if (levels.pain_rush > 0) {
    details.push(
      `逆痛狂热：受伤后 ${(passive.painRushDurationMs / 1000).toFixed(1)}s 射速+${Math.round((passive.painRushFireRateMultiplier - 1) * 100)}% 移速+${Math.round((passive.painRushMoveMultiplier - 1) * 100)}%`,
    );
  }
  if (levels.grim_resolve > 0) {
    details.push(
      `不屈遗志：致命保命1次 冷却${(passive.deathDefyCooldownMs / 1000).toFixed(0)}s 无敌${(passive.deathDefyInvincibleMs / 1000).toFixed(1)}s`,
    );
  }
  if (levels.threat_sensor > 0) {
    details.push(
      `猎场感知：威胁靠近时 射速+${Math.round((passive.threatSenseFireRateMultiplier - 1) * 100)}% 移速+${Math.round((passive.threatSenseMoveMultiplier - 1) * 100)}% 换弹-${Math.round((1 - passive.threatSenseReloadMultiplier) * 100)}%${passive.threatSenseActive ? "（已触发）" : "（未触发）"}`,
    );
  }
  return details;
}
