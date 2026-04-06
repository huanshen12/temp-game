import type { EnemyKind, EnemyVariant } from "../entities/Enemy";

export interface BossSequenceStep {
  delaySec: number;
  kind: EnemyKind;
  variant?: EnemyVariant;
}

export const BOSS_SEQUENCE: BossSequenceStep[] = [
  { delaySec: 180, kind: "miniBoss", variant: "miniA" },
  { delaySec: 360, kind: "miniBoss", variant: "miniB" },
  { delaySec: 540, kind: "miniBoss", variant: "miniC" },
  { delaySec: 720, kind: "mainBoss", variant: "mainA" },
  { delaySec: 900, kind: "miniBoss", variant: "miniD" },
  { delaySec: 1080, kind: "miniBoss", variant: "miniE" },
  { delaySec: 1260, kind: "mainBoss", variant: "mainB" },
  { delaySec: 1440, kind: "miniBoss", variant: "miniF" },
  { delaySec: 1620, kind: "finalBoss", variant: "final" },
];
