import { MAX_ENEMIES } from "../config/gameConfig";

export function getNormalSpawnCount(elapsedSec: number): number {
  if (elapsedSec < 40) {
    return Math.random() < 0.34 ? 1 : 0;
  }
  if (elapsedSec < 80) {
    return Math.random() < 0.58 ? 1 : 0;
  }
  if (elapsedSec < 140) {
    return Math.random() < 0.78 ? 1 : 2;
  }
  if (elapsedSec < 220) {
    return Math.random() < 0.66 ? 1 : 2;
  }
  if (elapsedSec < 340) {
    return Math.random() < 0.7 ? 2 : 3;
  }
  if (elapsedSec < 520) {
    return Math.random() < 0.64 ? 2 : 3;
  }
  return 3 + Math.floor(Math.random() * 2);
}

export function getDynamicEnemyCap(elapsedSec: number): number {
  if (elapsedSec < 60) {
    return 16;
  }
  if (elapsedSec < 120) {
    return 22;
  }
  if (elapsedSec < 180) {
    return 30;
  }
  if (elapsedSec < 300) {
    return 40;
  }
  if (elapsedSec < 480) {
    return 58;
  }
  if (elapsedSec < 720) {
    return 82;
  }
  return MAX_ENEMIES;
}
