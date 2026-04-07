import { MAX_ENEMIES } from "../config/gameConfig";

export function getNormalSpawnCount(elapsedSec: number): number {
  const t = Math.max(0, elapsedSec);

  if (t < 120) {
    return Math.random() < 0.45 ? 0 : 1;
  }
  if (t < 300) {
    return Math.random() < 0.55 ? 1 : 2;
  }
  if (t < 600) {
    return Math.random() < 0.5 ? 2 : 3;
  }
  if (t < 900) {
    return Math.random() < 0.4 ? 3 : 4;
  }
  if (t < 1200) {
    return Math.random() < 0.3 ? 4 : 5;
  }
  return Math.random() < 0.55 ? 6 : 7;
}

export function getDynamicEnemyCap(elapsedSec: number): number {
  const t = Math.max(0, elapsedSec);
  if (t < 120) return 22;
  if (t < 300) return 40;
  if (t < 600) return 78;
  if (t < 900) return 130;
  if (t < 1200) return 190;
  return Math.min(MAX_ENEMIES, 240 + Math.floor((t - 1200) * 0.08));
}
