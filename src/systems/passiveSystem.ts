import type { PassiveDropKind } from "../entities/PassiveDrop";

export interface PassiveState {
  ammoRefundOnKillChance: number;
  healOnKillChance: number;
  invincibleEveryMs: number;
  invincibleDurationMs: number;
  nextInvincibleAt: number;
  invincibleUntil: number;
  emergencyShieldCooldownMs: number;
  emergencyShieldMaxCharges: number;
  emergencyShieldCharges: number;
  emergencyShieldNextAt: number;
  moveSpeedMultiplier: number;
  reloadTimeMultiplier: number;
  projectileDamageMultiplier: number;
  bossDamageMultiplier: number;
  expGainMultiplier: number;
  pickupRadiusMultiplier: number;
  threatSenseMoveMultiplier: number;
  threatSenseReloadMultiplier: number;
  threatSenseRadius: number;
  threatSenseActive: boolean;
  details: string[];
}

export interface PassiveOption {
  kind: PassiveDropKind;
  title: string;
  description: string;
}

export type PassiveLevels = Record<PassiveDropKind, number>;

const ALL_PASSIVES: PassiveDropKind[] = [
  "ammo_refund",
  "heal_on_kill",
  "phase_clock",
  "emergency_shield",
  "swift_steps",
  "reload_module",
  "scavenger_core",
  "giant_rounds",
  "hunter_mark",
  "threat_sensor",
];

export function createPassiveState(): PassiveState {
  return {
    ammoRefundOnKillChance: 0,
    healOnKillChance: 0,
    invincibleEveryMs: 0,
    invincibleDurationMs: 0,
    nextInvincibleAt: 0,
    invincibleUntil: 0,
    emergencyShieldCooldownMs: 0,
    emergencyShieldMaxCharges: 0,
    emergencyShieldCharges: 0,
    emergencyShieldNextAt: 0,
    moveSpeedMultiplier: 1,
    reloadTimeMultiplier: 1,
    projectileDamageMultiplier: 1,
    bossDamageMultiplier: 1,
    expGainMultiplier: 1,
    pickupRadiusMultiplier: 1,
    threatSenseMoveMultiplier: 1,
    threatSenseReloadMultiplier: 1,
    threatSenseRadius: 0,
    threatSenseActive: false,
    details: [],
  };
}

export function createPassiveLevels(): PassiveLevels {
  return {
    ammo_refund: 0,
    heal_on_kill: 0,
    phase_clock: 0,
    emergency_shield: 0,
    swift_steps: 0,
    reload_module: 0,
    scavenger_core: 0,
    giant_rounds: 0,
    hunter_mark: 0,
    threat_sensor: 0,
  };
}

function hasPassive(levels: PassiveLevels, kind: PassiveDropKind): boolean {
  return (levels[kind] ?? 0) > 0;
}

export function getPassiveOptionByKind(levels: PassiveLevels, kind: PassiveDropKind): PassiveOption {
  const ownedSuffix = hasPassive(levels, kind) ? "（已拥有）" : "";

  if (kind === "ammo_refund") {
    return {
      kind,
      title: `A道具：猎弹夹${ownedSuffix}`,
      description: "击杀普通怪有 8% 概率返还 1 发子弹。",
    };
  }
  if (kind === "heal_on_kill") {
    return {
      kind,
      title: `B道具：血涌核心${ownedSuffix}`,
      description: "击杀任意敌人有 10% 概率回复 1 点生命。",
    };
  }
  if (kind === "phase_clock") {
    return {
      kind,
      title: `C道具：相位时钟${ownedSuffix}`,
      description: "每 18 秒触发 1.2 秒无敌。",
    };
  }
  if (kind === "emergency_shield") {
    return {
      kind,
      title: `D道具：应急护盾${ownedSuffix}`,
      description: "每 16 秒充能 1 层护盾（最多 1 层），可抵消一次受伤。",
    };
  }
  if (kind === "swift_steps") {
    return {
      kind,
      title: `E道具：疾行靴${ownedSuffix}`,
      description: "移动速度提高 18%。",
    };
  }
  if (kind === "reload_module") {
    return {
      kind,
      title: `F道具：速装模组${ownedSuffix}`,
      description: "换弹时间缩短 18%。",
    };
  }
  if (kind === "scavenger_core") {
    return {
      kind,
      title: `G道具：拾荒核心${ownedSuffix}`,
      description: "经验拾取范围提高 35%，经验获取提高 20%。",
    };
  }
  if (kind === "giant_rounds") {
    return {
      kind,
      title: `H道具：重型弹头${ownedSuffix}`,
      description: "子弹伤害提高 16%。",
    };
  }
  if (kind === "hunter_mark") {
    return {
      kind,
      title: `I道具：猎首印记${ownedSuffix}`,
      description: "对小Boss/大Boss/最终Boss额外造成 22% 伤害。",
    };
  }
  return {
    kind,
    title: `P道具：猎场感知${ownedSuffix}`,
    description: "附近存在精英或Boss时：移速 +16%，换弹时间 -20%。",
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

  if (kind === "ammo_refund") {
    passive.ammoRefundOnKillChance = 0.08;
    return 1;
  }
  if (kind === "heal_on_kill") {
    passive.healOnKillChance = 0.1;
    return 1;
  }
  if (kind === "phase_clock") {
    passive.invincibleEveryMs = 18000;
    passive.invincibleDurationMs = 1200;
    passive.nextInvincibleAt = now + passive.invincibleEveryMs;
    return 1;
  }
  if (kind === "emergency_shield") {
    passive.emergencyShieldCooldownMs = 16000;
    passive.emergencyShieldMaxCharges = 1;
    passive.emergencyShieldCharges = Math.min(passive.emergencyShieldMaxCharges, passive.emergencyShieldCharges + 1);
    passive.emergencyShieldNextAt = now + passive.emergencyShieldCooldownMs;
    return 1;
  }
  if (kind === "swift_steps") {
    passive.moveSpeedMultiplier = 1.18;
    return 1;
  }
  if (kind === "reload_module") {
    passive.reloadTimeMultiplier = 0.82;
    return 1;
  }
  if (kind === "scavenger_core") {
    passive.pickupRadiusMultiplier = 1.35;
    passive.expGainMultiplier = 1.2;
    return 1;
  }
  if (kind === "giant_rounds") {
    passive.projectileDamageMultiplier = 1.16;
    return 1;
  }
  if (kind === "hunter_mark") {
    passive.bossDamageMultiplier = 1.22;
    return 1;
  }
  passive.threatSenseMoveMultiplier = 1.16;
  passive.threatSenseReloadMultiplier = 0.8;
  passive.threatSenseRadius = 320;
  passive.threatSenseActive = false;
  return 1;
}

export function buildPassiveDetails(passive: PassiveState, levels: PassiveLevels): string[] {
  const details: string[] = [];
  if (levels.ammo_refund > 0) {
    details.push(`猎弹夹：返弹 ${(passive.ammoRefundOnKillChance * 100).toFixed(0)}%`);
  }
  if (levels.heal_on_kill > 0) {
    details.push(`血涌核心：回血 ${(passive.healOnKillChance * 100).toFixed(0)}%`);
  }
  if (levels.phase_clock > 0) {
    details.push(`相位时钟：${(passive.invincibleEveryMs / 1000).toFixed(0)}s 触发 ${(passive.invincibleDurationMs / 1000).toFixed(1)}s 无敌`);
  }
  if (levels.emergency_shield > 0) {
    details.push(`应急护盾：${(passive.emergencyShieldCooldownMs / 1000).toFixed(0)}s 充能，当前 ${passive.emergencyShieldCharges}/${passive.emergencyShieldMaxCharges}`);
  }
  if (levels.swift_steps > 0) {
    details.push(`疾行靴：移速 +${Math.round((passive.moveSpeedMultiplier - 1) * 100)}%`);
  }
  if (levels.reload_module > 0) {
    details.push(`速装模组：换弹 -${Math.round((1 - passive.reloadTimeMultiplier) * 100)}%`);
  }
  if (levels.scavenger_core > 0) {
    details.push(
      `拾荒核心：拾取范围 +${Math.round((passive.pickupRadiusMultiplier - 1) * 100)}%，经验 +${Math.round((passive.expGainMultiplier - 1) * 100)}%`,
    );
  }
  if (levels.giant_rounds > 0) {
    details.push(`重型弹头：子弹伤害 +${Math.round((passive.projectileDamageMultiplier - 1) * 100)}%`);
  }
  if (levels.hunter_mark > 0) {
    details.push(`猎首印记：Boss伤害 +${Math.round((passive.bossDamageMultiplier - 1) * 100)}%`);
  }
  if (levels.threat_sensor > 0) {
    details.push(
      `猎场感知：精英/Boss近身时 移速 +${Math.round((passive.threatSenseMoveMultiplier - 1) * 100)}%，换弹 -${Math.round((1 - passive.threatSenseReloadMultiplier) * 100)}%（${passive.threatSenseActive ? "已触发" : "未触发"}）`,
    );
  }
  return details;
}
