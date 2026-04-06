import Phaser from "phaser";
import {
  ENEMY_SPAWN_INTERVAL_MS,
  MAX_BULLETS,
  MAX_ENEMIES,
  MAX_ORBS,
  PLAYER_START_EXP_TO_NEXT,
  PLAYER_START_X,
  PLAYER_START_Y,
  WORLD_SIZE,
} from "../config/gameConfig";
import { upgradePool } from "../config/upgrades";
import { gameEvents } from "../core/events";
import { isMobileGameplayDevice } from "../core/device";
import type { ElementStatusKind, EvolutionBehaviorRequirements, EvolutionBranch, UpgradeChoice } from "../core/types";
import { BOSS_SEQUENCE, type BossSequenceStep } from "../data/bossSequence";
import { getRandomEliteAffix, type EliteAffixId } from "../data/eliteAffixes";
import { getEvolutionConfigByWeaponId } from "../data/evolution";
import { getElementStatusConfig } from "../data/statusEffects";
import { Bullet } from "../entities/Bullet";
import { Enemy, type EnemyKind, type EnemyVariant } from "../entities/Enemy";
import { ExperienceOrb } from "../entities/ExperienceOrb";
import { PassiveDrop, type PassiveDropKind } from "../entities/PassiveDrop";
import { PlayerActor } from "../entities/PlayerActor";
import {
  applyPassiveDrop,
  buildPassiveDetails,
  createPassiveLevels,
  createPassiveState,
  getPassiveOptionByKind,
  getRandomPassiveOption,
  type PassiveOption,
  type PassiveState,
} from "../systems/passiveSystem";
import { getDynamicEnemyCap, getNormalSpawnCount } from "../systems/spawnSystem";

interface HealthBarParts {
  bg: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
}

interface EnemyProjectile {
  id: number;
  sprite: Phaser.GameObjects.Arc;
  damage: number;
  spawnAt: number;
}

interface BossHazardZone {
  id: number;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  expiresAt: number;
  nextDamageAt: number;
  damageIntervalMs: number;
  damage: number;
}

interface BossAiState {
  nextDashAt?: number;
  dashUntil?: number;
  dashPrepUntil?: number;
  dashTargetX?: number;
  dashTargetY?: number;
  dashVx?: number;
  dashVy?: number;
  dashChainLeft?: number;
  nextBurstAt?: number;
  nextSummonAt?: number;
  nextZoneAt?: number;
  nextSpecialAt?: number;
  patternIndex?: number;
  enraged?: boolean;
}

interface ElementBonusState {
  procAdd: number;
  durationAddMs: number;
  powerMul: number;
  chainCountAdd: number;
}

interface EnemyStatusState {
  burnUntil: number;
  burnNextTickAt: number;
  burnPower: number;
  poisonUntil: number;
  poisonNextTickAt: number;
  poisonStacks: number;
  poisonPower: number;
  freezeUntil: number;
  freezeSlow: number;
}

interface EliteFxParts {
  aura: Phaser.GameObjects.Arc;
  mark: Phaser.GameObjects.Text;
}

type SkillKind = "flamethrower" | "lightning_bug" | "poison_orb" | "frost_core";
type SkillNode = "a" | "b";

export class GameScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private reloadKey!: Phaser.Input.Keyboard.Key;
  private player!: PlayerActor;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private bossHazards: BossHazardZone[] = [];
  private bossHazardId = 0;
  private orbs: ExperienceOrb[] = [];
  private passiveDrops: PassiveDrop[] = [];
  private choicePaused = false;
  private pendingPlayerUpgrades = 0;
  private activeUpgradeChoices: UpgradeChoice[] = [];
  private choiceTimeoutAt = 0;
  private upgradeLevels = new Map<string, number>();
  private activePassiveOption?: PassiveOption;
  private passiveRerollAvailable = 0;
  private passiveSelectionToken = 0;
  private hitCooldowns = new Map<string, number>();
  private enemyBars = new Map<number, HealthBarParts>();
  private enemyEliteFx = new Map<number, EliteFxParts>();
  private enemyBossAi = new Map<number, BossAiState>();
  private playerBar?: HealthBarParts;
  private lastFireAt = 0;
  private runStartedAt = 0;
  private bossSequence: BossSequenceStep[] = [...BOSS_SEQUENCE];
  private bossStepIndex = 0;
  private pendingBossStep?: BossSequenceStep;
  private pendingBossSpawnAt = 0;
  private killCount = 0;
  private mainBossDefeated = 0;
  private currentAmmo = 0;
  private isReloading = false;
  private reloadEndsAt = 0;
  private passive: PassiveState = createPassiveState();
  private passiveLevels = createPassiveLevels();
  private enemyProjectileId = 0;
  private currentWeaponId = "pistol";
  private selectedEvolutionBranchId?: string;
  private evolutionBranchLevels = new Map<string, number>();
  private evolutionBehaviorState: EvolutionBehaviorRequirements = {
    kill_count: 0,
    crit_hits: 0,
    damage_dealt: 0,
    enemies_pierced: 0,
    time_survived_ms: 0,
  };
  private enemyStatus = new Map<number, EnemyStatusState>();
  private skillUnlocked: Record<SkillKind, boolean> = {
    flamethrower: false,
    lightning_bug: false,
    poison_orb: false,
    frost_core: false,
  };
  private skillNodeLevels: Record<SkillKind, Record<SkillNode, number>> = {
    flamethrower: { a: 0, b: 0 },
    lightning_bug: { a: 0, b: 0 },
    poison_orb: { a: 0, b: 0 },
    frost_core: { a: 0, b: 0 },
  };
  private skillCooldowns: Record<SkillKind, number> = {
    flamethrower: 0,
    lightning_bug: 0,
    poison_orb: 0,
    frost_core: 0,
  };
  private elementBonuses: Record<ElementStatusKind, ElementBonusState> = {
    burn: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
    poison: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
    freeze: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
    lightning: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
  };
  private gameStarted = false;
  private gameFinished = false;
  private isMobile = false;
  private touchMoveX = 0;
  private touchMoveY = 0;
  private joystickPointerId: number | null = null;
  private joystickBase?: Phaser.GameObjects.Arc;
  private joystickKnob?: Phaser.GameObjects.Arc;
  private joystickCenterX = 360;
  private joystickCenterY = 980;
  private joystickRadius = 42;
  private joystickKnobRadius = 18;

  public constructor() {
    super("GameScene");
  }

  public create(): void {
    if (!this.scene.isActive("UIScene")) {
      this.scene.launch("UIScene");
    }

    this.runStartedAt = this.time.now;
    this.cameras.main.setRoundPixels(true);
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.add.grid(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE, WORLD_SIZE, 80, 80, 0x0b1220, 0.45, 0x1f2937, 0.4);

    this.player = new PlayerActor(this, PLAYER_START_X, PLAYER_START_Y, 0x60a5fa);
    this.player.expToNext = PLAYER_START_EXP_TO_NEXT;
    this.currentAmmo = this.player.stats.maxAmmo;
    this.createPlayerBar();
    this.cameras.main.startFollow(this.player.visual, true, 1, 1);

    const keyboard = this.input.keyboard;
    if (keyboard == null) {
      throw new Error("Keyboard input is unavailable.");
    }
    this.cursors = keyboard.createCursorKeys();
    const keys = keyboard.addKeys("w,a,s,d") as Record<string, Phaser.Input.Keyboard.Key>;
    this.wasd = { w: keys.w, a: keys.a, s: keys.s, d: keys.d };
    this.reloadKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.isMobile = isMobileGameplayDevice();
    if (this.isMobile) {
      this.setupMobileControls();
    }

    this.setChoicePaused(true);
    this.gameStarted = false;
    this.gameFinished = false;
    gameEvents.once("game:start", () => {
      if (this.gameFinished || this.player.isDead || this.gameStarted) {
        return;
      }
      this.runStartedAt = this.time.now;
      this.gameStarted = true;
      this.setChoicePaused(false);
      gameEvents.emit("ui:toast", { text: "战斗开始", color: "#93c5fd" });
    });
    this.time.delayedCall(0, () => {
      gameEvents.emit("ui:showStart");
    });

    this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => {
        const cap = this.getDynamicEnemyCap();
        if (this.choicePaused || this.player.isDead || this.enemies.length >= cap) {
          return;
        }
        const spawnCount = this.getNormalSpawnCount();
        for (let i = 0; i < spawnCount && this.enemies.length < cap; i += 1) {
          this.spawnEnemy("normal");
        }
      },
    });
  }

  public update(time: number): void {
    this.evolutionBehaviorState.time_survived_ms = Math.max(0, Math.floor(time - this.runStartedAt));
    this.player.syncVisual();
    this.stabilizeCamera();
    this.updateHealthBars();
    this.updateEliteFx(time);
    this.updatePassiveInvincible(time);
    this.updateEmergencyShield(time);
    this.updateThreatSensor();
    this.updateEnemyStatusEffects(time);
    this.updateActiveSkills(time);
    this.updateReloadState(time);

    if (!this.gameStarted) {
      this.syncHud();
      this.stabilizeCamera();
      return;
    }

    if (this.choicePaused) {
      if (time >= this.choiceTimeoutAt && this.activeUpgradeChoices.length > 0) {
        this.applyPlayerUpgrade(this.activeUpgradeChoices[0].id);
      }
      this.syncHud();
      this.stabilizeCamera();
      return;
    }

    if (this.player.isDead) {
      this.syncHud();
      this.stabilizeCamera();
      return;
    }

    this.updatePlayerInput();
    this.processBossSequence(time);
    this.updateEnemies(time);
    this.updateEnemyProjectiles(time);
    this.updateBossHazards(time);
    this.autoFire(time);
    this.resolveBulletHits();
    this.resolveEnemyContact(time);
    this.resolveEnemyProjectileHit(time);
    this.collectOrbs();
    this.collectPassiveDrops();
    this.cleanupDeadEnemies();
    this.cleanupBullets(time);
    this.cleanupCooldowns(time);
    this.syncHud();
    this.stabilizeCamera();
  }

  private stabilizeCamera(): void {
    if (!this.isMobile) {
      return;
    }
    const camera = this.cameras.main;
    camera.scrollX = Math.round(camera.scrollX);
    camera.scrollY = Math.round(camera.scrollY);
  }

  private setChoicePaused(paused: boolean): void {
    this.choicePaused = paused;
    if (paused) {
      this.player.setVelocity(0, 0);
      this.physics.world.pause();
      return;
    }
    this.physics.world.resume();
  }

  private updatePlayerInput(): void {
    let vx = 0;
    let vy = 0;
    const threatMoveMul = this.passive.threatSenseActive ? this.passive.threatSenseMoveMultiplier : 1;
    const speed = this.player.stats.moveSpeed * this.passive.moveSpeedMultiplier * threatMoveMul;
    const useTouch = this.isMobile && (Math.abs(this.touchMoveX) > 0.01 || Math.abs(this.touchMoveY) > 0.01);
    if (useTouch) {
      vx = this.touchMoveX * speed;
      vy = this.touchMoveY * speed;
    }
    if (!useTouch && (this.cursors.left.isDown || this.wasd.a.isDown)) {
      vx -= speed;
    }
    if (!useTouch && (this.cursors.right.isDown || this.wasd.d.isDown)) {
      vx += speed;
    }
    if (!useTouch && (this.cursors.up.isDown || this.wasd.w.isDown)) {
      vy -= speed;
    }
    if (!useTouch && (this.cursors.down.isDown || this.wasd.s.isDown)) {
      vy += speed;
    }
    if (vx !== 0 && vy !== 0) {
      vx *= 0.707106781;
      vy *= 0.707106781;
    }
    this.player.setVelocity(vx, vy);
    if (Phaser.Input.Keyboard.JustDown(this.reloadKey)) {
      this.startReload("手动换弹");
    }
  }

  private setupMobileControls(): void {
    this.joystickBase = this.add.circle(this.joystickCenterX, this.joystickCenterY, this.joystickRadius, 0x0f172a, 0.28);
    this.joystickBase.setStrokeStyle(1, 0xcbd5e1, 0.38).setScrollFactor(0).setDepth(980);
    this.joystickKnob = this.add.circle(this.joystickCenterX, this.joystickCenterY, this.joystickKnobRadius, 0x93c5fd, 0.45);
    this.joystickKnob.setStrokeStyle(1, 0xe2e8f0, 0.7).setScrollFactor(0).setDepth(981);

    const placeJoystick = (w: number, h: number) => {
      this.joystickCenterX = Math.round(w / 2);
      this.joystickCenterY = Math.max(120, Math.round(h - 150));
      this.joystickBase?.setPosition(this.joystickCenterX, this.joystickCenterY);
      this.joystickKnob?.setPosition(this.joystickCenterX, this.joystickCenterY);
    };
    placeJoystick(this.scale.width, this.scale.height);

    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      placeJoystick(size.width, size.height);
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.choicePaused || this.player.isDead) {
        return;
      }
      if (this.joystickPointerId !== null) {
        return;
      }
      if (pointer.y > this.scale.height * 0.45) {
        this.joystickPointerId = pointer.id;
        this.updateJoystickFromPointer(pointer);
      }
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.id !== this.joystickPointerId) {
        return;
      }
      this.updateJoystickFromPointer(pointer);
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.joystickPointerId) {
        this.joystickPointerId = null;
        this.touchMoveX = 0;
        this.touchMoveY = 0;
        this.joystickKnob?.setPosition(this.joystickCenterX, this.joystickCenterY);
      }
    });
  }

  private updateJoystickFromPointer(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.joystickCenterX;
    const dy = pointer.y - this.joystickCenterY;
    const distance = Math.hypot(dx, dy);
    const clamped = Math.min(this.joystickRadius, distance);
    const ratio = distance <= 0.001 ? 0 : clamped / distance;
    const knobX = this.joystickCenterX + dx * ratio;
    const knobY = this.joystickCenterY + dy * ratio;
    this.joystickKnob?.setPosition(knobX, knobY);
    this.touchMoveX = this.joystickRadius <= 0 ? 0 : (knobX - this.joystickCenterX) / this.joystickRadius;
    this.touchMoveY = this.joystickRadius <= 0 ? 0 : (knobY - this.joystickCenterY) / this.joystickRadius;
  }

  private processBossSequence(now: number): void {
    const elapsedSec = Math.floor((now - this.runStartedAt) / 1000);

    if (this.pendingBossStep !== undefined && now >= this.pendingBossSpawnAt) {
      if (this.canSpawnBoss(this.pendingBossStep.kind)) {
        this.spawnEnemy(this.pendingBossStep.kind, this.pendingBossStep.variant);
        this.pendingBossStep = undefined;
      } else {
        this.pendingBossSpawnAt = now + 10000;
      }
    }

    if (this.pendingBossStep !== undefined || this.bossStepIndex >= this.bossSequence.length) {
      return;
    }

    const step = this.bossSequence[this.bossStepIndex];
    if (elapsedSec < step.delaySec) {
      return;
    }

    this.bossStepIndex += 1;
    this.pendingBossStep = step;
    this.pendingBossSpawnAt = now + 1400;
    const warningText = step.kind === "finalBoss" ? "终极Boss即将降临！" : step.kind === "mainBoss" ? "大Boss预警！" : "小Boss来袭！";
    gameEvents.emit("ui:warning", { text: warningText, color: "#fca5a5" });
  }

  private canSpawnBoss(kind: EnemyKind): boolean {
    const aliveMini = this.enemies.filter((enemy) => enemy.kind === "miniBoss" && !enemy.isDead).length;
    const aliveMain = this.enemies.filter((enemy) => (enemy.kind === "mainBoss" || enemy.kind === "finalBoss") && !enemy.isDead).length;
    if (kind === "miniBoss") {
      return aliveMini < 2;
    }
    return aliveMain < 1;
  }

  private updateEnemies(now: number): void {
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        continue;
      }
      this.runEliteSkills(enemy, now);
      this.runBossSkills(enemy, now);
      const ai = this.enemyBossAi.get(enemy.id);
      if (ai?.dashUntil !== undefined && now < ai.dashUntil) {
        if (ai.dashVx !== undefined && ai.dashVy !== undefined) {
          const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
          body.setVelocity(ai.dashVx, ai.dashVy);
        }
        enemy.syncVisual();
        continue;
      }
      if (ai?.dashPrepUntil !== undefined && now < ai.dashPrepUntil) {
        const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        enemy.syncVisual();
        continue;
      }
      const slowedSpeed = this.getEnemyMoveSpeedAfterStatus(enemy, now);
      this.physics.moveToObject(enemy.sprite, this.player.sprite, slowedSpeed);
      enemy.syncVisual();
    }
  }

  private runEliteSkills(enemy: Enemy, now: number): void {
    if (!enemy.isElite || enemy.kind !== "normal") {
      return;
    }
    if (enemy.eliteAffixId === "sniper") {
      const dist = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (dist < 450 && this.canDamage(`elite-${enemy.id}`, "sniper-cast", now, 2400)) {
        this.spawnEnemyProjectile(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y, Math.max(9, enemy.projectileDamage || 9));
      }
    } else if (enemy.eliteAffixId === "summoner") {
      if (this.canDamage(`elite-${enemy.id}`, "summon-cast", now, 6200)) {
        this.spawnEnemyNear(enemy.sprite.x, enemy.sprite.y, "normal");
      }
    }
  }

  private runBossSkills(enemy: Enemy, now: number): void {
    if (enemy.variant === "spitter") {
      const dist = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (dist < 300 && this.canDamage(`spitter-${enemy.id}`, "cast", now, 2200)) {
        this.spawnEnemyProjectile(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y, enemy.projectileDamage);
      }
      return;
    }

    if (enemy.kind === "normal") {
      return;
    }
    const state = this.enemyBossAi.get(enemy.id) ?? {};
    const hpRatio = enemy.maxHealth <= 0 ? 1 : enemy.health / enemy.maxHealth;

    if (!state.enraged) {
      const shouldEnrage =
        (enemy.variant === "miniA" && hpRatio <= 0.5) ||
        (enemy.variant === "miniB" && hpRatio <= 0.5) ||
        (enemy.variant === "miniC" && hpRatio <= 0.4) ||
        (enemy.variant === "miniD" && hpRatio <= 0.5) ||
        (enemy.variant === "miniE" && hpRatio <= 0.45) ||
        (enemy.variant === "miniF" && hpRatio <= 0.4) ||
        (enemy.variant === "mainA" && hpRatio <= 0.5) ||
        (enemy.variant === "mainB" && hpRatio <= 0.42);
      if (shouldEnrage) {
        state.enraged = true;
        state.nextBurstAt = now + 500;
        state.nextDashAt = now + 450;
        state.nextZoneAt = now + 900;
        state.nextSpecialAt = now + 950;
        this.spawnText(enemy.sprite.x, enemy.sprite.y - 30, "狂暴阶段", "#fb7185", 15);
        this.cameras.main.shake(130, 0.0025);
      }
    }

    if (enemy.variant === "miniA") {
      if (state.dashPrepUntil !== undefined && now >= state.dashPrepUntil) {
        const tx = state.dashTargetX ?? this.player.sprite.x;
        const ty = state.dashTargetY ?? this.player.sprite.y;
        const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, tx, ty);
        const speed = enemy.moveSpeed * (state.enraged ? 4.2 : 3.6);
        state.dashVx = Math.cos(angle) * speed;
        state.dashVy = Math.sin(angle) * speed;
        state.dashUntil = now + (state.enraged ? 760 : 640);
        state.dashPrepUntil = undefined;
        state.dashTargetX = undefined;
        state.dashTargetY = undefined;
        if ((state.dashChainLeft ?? 0) > 0) {
          state.nextDashAt = state.dashUntil + 140;
        } else {
          state.nextDashAt = now + Phaser.Math.Between(2900, 4200);
        }
        const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(state.dashVx, state.dashVy);
        if (state.enraged) {
          this.spawnRadialProjectiles(enemy, 6, 170);
        }
      }
      const isDashing = state.dashUntil !== undefined && now < state.dashUntil;
      const isPreparing = state.dashPrepUntil !== undefined && now < state.dashPrepUntil;
      if ((state.nextDashAt ?? 0) <= now && !isDashing && !isPreparing) {
        const chainTotal = state.enraged ? 3 : 1;
        if ((state.dashChainLeft ?? 0) <= 0) {
          state.dashChainLeft = chainTotal;
        }
        state.dashChainLeft = Math.max(0, (state.dashChainLeft ?? 0) - 1);
        state.dashPrepUntil = now + (state.enraged ? 460 : 700);
        state.dashTargetX = this.player.sprite.x;
        state.dashTargetY = this.player.sprite.y;
        this.drawDashWarning(enemy, state.dashTargetX, state.dashTargetY, state.enraged ? 420 : 680);
      }
    }
    if (enemy.variant === "miniB") {
      if ((state.nextBurstAt ?? 0) <= now) {
        if (!state.enraged) {
          state.nextBurstAt = now + Phaser.Math.Between(3800, 5200);
          this.spawnRadialProjectiles(enemy, 10, 190);
        } else {
          state.nextBurstAt = now + Phaser.Math.Between(2600, 3600);
          const pattern = state.patternIndex ?? 0;
          if (pattern % 2 === 0) {
            this.spawnSpiralProjectiles(enemy, 14, 210, 0);
            this.spawnSpiralProjectiles(enemy, 14, 230, Math.PI / 8);
          } else {
            this.spawnRingWithSafeSector(enemy, 18, 230, 46);
          }
          state.patternIndex = pattern + 1;
        }
      }
    }
    if (enemy.variant === "miniC") {
      if ((state.nextBurstAt ?? 0) <= now) {
        state.nextBurstAt = now + Phaser.Math.Between(4300, 6200);
        const summonCount = state.enraged ? 3 : 2;
        for (let i = 0; i < summonCount; i += 1) {
          this.spawnEnemyNear(enemy.sprite.x, enemy.sprite.y, "normal");
        }
      }
      if (state.enraged && (state.nextZoneAt ?? 0) <= now) {
        state.nextZoneAt = now + Phaser.Math.Between(5600, 7000);
        this.spawnBossHazardZone(enemy.sprite.x, enemy.sprite.y, 92, 4200, 10, 420, "腐蚀区");
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        this.spawnBossHazardZone(
          enemy.sprite.x + Math.cos(angle) * 120,
          enemy.sprite.y + Math.sin(angle) * 120,
          84,
          4000,
          10,
          420,
          "腐蚀区",
        );
      }
    }
    if (enemy.variant === "miniD") {
      if ((state.nextDashAt ?? 0) <= now) {
        state.nextDashAt = now + (state.enraged ? Phaser.Math.Between(2400, 3200) : Phaser.Math.Between(3400, 4600));
        this.spawnAimedBurst(enemy, state.enraged ? 7 : 5, state.enraged ? 0.18 : 0.11, state.enraged ? 260 : 220);
      }
      if ((state.nextSpecialAt ?? 0) <= now) {
        state.nextSpecialAt = now + (state.enraged ? Phaser.Math.Between(4200, 5600) : Phaser.Math.Between(6200, 7600));
        this.castMeteorRain(state.enraged ? 4 : 3);
      }
    }
    if (enemy.variant === "miniE") {
      if ((state.nextBurstAt ?? 0) <= now) {
        state.nextBurstAt = now + (state.enraged ? Phaser.Math.Between(2900, 3900) : Phaser.Math.Between(4300, 5600));
        this.spawnCrossProjectiles(enemy, state.enraged ? 260 : 230);
        if (state.enraged) {
          this.spawnRingWithSafeSector(enemy, 14, 220, 38);
        }
      }
      if (state.enraged && (state.nextZoneAt ?? 0) <= now) {
        state.nextZoneAt = now + Phaser.Math.Between(5800, 7600);
        this.spawnBossHazardZone(this.player.sprite.x, this.player.sprite.y, 80, 2600, 10, 320, "禁足场");
      }
    }
    if (enemy.variant === "miniF") {
      if ((state.nextBurstAt ?? 0) <= now) {
        state.nextBurstAt = now + (state.enraged ? Phaser.Math.Between(2400, 3300) : Phaser.Math.Between(3600, 4700));
        this.spawnSpiralProjectiles(enemy, state.enraged ? 16 : 12, state.enraged ? 240 : 210, now * 0.0034);
      }
      if ((state.nextDashAt ?? 0) <= now) {
        state.nextDashAt = now + (state.enraged ? Phaser.Math.Between(2400, 3200) : Phaser.Math.Between(4300, 5600));
        state.dashUntil = now + (state.enraged ? 520 : 360);
        this.physics.moveToObject(enemy.sprite, this.player.sprite, enemy.moveSpeed * (state.enraged ? 3.1 : 2.2));
      }
    }
    if (enemy.variant === "mainA") {
      if ((state.nextBurstAt ?? 0) <= now) {
        state.nextBurstAt = now + (state.enraged ? Phaser.Math.Between(2500, 3400) : Phaser.Math.Between(3200, 4400));
        this.spawnRingWithSafeSector(enemy, 20, 240, 52);
      }
      if ((state.nextDashAt ?? 0) <= now) {
        state.nextDashAt = now + (state.enraged ? Phaser.Math.Between(4200, 5600) : Phaser.Math.Between(5600, 7600));
        state.dashUntil = now + (state.enraged ? 420 : 340);
        this.physics.moveToObject(enemy.sprite, this.player.sprite, enemy.moveSpeed * (state.enraged ? 2.8 : 2.3));
      }
      if ((state.nextSpecialAt ?? 0) <= now) {
        state.nextSpecialAt = now + (state.enraged ? Phaser.Math.Between(4700, 6200) : Phaser.Math.Between(6200, 7800));
        this.castMeteorRain(state.enraged ? 6 : 4);
      }
    }
    if (enemy.variant === "mainB") {
      if ((state.nextBurstAt ?? 0) <= now) {
        state.nextBurstAt = now + (state.enraged ? Phaser.Math.Between(2300, 3100) : Phaser.Math.Between(3400, 4600));
        this.spawnSpiralProjectiles(enemy, state.enraged ? 28 : 20, state.enraged ? 290 : 255, now * 0.0025);
      }
      if ((state.nextSpecialAt ?? 0) <= now) {
        state.nextSpecialAt = now + (state.enraged ? Phaser.Math.Between(3800, 5200) : Phaser.Math.Between(5600, 7000));
        this.spawnBossHazardZone(this.player.sprite.x, this.player.sprite.y, 86, state.enraged ? 3600 : 2600, 10, 300, "湮灭场");
      }
      if ((state.nextSummonAt ?? 0) <= now) {
        state.nextSummonAt = now + (state.enraged ? Phaser.Math.Between(4200, 5600) : Phaser.Math.Between(6200, 7800));
        const count = state.enraged ? 4 : 2;
        for (let i = 0; i < count; i += 1) {
          this.spawnEnemyNear(enemy.sprite.x, enemy.sprite.y, "normal");
        }
      }
    }
    if (enemy.kind === "finalBoss") {
      if ((state.nextBurstAt ?? 0) <= now) {
        state.nextBurstAt = now + Phaser.Math.Between(2400, 3300);
        this.spawnSpiralProjectiles(enemy, 24, 275, now * 0.0025);
      }
      if ((state.nextDashAt ?? 0) <= now) {
        state.nextDashAt = now + Phaser.Math.Between(3600, 4700);
        state.dashUntil = now + 420;
        this.physics.moveToObject(enemy.sprite, this.player.sprite, enemy.moveSpeed * 3);
      }
      if ((state.nextSummonAt ?? 0) <= now) {
        state.nextSummonAt = now + Phaser.Math.Between(5200, 6400);
        this.spawnEnemyNear(enemy.sprite.x, enemy.sprite.y, "normal");
        this.spawnEnemyNear(enemy.sprite.x, enemy.sprite.y, "normal");
        this.spawnEnemyNear(enemy.sprite.x, enemy.sprite.y, "normal");
      }
      if ((state.nextSpecialAt ?? 0) <= now) {
        state.nextSpecialAt = now + Phaser.Math.Between(5200, 6900);
        this.spawnBossHazardZone(this.player.sprite.x, this.player.sprite.y, 88, 2800, 10, 300, "湮灭场");
      }
    }
    this.enemyBossAi.set(enemy.id, state);
  }

  private spawnRadialProjectiles(enemy: Enemy, rays: number, speed: number): void {
    for (let i = 0; i < rays; i += 1) {
      const angle = (Math.PI * 2 * i) / rays;
      const orb = this.add.circle(enemy.sprite.x, enemy.sprite.y, 5, 0xfca5a5);
      this.physics.add.existing(orb);
      const body = orb.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.enemyProjectiles.push({
        id: this.enemyProjectileId++,
        sprite: orb,
        damage: enemy.projectileDamage,
        spawnAt: this.time.now,
      });
    }
  }

  private spawnEnemyProjectile(fromX: number, fromY: number, toX: number, toY: number, damage: number): void {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    const orb = this.add.circle(fromX, fromY, 5, 0xfca5a5);
    this.physics.add.existing(orb);
    const body = orb.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocity(Math.cos(angle) * 220, Math.sin(angle) * 220);
    this.enemyProjectiles.push({
      id: this.enemyProjectileId++,
      sprite: orb,
      damage,
      spawnAt: this.time.now,
    });
  }

  private spawnAimedBurst(enemy: Enemy, count: number, spreadRad: number, speed: number): void {
    const baseAngle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
    for (let i = 0; i < count; i += 1) {
      const t = count <= 1 ? 0 : i / (count - 1);
      const angle = baseAngle + (t - 0.5) * spreadRad * count;
      const orb = this.add.circle(enemy.sprite.x, enemy.sprite.y, 5, 0xfda4af);
      this.physics.add.existing(orb);
      const body = orb.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.enemyProjectiles.push({
        id: this.enemyProjectileId++,
        sprite: orb,
        damage: enemy.projectileDamage,
        spawnAt: this.time.now,
      });
    }
  }

  private spawnCrossProjectiles(enemy: Enemy, speed: number): void {
    const angles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5, Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
    for (const angle of angles) {
      const orb = this.add.circle(enemy.sprite.x, enemy.sprite.y, 5, 0xfcd34d);
      this.physics.add.existing(orb);
      const body = orb.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.enemyProjectiles.push({
        id: this.enemyProjectileId++,
        sprite: orb,
        damage: enemy.projectileDamage,
        spawnAt: this.time.now,
      });
    }
  }

  private spawnSpiralProjectiles(enemy: Enemy, rays: number, speed: number, angleOffset: number): void {
    for (let i = 0; i < rays; i += 1) {
      const angle = angleOffset + (Math.PI * 2 * i) / rays;
      const orb = this.add.circle(enemy.sprite.x, enemy.sprite.y, 5, 0x7dd3fc);
      this.physics.add.existing(orb);
      const body = orb.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.enemyProjectiles.push({
        id: this.enemyProjectileId++,
        sprite: orb,
        damage: enemy.projectileDamage,
        spawnAt: this.time.now,
      });
    }
  }

  private spawnRingWithSafeSector(enemy: Enemy, rays: number, speed: number, safeAngleDeg: number): void {
    const safeAngle = Phaser.Math.DegToRad(safeAngleDeg);
    const escapeAngle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
    for (let i = 0; i < rays; i += 1) {
      const angle = (Math.PI * 2 * i) / rays;
      const delta = Phaser.Math.Angle.Wrap(angle - escapeAngle);
      if (Math.abs(delta) <= safeAngle / 2) {
        continue;
      }
      const orb = this.add.circle(enemy.sprite.x, enemy.sprite.y, 5, 0xfca5a5);
      this.physics.add.existing(orb);
      const body = orb.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.enemyProjectiles.push({
        id: this.enemyProjectileId++,
        sprite: orb,
        damage: enemy.projectileDamage,
        spawnAt: this.time.now,
      });
    }
  }

  private castMeteorRain(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(50, 180);
      const x = this.player.sprite.x + Math.cos(angle) * dist;
      const y = this.player.sprite.y + Math.sin(angle) * dist;
      const marker = this.add.circle(x, y, 22, 0xf97316, 0.22).setStrokeStyle(2, 0xfb923c, 0.85).setDepth(14);
      this.tweens.add({
        targets: marker,
        alpha: 0.9,
        duration: 460,
        yoyo: true,
        repeat: 1,
      });
      this.time.delayedCall(920, () => {
        if (!marker.active) {
          return;
        }
        const distToPlayer = Phaser.Math.Distance.Between(x, y, this.player.sprite.x, this.player.sprite.y);
        if (distToPlayer <= 28) {
          this.damagePlayer(20);
        }
        const blast = this.add.circle(x, y, 30, 0xfb7185, 0.34).setDepth(15);
        this.tweens.add({
          targets: blast,
          alpha: 0,
          scale: 1.7,
          duration: 260,
          onComplete: () => blast.destroy(),
        });
        marker.destroy();
      });
    }
  }

  private spawnBossHazardZone(
    x: number,
    y: number,
    radius: number,
    lifeMs: number,
    damage: number,
    intervalMs: number,
    label: string,
  ): void {
    const circle = this.add.circle(x, y, radius, 0xef4444, 0.14).setStrokeStyle(2, 0xfca5a5, 0.9).setDepth(13);
    const text = this.add
      .text(x, y, label, {
        color: "#fecaca",
        fontFamily: "Segoe UI",
        fontSize: "11px",
        fontStyle: "bold",
        stroke: "#020617",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(14);
    this.bossHazards.push({
      id: this.bossHazardId++,
      circle,
      label: text,
      expiresAt: this.time.now + lifeMs,
      nextDamageAt: this.time.now,
      damageIntervalMs: intervalMs,
      damage,
    });
  }

  private updateBossHazards(now: number): void {
    for (const hazard of this.bossHazards) {
      if (now >= hazard.expiresAt || !hazard.circle.active) {
        hazard.circle.destroy();
        hazard.label.destroy();
        continue;
      }
      const pulse = 0.12 + Math.abs(Math.sin((now + hazard.id * 41) * 0.009)) * 0.14;
      hazard.circle.setAlpha(pulse);
      if (now < hazard.nextDamageAt) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(
        hazard.circle.x,
        hazard.circle.y,
        this.player.sprite.x,
        this.player.sprite.y,
      );
      if (distance <= hazard.circle.radius) {
        this.damagePlayer(hazard.damage);
      }
      hazard.nextDamageAt = now + hazard.damageIntervalMs;
    }
    this.bossHazards = this.bossHazards.filter((hazard) => hazard.circle.active && now < hazard.expiresAt);
  }

  private drawDashWarning(enemy: Enemy, targetX: number, targetY: number, durationMs: number): void {
    const dx = targetX - enemy.sprite.x;
    const dy = targetY - enemy.sprite.y;
    const line = this.add.line(enemy.sprite.x, enemy.sprite.y, 0, 0, dx, dy, 0xf97316, 0.85).setOrigin(0, 0);
    line.setLineWidth(3, 3);
    const zone = this.add.circle(targetX, targetY, enemy.sprite.radius + 14, 0xf97316, 0.2).setStrokeStyle(2, 0xfb923c, 0.9);
    this.tweens.add({
      targets: [line, zone],
      alpha: 0,
      duration: durationMs,
      ease: "Quad.Out",
      onComplete: () => {
        line.destroy();
        zone.destroy();
      },
    });
  }

  private spawnEnemyNear(x: number, y: number, kind: EnemyKind): void {
    if (this.enemies.length >= MAX_ENEMIES) {
      return;
    }
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist = Phaser.Math.Between(50, 110);
    const sx = Phaser.Math.Clamp(x + Math.cos(angle) * dist, 20, WORLD_SIZE - 20);
    const sy = Phaser.Math.Clamp(y + Math.sin(angle) * dist, 20, WORLD_SIZE - 20);
    const normalVariant = kind === "normal" ? this.pickNormalVariantForProgress() : undefined;
    const eliteAffixId = kind === "normal" ? this.getEliteAffixForSpawn() : undefined;
    const enemy = new Enemy(this, sx, sy, kind, normalVariant, eliteAffixId);
    this.applyEnemyDifficulty(enemy);
    this.enemies.push(enemy);
    this.createEliteFx(enemy);
  }

  private updateEnemyProjectiles(now: number): void {
    for (const projectile of this.enemyProjectiles) {
      if (!projectile.sprite.active) {
        continue;
      }
      const outOfWorld =
        projectile.sprite.x < -40 ||
        projectile.sprite.y < -40 ||
        projectile.sprite.x > WORLD_SIZE + 40 ||
        projectile.sprite.y > WORLD_SIZE + 40;
      if (outOfWorld || now - projectile.spawnAt > 3600) {
        projectile.sprite.destroy();
      }
    }
    this.enemyProjectiles = this.enemyProjectiles.filter((item) => item.sprite.active);
  }

  private getEnemyMoveSpeedAfterStatus(enemy: Enemy, now: number): number {
    const status = this.enemyStatus.get(enemy.id);
    if (status === undefined || now >= status.freezeUntil) {
      return enemy.moveSpeed;
    }
    return Math.max(25, enemy.moveSpeed * (1 - status.freezeSlow));
  }

  private updateEnemyStatusEffects(now: number): void {
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        this.enemyStatus.delete(enemy.id);
        continue;
      }
      const status = this.enemyStatus.get(enemy.id);
      if (status === undefined) {
        continue;
      }

      if (now >= status.burnUntil) {
        status.burnPower = 0;
      } else if (now >= status.burnNextTickAt) {
        status.burnNextTickAt = now + 260;
        const burnDamage = Math.max(1, Math.round(0.6 + status.burnPower));
        this.dealStatusDamage(enemy, burnDamage, "#fb923c");
      }

      if (now >= status.poisonUntil) {
        status.poisonStacks = 0;
        status.poisonPower = 0;
      } else if (now >= status.poisonNextTickAt) {
        status.poisonNextTickAt = now + Math.max(100, getElementStatusConfig("poison").tickMs);
        const poisonDamage = this.player.stats.damage * 0.24 * Math.max(0.35, status.poisonPower) * (1 + (status.poisonStacks - 1) * 0.3);
        this.dealStatusDamage(enemy, poisonDamage, "#34d399");
      }

      if (now >= status.freezeUntil) {
        status.freezeSlow = 0;
      }

      const inactive =
        status.burnPower <= 0 &&
        status.poisonStacks <= 0 &&
        now >= status.freezeUntil;
      if (inactive) {
        this.enemyStatus.delete(enemy.id);
      } else {
        this.enemyStatus.set(enemy.id, status);
      }
    }
  }

  private updateActiveSkills(now: number): void {
    if (!this.skillUnlocked.flamethrower || this.player.isDead || this.choicePaused || !this.gameStarted) {
      return;
    }
    if (now < this.skillCooldowns.flamethrower) {
      return;
    }
    const rateLv = this.skillNodeLevels.flamethrower.a;
    const rangeLv = this.skillNodeLevels.flamethrower.b;
    const interval = Math.max(700, 2000 - rateLv * 220);
    this.skillCooldowns.flamethrower = now + interval;

    const range = 138 + rangeLv * 20;
    this.playFlamethrowerEffect(range);
    let hitCount = 0;
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        continue;
      }
      const dist = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (dist > range) {
        continue;
      }
      hitCount += 1;
      const damage = this.player.stats.damage * (0.28 + rangeLv * 0.05);
      this.dealStatusDamage(enemy, damage, "#fb923c");
      this.tryApplyElement(enemy, "burn", damage, now);
      if (hitCount >= 8) {
        break;
      }
    }
    if (hitCount > 0) {
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 34, "喷火器", "#fb923c", 11);
    }
  }

  private playFlamethrowerEffect(range: number): void {
    const wave = this.add.circle(this.player.sprite.x, this.player.sprite.y, 22, 0xfb923c, 0.22);
    this.tweens.add({
      targets: wave,
      radius: range,
      alpha: 0,
      duration: 240,
      ease: "Quad.Out",
      onComplete: () => wave.destroy(),
    });
    for (let i = 0; i < 7; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spark = this.add.circle(this.player.sprite.x, this.player.sprite.y, Phaser.Math.Between(3, 5), 0xf97316, 0.85);
      this.tweens.add({
        targets: spark,
        x: this.player.sprite.x + Math.cos(angle) * Phaser.Math.Between(Math.floor(range * 0.45), Math.floor(range * 0.85)),
        y: this.player.sprite.y + Math.sin(angle) * Phaser.Math.Between(Math.floor(range * 0.45), Math.floor(range * 0.85)),
        alpha: 0,
        duration: 260,
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private dealStatusDamage(enemy: Enemy, amount: number, color: string): void {
    if (enemy.isDead || amount <= 0) {
      return;
    }
    const dealt = enemy.damage(amount);
    if (dealt <= 0) {
      return;
    }
    this.evolutionBehaviorState.damage_dealt = (this.evolutionBehaviorState.damage_dealt ?? 0) + dealt;
    this.spawnDamageText(enemy.sprite.x, enemy.sprite.y - enemy.sprite.radius - 8, dealt, color);
  }

  private tryApplyElementStatuses(enemy: Enemy, bulletDamage: number, now: number): void {
    this.tryApplyElement(enemy, "burn", bulletDamage, now);
    this.tryApplyElement(enemy, "poison", bulletDamage, now);
    this.tryApplyElement(enemy, "freeze", bulletDamage, now);
    this.tryApplyElement(enemy, "lightning", bulletDamage, now);
  }

  private tryApplyElement(enemy: Enemy, kind: ElementStatusKind, bulletDamage: number, now: number): void {
    if (!this.isElementEnabled(kind)) {
      return;
    }
    const config = getElementStatusConfig(kind);
    const bonus = this.elementBonuses[kind];
    const procChance = Phaser.Math.Clamp(config.baseProcChance + bonus.procAdd, 0, 0.95);
    if (Math.random() > procChance) {
      return;
    }

    const status = this.enemyStatus.get(enemy.id) ?? {
      burnUntil: 0,
      burnNextTickAt: 0,
      burnPower: 0,
      poisonUntil: 0,
      poisonNextTickAt: 0,
      poisonStacks: 0,
      poisonPower: 0,
      freezeUntil: 0,
      freezeSlow: 0,
    };

    if (kind === "burn") {
      status.burnUntil = now + config.durationMs + bonus.durationAddMs;
      status.burnNextTickAt = now + config.tickMs;
      status.burnPower = config.basePower * bonus.powerMul;
      this.spawnText(enemy.sprite.x, enemy.sprite.y - 24, "燃烧", "#fb923c", 11);
    } else if (kind === "poison") {
      status.poisonUntil = now + config.durationMs + bonus.durationAddMs;
      status.poisonNextTickAt = now + config.tickMs;
      status.poisonPower = config.basePower * bonus.powerMul;
      status.poisonStacks = config.stackRule === "stack" ? Math.min(6, status.poisonStacks + 1) : Math.max(1, status.poisonStacks);
      this.spawnText(enemy.sprite.x, enemy.sprite.y - 24, `中毒 x${Math.max(1, status.poisonStacks)}`, "#34d399", 11);
    } else if (kind === "freeze") {
      status.freezeUntil = now + config.durationMs + bonus.durationAddMs;
      status.freezeSlow = Phaser.Math.Clamp(config.basePower * bonus.powerMul, 0.1, 0.75);
      this.spawnText(enemy.sprite.x, enemy.sprite.y - 24, "冰冻", "#67e8f9", 11);
    } else {
      const chainCount = Math.max(1, (config.chainCount ?? 1) + bonus.chainCountAdd);
      const chainRange = config.chainRange ?? 150;
      this.triggerLightning(enemy, bulletDamage * config.basePower * bonus.powerMul, chainCount, chainRange);
    }

    this.enemyStatus.set(enemy.id, status);
  }

  private triggerLightning(origin: Enemy, damage: number, chainCount: number, range: number): void {
    let fromX = origin.sprite.x;
    let fromY = origin.sprite.y;
    const hit = new Set<number>([origin.id]);
    for (let i = 0; i < chainCount; i += 1) {
      const target = this.findNearestEnemyInRange(fromX, fromY, range, hit);
      if (target === undefined) {
        return;
      }
      hit.add(target.id);
      const dealt = target.damage(damage);
      if (dealt > 0) {
        this.evolutionBehaviorState.damage_dealt = (this.evolutionBehaviorState.damage_dealt ?? 0) + dealt;
        this.spawnDamageText(target.sprite.x, target.sprite.y - target.sprite.radius - 8, dealt, "#a5b4fc");
        const bolt = this.add.line(0, 0, fromX, fromY, target.sprite.x, target.sprite.y, 0x93c5fd, 0.9).setOrigin(0, 0);
        bolt.setLineWidth(2, 2);
        this.time.delayedCall(85, () => bolt.destroy());
      }
      fromX = target.sprite.x;
      fromY = target.sprite.y;
    }
  }

  private findNearestEnemyInRange(x: number, y: number, range: number, excluded: Set<number>): Enemy | undefined {
    let target: Enemy | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (enemy.isDead || excluded.has(enemy.id)) {
        continue;
      }
      const distance = Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y);
      if (distance > range || distance >= best) {
        continue;
      }
      best = distance;
      target = enemy;
    }
    return target;
  }

  private autoFire(now: number): void {
    if (this.isReloading) {
      return;
    }
    if (this.currentAmmo <= 0) {
      this.startReload("弹夹打空，自动换弹");
      return;
    }
    const interval = 1000 / this.player.stats.fireRate;
    if (now < this.lastFireAt + interval) {
      return;
    }
    const target = this.findNearestEnemy(this.player.sprite.x, this.player.sprite.y);
    if (target === undefined) {
      return;
    }

    this.lastFireAt = now;
    this.currentAmmo -= 1;
    const baseAngle = Phaser.Math.Angle.Between(
      this.player.sprite.x,
      this.player.sprite.y,
      target.sprite.x,
      target.sprite.y,
    );
    const spreadRad = Phaser.Math.DegToRad(10);
    const count = this.player.stats.projectileCount;
    const projectileSpeed = Phaser.Math.Clamp(this.player.stats.projectileSpeed, 280, 520);
    const branch = this.selectedEvolutionBranchId === undefined ? undefined : this.getEvolutionBranch(this.selectedEvolutionBranchId);
    const chainShots = branch?.effects.chainShots ?? 0;
    const recoilSpread = branch?.effects.recoilSpread ?? 0;
    const totalShots = count + chainShots;
    const totalCenterOffset = (totalShots - 1) / 2;

    for (let i = 0; i < totalShots; i += 1) {
      const angle = baseAngle + (i - totalCenterOffset) * (spreadRad + recoilSpread);
      const isCrit = Math.random() < this.player.stats.critChance;
      const baseDamage = isCrit ? this.player.stats.damage * this.player.stats.critMultiplier : this.player.stats.damage;
      const damage = baseDamage * this.passive.projectileDamageMultiplier;
      const bullet = new Bullet(
        this,
        this.player.sprite.x,
        this.player.sprite.y,
        this.player.stats.projectileSize,
        isCrit ? 0xfbbf24 : 0xf8fafc,
        damage,
        this.player.stats.projectilePenetration,
        now,
        isCrit,
      );
      const body = bullet.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(
        Math.cos(angle) * projectileSpeed,
        Math.sin(angle) * projectileSpeed,
      );
      this.bullets.push(bullet);
    }

    while (this.bullets.length > MAX_BULLETS) {
      const oldest = this.bullets.shift();
      oldest?.sprite.destroy();
    }

    if (this.currentAmmo <= 0) {
      this.startReload("弹夹打空，自动换弹");
    }
  }

  private resolveBulletHits(): void {
    const now = this.time.now;
    for (const bullet of this.bullets) {
      if (!bullet.sprite.active) {
        continue;
      }
      for (const enemy of this.enemies) {
        if (enemy.isDead) {
          continue;
        }
        if (bullet.hitEnemyIds.has(enemy.id)) {
          continue;
        }
        const hitDistance = enemy.sprite.radius + bullet.sprite.radius;
        const distance = Phaser.Math.Distance.Between(bullet.sprite.x, bullet.sprite.y, enemy.sprite.x, enemy.sprite.y);
        if (distance > hitDistance) {
          continue;
        }

        const bossMul = enemy.kind === "normal" ? 1 : this.passive.bossDamageMultiplier;
        const dealt = enemy.damage(bullet.damage * bossMul);
        bullet.hitEnemyIds.add(enemy.id);
        if (dealt > 0) {
          this.evolutionBehaviorState.damage_dealt = (this.evolutionBehaviorState.damage_dealt ?? 0) + dealt;
          if (bullet.isCrit) {
            this.evolutionBehaviorState.crit_hits = (this.evolutionBehaviorState.crit_hits ?? 0) + 1;
          }
          this.tryApplyElementStatuses(enemy, dealt, now);
          this.flashHit(enemy.visual, 70, enemy.eliteTintColor);
          this.spawnDamageText(
            enemy.sprite.x,
            enemy.sprite.y - 16,
            dealt,
            bullet.sprite.fillColor === 0xfbbf24 ? "#fde68a" : "#fecaca",
          );
        }
        if (bullet.penetrationLeft > 1) {
          this.evolutionBehaviorState.enemies_pierced = (this.evolutionBehaviorState.enemies_pierced ?? 0) + 1;
        }
        bullet.penetrationLeft -= 1;
        if (bullet.penetrationLeft <= 0) {
          bullet.sprite.destroy();
          break;
        }
      }
    }
  }

  private resolveEnemyContact(now: number): void {
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        continue;
      }
      const collisionDistance = enemy.sprite.radius + this.player.hitRadius;
      const distance = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (distance > collisionDistance) {
        continue;
      }
      if (!this.canDamage(`enemy-${enemy.id}`, "player", now, 460)) {
        continue;
      }
      this.damagePlayer(20);
    }
  }

  private resolveEnemyProjectileHit(now: number): void {
    for (const projectile of this.enemyProjectiles) {
      if (!projectile.sprite.active) {
        continue;
      }
      const hitDistance = projectile.sprite.radius + this.player.hitRadius;
      const distance = Phaser.Math.Distance.Between(
        projectile.sprite.x,
        projectile.sprite.y,
        this.player.sprite.x,
        this.player.sprite.y,
      );
      if (distance > hitDistance) {
        continue;
      }
      if (!this.canDamage(`ep-${projectile.id}`, "player", now, 300)) {
        continue;
      }
      projectile.sprite.destroy();
      this.damagePlayer(10);
    }
  }

  private damagePlayer(amount: number): void {
    if (this.time.now < this.passive.invincibleUntil) {
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 30, "无敌", "#93c5fd", 12);
      return;
    }
    if (this.passive.emergencyShieldCharges > 0) {
      this.passive.emergencyShieldCharges = Math.max(0, this.passive.emergencyShieldCharges - 1);
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 30, "护盾抵消", "#fcd34d", 12);
      this.refreshPassiveDetails();
      return;
    }
    const dealt = this.player.damage(amount);
    if (dealt > 0) {
      this.flashHit(this.player.visual, 90);
      this.spawnDamageText(this.player.sprite.x, this.player.sprite.y - 18, dealt, "#fef08a");
      this.cameras.main.shake(60, 0.0017);
    }
    if (this.player.isDead) {
      if (!this.gameFinished) {
        this.gameFinished = true;
        this.gameStarted = false;
        this.setChoicePaused(true);
        gameEvents.emit("ui:showGameOver");
      }
    }
  }

  private collectOrbs(): void {
    const collected = new Set<ExperienceOrb>();
    for (const orb of this.orbs) {
      const distance = Phaser.Math.Distance.Between(orb.sprite.x, orb.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (distance <= this.player.stats.pickupRadius * this.passive.pickupRadiusMultiplier) {
        this.addExperience(orb.value);
        collected.add(orb);
      }
    }
    for (const orb of collected) {
      orb.sprite.destroy();
    }
    this.orbs = this.orbs.filter((orb) => !collected.has(orb));
  }

  private collectPassiveDrops(): void {
    const collected = new Set<PassiveDrop>();
    for (const drop of this.passiveDrops) {
      const distance = Phaser.Math.Distance.Between(drop.sprite.x, drop.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (distance <= this.player.stats.pickupRadius * this.passive.pickupRadiusMultiplier + 6) {
        collected.add(drop);
        this.openPassiveSelection(drop);
        break;
      }
    }
    for (const drop of collected) {
      drop.sprite.destroy();
    }
    this.passiveDrops = this.passiveDrops.filter((drop) => !collected.has(drop));
  }

  private openPassiveSelection(drop: PassiveDrop): void {
    const option = this.getPassiveOptionByKind(drop.kind);
    if ((this.passiveLevels[option.kind] ?? 0) > 0) {
      this.setChoicePaused(false);
      gameEvents.emit("ui:toast", { text: "该被动已拥有，转化为经验", color: "#93c5fd" });
      this.addExperience(18);
      return;
    }
    this.activePassiveOption = option;
    this.passiveRerollAvailable = 1;
    this.choiceTimeoutAt = this.time.now + 12000;
    this.setChoicePaused(true);

    const token = ++this.passiveSelectionToken;
    const selectHandler = (kind: PassiveDropKind) => {
      if (token !== this.passiveSelectionToken) {
        return;
      }
      const level = this.applyPassiveDrop(kind);
      this.activePassiveOption = undefined;
      this.setChoicePaused(false);
      gameEvents.emit("ui:toast", { text: level > 1 ? `被动已强化 Lv.${level}` : "被动已获取", color: "#a7f3d0" });
    };
    const rerollHandler = () => {
      if (token !== this.passiveSelectionToken || this.passiveRerollAvailable <= 0 || this.activePassiveOption === undefined) {
        return;
      }
      this.passiveRerollAvailable = 0;
      const rerolled = this.getRandomPassiveOption(this.activePassiveOption.kind);
      if (rerolled !== undefined) {
        this.activePassiveOption = rerolled;
      }
      gameEvents.emit("passive:open", { option: this.activePassiveOption, rerollLeft: this.passiveRerollAvailable });
    };

    gameEvents.once("passive:selected", selectHandler);
    gameEvents.once("passive:reroll", rerollHandler);
    gameEvents.emit("passive:open", { option: this.activePassiveOption, rerollLeft: this.passiveRerollAvailable });
  }

  private getRandomPassiveOption(exclude?: PassiveDropKind): PassiveOption | undefined {
    return getRandomPassiveOption(this.passiveLevels, exclude);
  }

  private addExperience(rawValue: number): void {
    const gained = Math.max(1, Math.round(rawValue * this.player.stats.expGainMultiplier * this.passive.expGainMultiplier * 0.5));
    this.player.exp += gained;
    while (this.player.exp >= this.player.expToNext) {
      this.player.exp -= this.player.expToNext;
      this.player.level += 1;
      this.player.expToNext = Math.floor(this.player.expToNext * 1.3 + 12);
      this.player.stats.damage *= 1.3;
      this.pendingPlayerUpgrades += 1;
    }
    if (this.pendingPlayerUpgrades > 0 && !this.choicePaused) {
      this.openUpgradeSelection();
    }
  }

  private openUpgradeSelection(): void {
    const available = upgradePool.filter((upgrade) => (this.upgradeLevels.get(upgrade.id) ?? 0) < 5);
    const skillChoices = this.getSkillUpgradeChoices();
    const evolutionChoices = this.getAvailableEvolutionBranches().map((branch) => ({
      id: `evo:${branch.id}`,
      title: `进化：${branch.name}`,
      description: branch.description,
      apply: () => undefined,
    }));
    const optionPool = [...available, ...skillChoices, ...evolutionChoices];
    if (optionPool.length === 0) {
      this.pendingPlayerUpgrades = 0;
      return;
    }

    this.activeUpgradeChoices = Phaser.Utils.Array.Shuffle([...optionPool]).slice(0, 4).map((upgrade) => {
      const lv = this.upgradeLevels.get(upgrade.id) ?? 0;
      const fixedLabel = upgrade.id.startsWith("skill:") || upgrade.id.startsWith("evo:");
      return {
        ...upgrade,
        title: fixedLabel ? upgrade.title : `${upgrade.title} Lv.${lv + 1}/5`,
        description: fixedLabel ? upgrade.description : `${upgrade.description}（当前 ${lv}/5）`,
      };
    });
    this.choiceTimeoutAt = this.time.now + 9000;
    this.setChoicePaused(true);

    gameEvents.once("upgrade:selected", (choiceId: string) => this.applyPlayerUpgrade(choiceId));
    gameEvents.emit("upgrade:open", { choices: this.activeUpgradeChoices, rerollLeft: 0 });
  }

  private applyPlayerUpgrade(choiceId: string): void {
    if (choiceId.startsWith("evo:")) {
      const branchId = choiceId.slice(4);
      this.applyEvolutionBranch(branchId);
      this.activeUpgradeChoices = [];
      this.pendingPlayerUpgrades = Math.max(0, this.pendingPlayerUpgrades - 1);
      if (this.pendingPlayerUpgrades > 0) {
        this.openUpgradeSelection();
        return;
      }
      this.setChoicePaused(false);
      return;
    }

    if (choiceId.startsWith("skill:")) {
      this.applySkillChoice(choiceId);
      this.activeUpgradeChoices = [];
      this.pendingPlayerUpgrades = Math.max(0, this.pendingPlayerUpgrades - 1);
      if (this.pendingPlayerUpgrades > 0) {
        this.openUpgradeSelection();
        return;
      }
      this.setChoicePaused(false);
      return;
    }

    const selected = this.activeUpgradeChoices.find((item) => item.id === choiceId);
    if (selected !== undefined) {
      const current = this.upgradeLevels.get(choiceId) ?? 0;
      if (current < 5) {
        selected.apply(this.player.stats);
        this.upgradeLevels.set(choiceId, current + 1);
        this.spawnText(this.player.sprite.x, this.player.sprite.y - 30, selected.title, "#86efac", 14);
        if (choiceId === "max_ammo") {
          this.currentAmmo = Math.min(this.player.stats.maxAmmo, this.currentAmmo + 2);
        }
      }
    }
    this.activeUpgradeChoices = [];
    this.pendingPlayerUpgrades -= 1;
    if (this.pendingPlayerUpgrades > 0) {
      this.openUpgradeSelection();
      return;
    }
    this.setChoicePaused(false);
  }

  private getSkillUpgradeChoices(): UpgradeChoice[] {
    const choices: UpgradeChoice[] = [];
    const lockChoices: Array<{ kind: SkillKind; title: string; desc: string }> = [
      { kind: "flamethrower", title: "副武器：喷火器", desc: "每隔一段时间向周围喷火并附加燃烧。" },
      { kind: "lightning_bug", title: "副武器：闪电虫", desc: "射击可触发连锁电击，弹射附近目标。" },
      { kind: "poison_orb", title: "副武器：毒囊", desc: "射击有概率附加中毒并持续掉血。" },
      { kind: "frost_core", title: "副武器：寒霜核心", desc: "射击有概率触发冰冻减速效果。" },
    ];
    for (const item of lockChoices) {
      if (!this.skillUnlocked[item.kind]) {
        choices.push({
          id: `skill:unlock:${item.kind}`,
          title: item.title,
          description: item.desc,
          apply: () => undefined,
        });
      }
    }

    const pushNodeChoice = (kind: SkillKind, node: SkillNode, title: string, desc: string) => {
      if (!this.skillUnlocked[kind]) {
        return;
      }
      const lv = this.skillNodeLevels[kind][node];
      if (lv >= 5) {
        return;
      }
      choices.push({
        id: `skill:up:${kind}:${node}`,
        title: `${title} Lv.${lv + 1}/5`,
        description: `${desc}（当前 ${lv}/5）`,
        apply: () => undefined,
      });
    };

    pushNodeChoice("flamethrower", "a", "喷火器频率", "缩短喷火触发间隔。");
    pushNodeChoice("flamethrower", "b", "喷火器范围", "扩大喷火覆盖范围与伤害。");
    pushNodeChoice("lightning_bug", "a", "闪电触发", "提升闪电触发概率。");
    pushNodeChoice("lightning_bug", "b", "闪电弹射", "增加闪电连锁弹射数。");
    pushNodeChoice("poison_orb", "a", "毒伤强化", "提高中毒每跳伤害。");
    pushNodeChoice("poison_orb", "b", "毒性持续", "延长中毒持续时间。");
    pushNodeChoice("frost_core", "a", "冰冻触发", "提高冰冻触发概率。");
    pushNodeChoice("frost_core", "b", "冰冻强度", "提升冰冻减速与持续时间。");
    return choices;
  }

  private applySkillChoice(choiceId: string): void {
    const parts = choiceId.split(":");
    if (parts.length < 3) {
      return;
    }
    if (parts[1] === "unlock") {
      const kind = parts[2] as SkillKind;
      if (this.skillUnlocked[kind]) {
        return;
      }
      this.skillUnlocked[kind] = true;
      this.skillNodeLevels[kind].a = Math.max(1, this.skillNodeLevels[kind].a);
      this.recomputeElementBonuses();
      gameEvents.emit("ui:toast", { text: `已解锁 ${this.getSkillDisplayName(kind)}`, color: "#93c5fd" });
      return;
    }
    if (parts[1] === "up" && parts.length >= 4) {
      const kind = parts[2] as SkillKind;
      const node = parts[3] as SkillNode;
      if (!this.skillUnlocked[kind]) {
        return;
      }
      this.skillNodeLevels[kind][node] = Math.min(5, this.skillNodeLevels[kind][node] + 1);
      this.recomputeElementBonuses();
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 30, `${this.getSkillDisplayName(kind)}强化`, "#93c5fd", 13);
    }
  }

  private getSkillDisplayName(kind: SkillKind): string {
    if (kind === "flamethrower") {
      return "喷火器";
    }
    if (kind === "lightning_bug") {
      return "闪电虫";
    }
    if (kind === "poison_orb") {
      return "毒囊";
    }
    return "寒霜核心";
  }

  private recomputeElementBonuses(): void {
    this.elementBonuses = {
      burn: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
      poison: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
      freeze: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
      lightning: { procAdd: 0, durationAddMs: 0, powerMul: 1, chainCountAdd: 0 },
    };
    if (this.skillUnlocked.flamethrower) {
      this.elementBonuses.burn.procAdd += this.skillNodeLevels.flamethrower.a * 0.01;
      this.elementBonuses.burn.powerMul *= 1 + this.skillNodeLevels.flamethrower.b * 0.12;
      this.elementBonuses.burn.durationAddMs += this.skillNodeLevels.flamethrower.b * 120;
    }
    if (this.skillUnlocked.lightning_bug) {
      this.elementBonuses.lightning.procAdd += this.skillNodeLevels.lightning_bug.a * 0.018;
      this.elementBonuses.lightning.chainCountAdd += this.skillNodeLevels.lightning_bug.b;
      this.elementBonuses.lightning.powerMul *= 1 + this.skillNodeLevels.lightning_bug.a * 0.08;
    }
    if (this.skillUnlocked.poison_orb) {
      this.elementBonuses.poison.procAdd += this.skillNodeLevels.poison_orb.a * 0.02;
      this.elementBonuses.poison.powerMul *= 1 + this.skillNodeLevels.poison_orb.a * 0.1;
      this.elementBonuses.poison.durationAddMs += this.skillNodeLevels.poison_orb.b * 180;
    }
    if (this.skillUnlocked.frost_core) {
      this.elementBonuses.freeze.procAdd += this.skillNodeLevels.frost_core.a * 0.018;
      this.elementBonuses.freeze.powerMul *= 1 + this.skillNodeLevels.frost_core.b * 0.1;
      this.elementBonuses.freeze.durationAddMs += this.skillNodeLevels.frost_core.b * 120;
    }
  }

  private isElementEnabled(kind: ElementStatusKind): boolean {
    if (kind === "burn") {
      return this.skillUnlocked.flamethrower;
    }
    if (kind === "lightning") {
      return this.skillUnlocked.lightning_bug;
    }
    if (kind === "poison") {
      return this.skillUnlocked.poison_orb;
    }
    return this.skillUnlocked.frost_core;
  }

  private getEvolutionBranch(branchId: string): EvolutionBranch | undefined {
    const weaponConfig = getEvolutionConfigByWeaponId(this.currentWeaponId);
    return weaponConfig?.branches.find((item) => item.id === branchId);
  }

  private getAvailableEvolutionBranches(): EvolutionBranch[] {
    if (this.selectedEvolutionBranchId !== undefined) {
      return [];
    }
    const weaponConfig = getEvolutionConfigByWeaponId(this.currentWeaponId);
    if (weaponConfig === undefined) {
      return [];
    }
    return weaponConfig.branches.filter((branch) => this.isEvolutionBranchSatisfied(branch));
  }

  private isEvolutionBranchSatisfied(branch: EvolutionBranch): boolean {
    const statsReq = branch.requirements.statLevels ?? {};
    for (const [statKey, need] of Object.entries(statsReq)) {
      if (this.getUpgradeLevelByEvolutionStatKey(statKey) < need) {
        return false;
      }
    }
    const behaviorReq = branch.requirements.behavior ?? {};
    for (const [key, needRaw] of Object.entries(behaviorReq)) {
      const need = needRaw ?? 0;
      const current = this.evolutionBehaviorState[key as keyof EvolutionBehaviorRequirements] ?? 0;
      if (current < need) {
        return false;
      }
    }
    return true;
  }

  private getUpgradeLevelByEvolutionStatKey(key: string): number {
    const mapping: Record<string, string> = {
      projectile_count: "projectile_count",
      damage: "damage_up",
      fire_rate: "fire_rate",
      projectile_size: "projectile_size",
      projectile_speed: "projectile_speed",
      penetration: "penetration_up",
      crit_up: "crit_up",
      max_ammo: "max_ammo",
      reload_speed: "reload_speed",
      move_speed: "move_speed",
    };
    const upgradeId = mapping[key];
    if (upgradeId === undefined) {
      return 0;
    }
    return this.upgradeLevels.get(upgradeId) ?? 0;
  }

  private applyEvolutionBranch(branchId: string): void {
    if (this.selectedEvolutionBranchId !== undefined) {
      return;
    }
    const branch = this.getEvolutionBranch(branchId);
    if (branch === undefined) {
      return;
    }
    this.selectedEvolutionBranchId = branchId;
    this.evolutionBranchLevels.set(branchId, 1);
    this.player.stats.damage *= branch.effects.damageMul ?? 1;
    this.player.stats.projectileSize *= branch.effects.projectileSizeMul ?? 1;
    this.player.stats.projectileSpeed *= branch.effects.projectileSpeedMul ?? 1;
    this.player.stats.fireRate *= branch.effects.fireRateMul ?? 1;
    this.player.stats.critChance = Phaser.Math.Clamp(this.player.stats.critChance + (branch.effects.critChanceAdd ?? 0), 0, 1);
    this.player.stats.critMultiplier += branch.effects.critMultiplierAdd ?? 0;
    this.player.stats.projectilePenetration += branch.effects.penetrationAdd ?? 0;
    if (branch.effects.projectileCount !== undefined) {
      this.player.stats.projectileCount = Math.max(1, this.player.stats.projectileCount + branch.effects.projectileCount);
    }
    gameEvents.emit("ui:warning", { text: `武器进化：${branch.name}`, color: "#93c5fd" });
  }

  private spawnEnemy(kind: EnemyKind, variant?: EnemyVariant): void {
    const spawnAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const spawnDistance = Phaser.Math.Between(340, 560);
    const x = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(spawnAngle) * spawnDistance, 20, WORLD_SIZE - 20);
    const y = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(spawnAngle) * spawnDistance, 20, WORLD_SIZE - 20);
    const finalVariant = kind === "normal" && variant === undefined ? this.pickNormalVariantForProgress() : variant;
    const eliteAffixId = kind === "normal" ? this.getEliteAffixForSpawn() : undefined;
    const enemy = new Enemy(this, x, y, kind, finalVariant, eliteAffixId);
    if (kind !== "normal") {
      this.playBossSpawnEffect(enemy);
    }
    this.applyEnemyDifficulty(enemy);
    this.enemies.push(enemy);
    this.createEliteFx(enemy);
    if (kind === "miniBoss") {
      this.createMiniBossBar(enemy);
      this.enemyBossAi.set(enemy.id, {});
    } else if (kind === "mainBoss" || kind === "finalBoss") {
      this.enemyBossAi.set(enemy.id, {});
    }
  }

  private playBossSpawnEffect(enemy: Enemy): void {
    const ring = this.add.circle(enemy.sprite.x, enemy.sprite.y, enemy.sprite.radius + 8, 0xf97316, 0.18);
    ring.setStrokeStyle(3, 0xfca5a5, 0.9);
    const flash = this.add.circle(enemy.sprite.x, enemy.sprite.y, enemy.sprite.radius + 4, 0xffffff, 0.18);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 520,
      ease: "Cubic.Out",
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 220,
      ease: "Quad.Out",
      onComplete: () => flash.destroy(),
    });
    enemy.visual.setScale(0.78);
    this.tweens.add({
      targets: enemy.visual,
      scale: 1,
      duration: 260,
      ease: "Back.Out",
    });
    this.cameras.main.shake(90, 0.0018);
  }

  private applyEnemyDifficulty(enemy: Enemy): void {
    const elapsedSec = Math.floor((this.time.now - this.runStartedAt) / 1000);
    if (enemy.kind === "normal") {
      enemy.maxHealth = Math.floor(enemy.maxHealth * (1 + elapsedSec / 220));
      enemy.health = enemy.maxHealth;
      enemy.moveSpeed = Math.min(165, enemy.moveSpeed + elapsedSec * 0.07);
      enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 340));
      return;
    }
    if (enemy.kind === "miniBoss") {
      enemy.maxHealth = Math.floor(enemy.maxHealth * (1 + elapsedSec / 260));
      enemy.health = enemy.maxHealth;
      enemy.moveSpeed = Math.min(135, enemy.moveSpeed + elapsedSec * 0.04);
      enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 320));
      return;
    }
    if (enemy.kind === "mainBoss") {
      enemy.maxHealth = Math.floor(enemy.maxHealth * (1 + elapsedSec / 300));
      enemy.health = enemy.maxHealth;
      enemy.moveSpeed = Math.min(115, enemy.moveSpeed + elapsedSec * 0.03);
      enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 300));
      return;
    }
    enemy.maxHealth = Math.floor(enemy.maxHealth * (1 + elapsedSec / 260));
    enemy.health = enemy.maxHealth;
    enemy.moveSpeed = Math.min(130, enemy.moveSpeed + elapsedSec * 0.04);
    enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 240));
  }

  private cleanupDeadEnemies(): void {
    for (const enemy of this.enemies) {
      if (!enemy.isDead) {
        continue;
      }
      if (enemy.kind === "mainBoss") {
        this.mainBossDefeated += 1;
      }
      if (enemy.kind === "finalBoss" && !this.gameFinished) {
        this.gameFinished = true;
        this.gameStarted = false;
        this.setChoicePaused(true);
        gameEvents.emit("ui:showWin");
      }
      this.killCount += 1;
      this.evolutionBehaviorState.kill_count = this.killCount;
      this.applyKillPassives();

      const shouldDropExp = enemy.kind !== "normal" || Math.random() < 0.5;
      const orbCount = !shouldDropExp ? 0 : enemy.kind === "normal" ? 1 : enemy.kind === "miniBoss" ? 6 : enemy.kind === "mainBoss" ? 12 : 22;
      for (let i = 0; i < orbCount && this.orbs.length < MAX_ORBS; i += 1) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const distance = Phaser.Math.Between(8, 26);
        this.orbs.push(
          new ExperienceOrb(
            this,
            enemy.sprite.x + Math.cos(angle) * distance,
            enemy.sprite.y + Math.sin(angle) * distance,
            Math.round(enemy.expReward / orbCount),
          ),
        );
      }

      if (enemy.kind !== "normal") {
        const option = this.getRandomPassiveOption();
        if (option !== undefined) {
          const drop = new PassiveDrop(this, enemy.sprite.x, enemy.sprite.y, option.kind, option.title, option.description);
          this.passiveDrops.push(drop);
          this.spawnText(enemy.sprite.x, enemy.sprite.y - 34, "掉落被动道具", "#a7f3d0", 13);
        } else {
          this.addExperience(Math.round(enemy.expReward * 0.35));
          this.spawnText(enemy.sprite.x, enemy.sprite.y - 34, "道具池已满，转化经验", "#93c5fd", 13);
        }
      }

      if (enemy.kind !== "normal") {
        this.spawnText(enemy.sprite.x, enemy.sprite.y - 20, `${enemy.displayName} 击败`, "#f0abfc", 18);
      }
      this.cameras.main.shake(enemy.kind === "normal" ? 70 : 120, enemy.kind === "normal" ? 0.0012 : 0.0023);
      this.destroyMiniBossBar(enemy.id);
      this.destroyEliteFx(enemy.id);
      this.enemyBossAi.delete(enemy.id);
      this.enemyStatus.delete(enemy.id);
      enemy.destroy();
    }
    this.enemies = this.enemies.filter((enemy) => !enemy.isDead);
  }

  private getNormalSpawnCount(): number {
    const elapsedSec = Math.floor((this.time.now - this.runStartedAt) / 1000);
    return getNormalSpawnCount(elapsedSec);
  }

  private getDynamicEnemyCap(): number {
    const elapsedSec = Math.floor((this.time.now - this.runStartedAt) / 1000);
    return getDynamicEnemyCap(elapsedSec);
  }

  private pickNormalVariantForProgress(): EnemyVariant {
    // Stage 1: before first main boss -> only base trash mob.
    if (this.mainBossDefeated <= 0) {
      return "grunt";
    }

    // Stage 2: after first main boss -> two mob types, 5:5.
    if (this.mainBossDefeated === 1) {
      return Phaser.Math.FloatBetween(0, 1) < 0.5 ? "grunt" : "runner";
    }

    // Stage 3: after second main boss -> three mob types, 3:3:4.
    const roll = Phaser.Math.FloatBetween(0, 1);
    if (roll < 0.3) {
      return "grunt";
    }
    if (roll < 0.6) {
      return "runner";
    }
    return "spitter";
  }

  private getEliteAffixForSpawn(): EliteAffixId | undefined {
    const elapsedSec = Math.floor((this.time.now - this.runStartedAt) / 1000);
    const chance = Phaser.Math.Clamp(0.012 + elapsedSec * 0.00085, 0.012, 0.13);
    if (Math.random() >= chance) {
      return undefined;
    }
    return getRandomEliteAffix();
  }

  private getPassiveOptionByKind(kind: PassiveDropKind): PassiveOption {
    return getPassiveOptionByKind(this.passiveLevels, kind);
  }

  private applyPassiveDrop(kind: PassiveDropKind): number {
    const level = applyPassiveDrop(this.passive, this.passiveLevels, kind, this.time.now);
    this.refreshPassiveDetails();
    return level;
  }

  private refreshPassiveDetails(): void {
    this.passive.details = buildPassiveDetails(this.passive, this.passiveLevels);
  }

  private applyKillPassives(): void {
    if (Math.random() < this.passive.ammoRefundOnKillChance) {
      this.currentAmmo = Math.min(this.player.stats.maxAmmo, this.currentAmmo + 1);
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 32, "返还子弹 +1", "#93c5fd", 12);
    }
    if (Math.random() < this.passive.healOnKillChance) {
      const heal = 1;
      this.player.stats.health = Math.min(this.player.stats.maxHealth, this.player.stats.health + heal);
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 46, `回血 +${heal}`, "#86efac", 12);
    }
  }

  private updatePassiveInvincible(now: number): void {
    if (this.passive.invincibleEveryMs <= 0 || this.player.isDead) {
      this.player.visual.setAlpha(1);
      return;
    }
    if (now >= this.passive.nextInvincibleAt && now >= this.passive.invincibleUntil) {
      this.passive.invincibleUntil = now + this.passive.invincibleDurationMs;
      this.passive.nextInvincibleAt = now + this.passive.invincibleEveryMs;
      gameEvents.emit("ui:toast", { text: "相位时钟触发：短暂无敌", color: "#93c5fd" });
    }
    this.player.visual.setAlpha(now < this.passive.invincibleUntil ? 0.68 : 1);
  }

  private updateEmergencyShield(now: number): void {
    if (this.passive.emergencyShieldCooldownMs <= 0 || this.player.isDead) {
      return;
    }
    if (this.passive.emergencyShieldCharges >= this.passive.emergencyShieldMaxCharges) {
      return;
    }
    if (now < this.passive.emergencyShieldNextAt) {
      return;
    }
    this.passive.emergencyShieldCharges = Math.min(this.passive.emergencyShieldMaxCharges, this.passive.emergencyShieldCharges + 1);
    this.passive.emergencyShieldNextAt = now + this.passive.emergencyShieldCooldownMs;
    this.refreshPassiveDetails();
    this.spawnText(this.player.sprite.x, this.player.sprite.y - 44, "护盾充能", "#fde68a", 12);
  }

  private updateThreatSensor(): void {
    if (this.passive.threatSenseRadius <= 0 || this.player.isDead) {
      if (this.passive.threatSenseActive) {
        this.passive.threatSenseActive = false;
        this.refreshPassiveDetails();
      }
      return;
    }
    let active = false;
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        continue;
      }
      const isThreat = enemy.kind !== "normal" || enemy.isElite;
      if (!isThreat) {
        continue;
      }
      const dist = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (dist <= this.passive.threatSenseRadius) {
        active = true;
        break;
      }
    }
    if (active !== this.passive.threatSenseActive) {
      this.passive.threatSenseActive = active;
      this.refreshPassiveDetails();
    }
  }

  private updateReloadState(now: number): void {
    if (!this.isReloading || now < this.reloadEndsAt) {
      return;
    }
    this.isReloading = false;
    this.currentAmmo = this.player.stats.maxAmmo;
    gameEvents.emit("ui:toast", { text: "换弹完成", color: "#bfdbfe" });
  }

  private startReload(reason: string): void {
    if (this.isReloading || this.player.isDead) {
      return;
    }
    this.isReloading = true;
    const threatReloadMul = this.passive.threatSenseActive ? this.passive.threatSenseReloadMultiplier : 1;
    this.reloadEndsAt = this.time.now + this.player.stats.reloadMs * this.passive.reloadTimeMultiplier * threatReloadMul;
    gameEvents.emit("ui:toast", { text: reason, color: "#fcd34d" });
  }

  private cleanupBullets(now: number): void {
    for (const bullet of this.bullets) {
      if (!bullet.sprite.active) {
        continue;
      }
      const outOfWorld =
        bullet.sprite.x < -40 ||
        bullet.sprite.y < -40 ||
        bullet.sprite.x > WORLD_SIZE + 40 ||
        bullet.sprite.y > WORLD_SIZE + 40;
      if (outOfWorld || now - bullet.spawnAt > 2400) {
        bullet.sprite.destroy();
      }
    }
    this.bullets = this.bullets.filter((bullet) => bullet.sprite.active);
  }

  private syncHud(): void {
    const aliveBosses = this.enemies.filter((enemy) => enemy.kind !== "normal" && !enemy.isDead).length;
    const elapsedSec = Math.floor((this.time.now - this.runStartedAt) / 1000);
    const globalBoss =
      this.enemies.find((enemy) => enemy.kind === "finalBoss" && !enemy.isDead) ??
      this.enemies.find((enemy) => enemy.kind === "mainBoss" && !enemy.isDead);
    const reloadRatio = this.isReloading
      ? Phaser.Math.Clamp((this.reloadEndsAt - this.time.now) / this.player.stats.reloadMs, 0, 1)
      : 0;

    gameEvents.emit("hud:update", {
      health: this.player.stats.health,
      maxHealth: this.player.stats.maxHealth,
      level: this.player.level,
      exp: this.player.exp,
      expToNext: this.player.expToNext,
      enemyCount: this.enemies.length,
      bullets: this.bullets.length,
      kills: this.killCount,
      aliveBosses,
      elapsedSec,
      nextMini: this.getNextBossCountdown("miniBoss"),
      nextMain: this.getNextBossCountdown("mainBoss"),
      ammo: this.currentAmmo,
      maxAmmo: this.player.stats.maxAmmo,
      reloading: this.isReloading,
      reloadRatio,
      passiveDetails: this.passive.details,
      invincibleLeftMs: Math.max(0, this.passive.invincibleUntil - this.time.now),
      rerollLeft: 0,
      passiveDropCount: this.passiveDrops.length,
      bossName: globalBoss?.displayName ?? "",
      bossHealth: globalBoss?.health ?? 0,
      bossMaxHealth: globalBoss?.maxHealth ?? 0,
    });
  }

  private getNextBossCountdown(kind: "miniBoss" | "mainBoss"): number {
    const elapsed = Math.floor((this.time.now - this.runStartedAt) / 1000);
    const next = this.bossSequence.find((step, idx) => idx >= this.bossStepIndex && step.kind === kind);
    if (next === undefined) {
      return 0;
    }
    return Math.max(0, next.delaySec - elapsed);
  }

  private canDamage(sourceId: string, targetId: string, now: number, cooldownMs: number): boolean {
    const key = `${sourceId}->${targetId}`;
    const next = this.hitCooldowns.get(key) ?? 0;
    if (now < next) {
      return false;
    }
    this.hitCooldowns.set(key, now + cooldownMs);
    return true;
  }

  private cleanupCooldowns(now: number): void {
    for (const [key, value] of this.hitCooldowns) {
      if (value < now - 2000) {
        this.hitCooldowns.delete(key);
      }
    }
  }

  private findNearestEnemy(x: number, y: number): Enemy | undefined {
    let nearest: Enemy | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        continue;
      }
      const dist = Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y);
      if (dist < bestDistance) {
        bestDistance = dist;
        nearest = enemy;
      }
    }
    return nearest;
  }

  private createPlayerBar(): void {
    // Player HP is shown in fixed HUD; hide floating world bar to avoid motion jitter.
    this.playerBar = undefined;
  }

  private createMiniBossBar(enemy: Enemy): void {
    const width = 56;
    const ex = Math.round(enemy.sprite.x);
    const ey = Math.round(enemy.sprite.y);
    const bg = this.add.rectangle(ex - width / 2, ey - enemy.sprite.radius - 12, width, 5, 0x0b1220, 0.85).setOrigin(0, 0.5);
    const fill = this.add.rectangle(ex - (width - 2) / 2, ey - enemy.sprite.radius - 12, width - 2, 3, 0xfbbf24, 1).setOrigin(0, 0.5);
    this.enemyBars.set(enemy.id, { bg, fill });
  }

  private destroyMiniBossBar(enemyId: number): void {
    const parts = this.enemyBars.get(enemyId);
    if (parts === undefined) {
      return;
    }
    parts.bg.destroy();
    parts.fill.destroy();
    this.enemyBars.delete(enemyId);
  }

  private createEliteFx(enemy: Enemy): void {
    if (!enemy.isElite || enemy.eliteAffixId === undefined) {
      return;
    }
    const colorByAffix: Record<EliteAffixId, number> = {
      shield: 0x93c5fd,
      berserk: 0xfb7185,
      summoner: 0xc4b5fd,
      sniper: 0xfbbf24,
    };
    const markByAffix: Record<EliteAffixId, string> = {
      shield: "盾",
      berserk: "狂",
      summoner: "召",
      sniper: "狙",
    };
    const color = colorByAffix[enemy.eliteAffixId];
    const aura = this.add
      .circle(enemy.sprite.x, enemy.sprite.y, enemy.sprite.radius + 7, color, 0.14)
      .setStrokeStyle(2, color, 0.85)
      .setDepth(11);
    const mark = this.add
      .text(enemy.sprite.x, enemy.sprite.y - enemy.sprite.radius - 18, markByAffix[enemy.eliteAffixId], {
        color: "#f8fafc",
        fontFamily: "Segoe UI",
        fontSize: "12px",
        fontStyle: "bold",
        stroke: "#020617",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(13);
    this.enemyEliteFx.set(enemy.id, { aura, mark });
  }

  private destroyEliteFx(enemyId: number): void {
    const fx = this.enemyEliteFx.get(enemyId);
    if (fx === undefined) {
      return;
    }
    fx.aura.destroy();
    fx.mark.destroy();
    this.enemyEliteFx.delete(enemyId);
  }

  private updateEliteFx(now: number): void {
    for (const enemy of this.enemies) {
      const fx = this.enemyEliteFx.get(enemy.id);
      if (fx === undefined) {
        continue;
      }
      if (enemy.isDead) {
        fx.aura.setVisible(false);
        fx.mark.setVisible(false);
        continue;
      }
      fx.aura.setPosition(enemy.sprite.x, enemy.sprite.y);
      fx.mark.setPosition(enemy.sprite.x, enemy.sprite.y - enemy.sprite.radius - 18);
      const pulse = 0.11 + Math.abs(Math.sin((now + enemy.id * 37) * 0.01)) * 0.1;
      fx.aura.setAlpha(pulse);
    }
  }

  private updateHealthBars(): void {
    if (this.playerBar !== undefined) {
      if (!this.player.isDead) {
        const ratio = Phaser.Math.Clamp(this.player.stats.health / this.player.stats.maxHealth, 0, 1);
        const px = Math.round(this.player.sprite.x);
        const py = Math.round(this.player.sprite.y);
        this.playerBar.bg.setPosition(px - 20, py - 30);
        this.playerBar.fill.setPosition(px - 19, py - 30);
        this.playerBar.fill.width = 38 * ratio;
      } else {
        this.playerBar.bg.setVisible(false);
        this.playerBar.fill.setVisible(false);
      }
    }

    for (const enemy of this.enemies) {
      const bar = this.enemyBars.get(enemy.id);
      if (bar === undefined) {
        continue;
      }
      const visible = !enemy.isDead;
      bar.bg.setVisible(visible);
      bar.fill.setVisible(visible);
      if (!visible) {
        continue;
      }
      const width = 56;
      const ratio = Phaser.Math.Clamp(enemy.health / enemy.maxHealth, 0, 1);
      const ex = Math.round(enemy.sprite.x);
      const ey = Math.round(enemy.sprite.y);
      bar.bg.setPosition(ex - width / 2, ey - enemy.sprite.radius - 12);
      bar.fill.setPosition(ex - (width - 2) / 2, ey - enemy.sprite.radius - 12);
      bar.fill.width = (width - 2) * ratio;
    }
  }

  private flashHit(
    target: Phaser.GameObjects.Text | Phaser.GameObjects.Image,
    durationMs: number,
    restoreTint?: number,
  ): void {
    target.setTint(0xffffff);
    this.time.delayedCall(durationMs, () => {
      if (target.active) {
        if (restoreTint === undefined) {
          target.clearTint();
        } else {
          target.setTint(restoreTint);
        }
      }
    });
  }

  private spawnDamageText(x: number, y: number, value: number, color: string): void {
    this.spawnText(x, y, `-${Math.ceil(value)}`, color, 14);
  }

  private spawnText(x: number, y: number, text: string, color: string, size: number): void {
    const label = this.add.text(x, y, text, {
      color,
      fontFamily: "Consolas",
      fontSize: `${size}px`,
      stroke: "#020617",
      strokeThickness: 3,
    });
    label.setOrigin(0.5);
    this.tweens.add({
      targets: label,
      y: y - 24,
      alpha: 0,
      duration: 420,
      ease: "Quad.Out",
      onComplete: () => {
        label.destroy();
      },
    });
  }
}
