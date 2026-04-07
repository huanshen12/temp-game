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
import { ItemDrop, type ItemDropKind } from "../entities/ItemDrop";
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

interface BossSlowZone {
  id: number;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  expiresAt: number;
  slowMul: number;
}

interface FinalPylon {
  id: number;
  sprite: Phaser.GameObjects.Rectangle;
  hp: number;
  maxHp: number;
}

interface MainASpotlight {
  id: number;
  ownerBossId: number;
  circle: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  mode: "roam" | "orbit";
  radius: number;
  vx: number;
  vy: number;
  angle: number;
  orbitRadius: number;
  orbitAngularSpeed: number;
  centerX: number;
  centerY: number;
  nextWanderAt: number;
}

interface BossGuideMarker {
  arrow: Phaser.GameObjects.Triangle;
  label: Phaser.GameObjects.Text;
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
  nextCrossAt?: number;
  crossAngleDeg?: number;
  dashEmitOnEnd?: boolean;
  enraged?: boolean;
  roamTargetX?: number;
  roamTargetY?: number;
  roamSpeed?: number;
  gravityForce?: number;
  edgeLockdownDone?: boolean;
  dashSpeedMul?: number;
  dashDurationMs?: number;
  miniFLandAction?: "meteor" | "sector";
  miniFSectorDelayMs?: number;
  miniFSectorRadius?: number;
  miniFSectorSpreadRad?: number;
  comboActive?: boolean;
  miniFComboStep?: number;
  nextComboDashAt?: number;
  miniBAimAt?: number;
  miniBWaveUntil?: number;
  finalLives?: number;
  finalPhase?: 1 | 2 | 3 | 4 | 5;
  phase4Triggered?: boolean;
  finalTimeStopUntil?: number;
  finalProjectilesFrozen?: boolean;
  finalWindSlowUntil?: number;
  finalNextDashAt?: number;
  finalNextRainAt?: number;
  finalNextBlinkAt?: number;
  finalNextTimeStopAt?: number;
  finalNextMobWaveAt?: number;
  finalNextStompAt?: number;
  finalInvulnerable?: boolean;
  finalLockX?: number;
  finalLockY?: number;
  miniEAnchorX?: number;
  miniEAnchorY?: number;
  miniENextAnchorAt?: number;
  miniEOrbitAngle?: number;
  miniEOrbitDir?: -1 | 1;
  miniEOrbitRadius?: number;
  mainAClockStep?: number;
  mainAClockNextAt?: number;
  mainAClockBaseAngle?: number;
  mainASweepUntil?: number;
  mainASweepNextAt?: number;
  mainASweepAngle?: number;
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
  flameTicksLeft: number;
  flameTickDamage: number;
  flameNextTickAt: number;
  poisonUntil: number;
  poisonNextTickAt: number;
  poisonStacks: number;
  poisonPower: number;
  freezeUntil: number;
  freezeSlow: number;
  hitSlowUntil: number;
  hitSlowFactor: number;
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
  private dashKey!: Phaser.Input.Keyboard.Key;
  private player!: PlayerActor;
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private bossHazards: BossHazardZone[] = [];
  private bossHazardId = 0;
  private bossSlowZones: BossSlowZone[] = [];
  private bossSlowZoneId = 0;
  private finalPylons: FinalPylon[] = [];
  private finalPylonId = 0;
  private mainASpotlights: MainASpotlight[] = [];
  private mainASpotlightId = 0;
  private bossGuideMarkers = new Map<number, BossGuideMarker>();
  private bossTelegraphRegistry = new Map<number, Set<Phaser.GameObjects.GameObject>>();
  private lastDarkZonePunishAt = 0;
  private orbs: ExperienceOrb[] = [];
  private itemDrops: ItemDrop[] = [];
  private passiveDrops: PassiveDrop[] = [];
  private choicePaused = false;
  private manualPaused = false;
  private pendingPlayerUpgrades = 0;
  private activeUpgradeChoices: UpgradeChoice[] = [];
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
  private recentUpgradeIds: string[] = [];
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
  private reviveUsed = false;
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
  private bgm?: Phaser.Sound.BaseSound;
  private lastShootSfxAt = 0;
  private lastEnemyHitSfxAt = 0;
  private lastLightningSfxAt = 0;
  private audioUnlocked = false;
  private bgmVolume = 0.16;
  private sfxVolume = 1;
  private characterExtraShotChance = 0.2;
  private magnetActiveUntil = 0;
  private projectileKnockbackMul = 1;
  private devModeEnabled = false;
  private devAutoSpawnEnabled = true;
  private devGodMode = false;
  private devOneHitKill = false;
  private miniCActiveMobs: Enemy[] = [];
  private lastMoveDirX = 1;
  private lastMoveDirY = 0;
  private dashCharges = 2;
  private readonly dashMaxCharges = 2;
  private readonly dashRechargeMs = 8000;
  private readonly dashDistance = 200;
  private readonly dashInvincibleMs = 220;
  private nextDashChargeAt = 0;
  private dashInProgress = false;
  private playerControlLockUntil = 0;
  private playerControlLockX = 0;
  private playerControlLockY = 0;
  private miniFTimeStopUntil = 0;
  private miniFProjectilesFrozen = false;

  public constructor() {
    super("GameScene");
  }

  public preload(): void {
    this.load.audio("bgm_loop", ["audio/bgm_loop.ogg", "audio/bgm_loop.wav"]);
    this.load.audio("sfx_shoot", ["audio/sfx_shoot.ogg", "audio/sfx_shoot.wav"]);
    this.load.audio("sfx_hit", ["audio/sfx_hit.ogg", "audio/sfx_hit.wav"]);
    this.load.audio("sfx_lightning", [
      "audio/111.wav",
      "audio/lighting_hit.mp3",
      "audio/lighting_hit.ogg",
      "audio/lighting_hit.wav",
      "audio/lightning_hit.ogg",
      "audio/lightning_hit.wav",
    ]);
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
    this.dashKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
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
      this.ensureAudioUnlocked();
      this.startBgmIfNeeded();
      gameEvents.emit("ui:toast", { text: "战斗开始", color: "#93c5fd" });
    });
    gameEvents.on("game:reviveByCode", () => this.tryReviveByCode());
    gameEvents.on("audio:set", ({ bgm, sfx }: { bgm?: number; sfx?: number }) => this.setAudioLevels(bgm, sfx));
    gameEvents.on("game:manualPause", (paused: boolean) => this.setManualPaused(paused));
    gameEvents.on("dev:activate", () => this.activateDevMode());
    gameEvents.on("dev:setAutoSpawn", (enabled: boolean) => {
      this.devAutoSpawnEnabled = enabled;
      gameEvents.emit("dev:state", { autoSpawn: this.devAutoSpawnEnabled, godMode: this.devGodMode, oneHitKill: this.devOneHitKill });
    });
    gameEvents.on("dev:spawnNormals", (count: number) => this.devSpawnNormals(count));
    gameEvents.on("dev:clearAllEnemies", () => this.devClearAllEnemies());
    gameEvents.on("dev:spawnBoss", (variant: EnemyVariant) => this.devSpawnBoss(variant));
    gameEvents.on("dev:healFull", () => this.devHealFull());
    gameEvents.on("dev:toggleGodMode", () => this.devToggleGodMode());
    gameEvents.on("dev:toggleOneHitKill", () => this.devToggleOneHitKill());
    gameEvents.on("dev:setUpgradeLevel", ({ upgradeId, level }: { upgradeId: string; level: number }) =>
      this.devSetUpgradeLevel(upgradeId, level),
    );
    gameEvents.on("dev:adjustUpgradeLevel", ({ upgradeId, delta }: { upgradeId: string; delta: number }) =>
      this.devAdjustUpgradeLevel(upgradeId, delta),
    );
    gameEvents.on("dev:requestUpgradeLevels", () => this.emitDevUpgradeLevels());
    gameEvents.on("dev:requestSkillState", () => this.emitDevSkillState());
    gameEvents.on("dev:setSkillUnlock", ({ kind, enabled }: { kind: SkillKind; enabled: boolean }) =>
      this.devSetSkillUnlock(kind, enabled),
    );
    gameEvents.on("dev:adjustSkillNode", ({ kind, node, delta }: { kind: SkillKind; node: SkillNode; delta: number }) =>
      this.devAdjustSkillNode(kind, node, delta),
    );
    this.time.delayedCall(0, () => {
      gameEvents.emit("ui:showStart");
      gameEvents.emit("audio:state", { bgm: this.bgmVolume, sfx: this.sfxVolume });
      gameEvents.emit("dev:state", { autoSpawn: this.devAutoSpawnEnabled, godMode: this.devGodMode, oneHitKill: this.devOneHitKill });
    });

    this.time.addEvent({
      delay: ENEMY_SPAWN_INTERVAL_MS,
      loop: true,
      callback: () => {
        const cap = this.getDynamicEnemyCap();
        if (
          !this.devAutoSpawnEnabled ||
          this.choicePaused ||
          this.manualPaused ||
          this.player.isDead ||
          this.enemies.length >= cap ||
          this.hasMainBossOnField()
        ) {
          return;
        }
        const spawnCount = this.getNormalSpawnCount();
        for (let i = 0; i < spawnCount && this.enemies.length < cap; i += 1) {
          this.spawnEnemy("normal");
        }
      },
    });

    this.input.once("pointerdown", () => {
      this.ensureAudioUnlocked();
      if (this.gameStarted) {
        this.startBgmIfNeeded();
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bgm?.stop();
      this.bgm?.destroy();
      this.bgm = undefined;
    });
  }

  public update(time: number): void {
    if (this.miniFProjectilesFrozen && time >= this.miniFTimeStopUntil) {
      this.unfreezeEnemyProjectiles();
      this.miniFProjectilesFrozen = false;
    }
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
    this.updateMagnetAttraction(time);
    this.updateMainASpotlights(time);
    this.updateBossSlowZones(time);
    this.updateDashRecharge(time);
    this.updateBossGuides();

    if (!this.gameStarted) {
      this.syncHud();
      this.stabilizeCamera();
      return;
    }

    if (this.choicePaused || this.manualPaused) {
      this.syncHud();
      this.stabilizeCamera();
      return;
    }

    if (this.player.isDead) {
      this.syncHud();
      this.stabilizeCamera();
      return;
    }

    this.enforcePlayerControlLock(time);
    this.updatePlayerInput();
    this.applyMainBGravityField();
    this.processBossSequence(time);
    this.updateEnemies(time);
    this.updateEnemyProjectiles(time);
    this.updateBossHazards(time);
    this.updateDarkZonePunish(time);
    this.autoFire(time);
    this.resolveBulletHits();
    this.resolveEnemyContact(time);
    this.resolveEnemyProjectileHit(time);
    this.collectOrbs();
    this.collectItemDrops();
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
    this.updatePauseState();
  }

  private setManualPaused(paused: boolean): void {
    this.manualPaused = paused;
    this.updatePauseState();
  }

  private updatePauseState(): void {
    const paused = this.choicePaused || this.manualPaused;
    if (paused) {
      this.player.setVelocity(0, 0);
      this.physics.world.pause();
      this.time.timeScale = 0;
      this.tweens.pauseAll();
      return;
    }
    this.physics.world.resume();
    this.time.timeScale = 1;
    this.tweens.resumeAll();
  }

  private updateBossGuides(): void {
    const camera = this.cameras.main;
    const view = camera.worldView;
    const screenW = this.scale.width;
    const screenH = this.scale.height;
    const margin = 38;
    const activeBossIds = new Set<number>();
    for (const enemy of this.enemies) {
      if (enemy.isDead || enemy.kind === "normal") {
        continue;
      }
      activeBossIds.add(enemy.id);
      const wx = enemy.sprite.x;
      const wy = enemy.sprite.y;
      const inView = wx >= view.x && wx <= view.right && wy >= view.y && wy <= view.bottom;
      const marker = this.bossGuideMarkers.get(enemy.id);
      if (inView) {
        if (marker !== undefined) {
          marker.arrow.setVisible(false);
          marker.label.setVisible(false);
        }
        continue;
      }

      const sx = wx - view.x;
      const sy = wy - view.y;
      const cx = screenW * 0.5;
      const cy = screenH * 0.5;
      const dx = sx - cx;
      const dy = sy - cy;
      const angle = Math.atan2(dy, dx);
      const maxX = screenW * 0.5 - margin;
      const maxY = screenH * 0.5 - margin;
      const tx = Math.abs(dx) <= 0.001 ? Number.POSITIVE_INFINITY : maxX / Math.abs(dx);
      const ty = Math.abs(dy) <= 0.001 ? Number.POSITIVE_INFINITY : maxY / Math.abs(dy);
      const t = Math.min(tx, ty);
      const px = Phaser.Math.Clamp(cx + dx * t, margin, screenW - margin);
      const py = Phaser.Math.Clamp(cy + dy * t, margin, screenH - margin);
      const dist = Math.floor(Phaser.Math.Distance.Between(wx, wy, this.player.sprite.x, this.player.sprite.y));
      const title = enemy.kind === "finalBoss" ? "终极Boss" : enemy.kind === "mainBoss" ? "大Boss" : "小Boss";

      let nextMarker = marker;
      if (nextMarker === undefined) {
        const arrow = this.add
          .triangle(0, 0, -9, -7, 12, 0, -9, 7, 0xfda4af, 0.95)
          .setStrokeStyle(1, 0xfee2e2, 0.95)
          .setDepth(1300)
          .setScrollFactor(0);
        const label = this.add
          .text(0, 0, "", {
            color: "#fee2e2",
            fontFamily: "Segoe UI",
            fontSize: "12px",
            fontStyle: "bold",
            stroke: "#020617",
            strokeThickness: 3,
          })
          .setOrigin(0.5)
          .setDepth(1301)
          .setScrollFactor(0);
        nextMarker = { arrow, label };
        this.bossGuideMarkers.set(enemy.id, nextMarker);
      }
      nextMarker.arrow.setVisible(true).setPosition(px, py).setRotation(angle);
      nextMarker.label.setVisible(true).setPosition(px, py - 18).setText(`${title} ${dist}`);
    }

    for (const [id, marker] of this.bossGuideMarkers) {
      if (activeBossIds.has(id)) {
        continue;
      }
      marker.arrow.destroy();
      marker.label.destroy();
      this.bossGuideMarkers.delete(id);
    }
  }

  private registerBossTelegraph(ownerId: number, ...objects: Phaser.GameObjects.GameObject[]): void {
    let bucket = this.bossTelegraphRegistry.get(ownerId);
    if (bucket === undefined) {
      bucket = new Set<Phaser.GameObjects.GameObject>();
      this.bossTelegraphRegistry.set(ownerId, bucket);
    }
    for (const obj of objects) {
      if (obj.active) {
        bucket.add(obj);
      }
    }
  }

  private clearBossTelegraphs(ownerId: number): void {
    const bucket = this.bossTelegraphRegistry.get(ownerId);
    if (bucket === undefined) {
      return;
    }
    for (const obj of bucket) {
      if (obj.active) {
        obj.destroy();
      }
    }
    this.bossTelegraphRegistry.delete(ownerId);
  }

  private updatePlayerInput(): void {
    if (this.time.now < this.playerControlLockUntil) {
      this.player.setVelocity(0, 0);
      return;
    }
    if (this.time.now < this.miniFTimeStopUntil) {
      this.player.setVelocity(0, 0);
      return;
    }
    let vx = 0;
    let vy = 0;
    const speed = this.player.stats.moveSpeed * this.getCurrentMoveMultiplier(this.time.now);
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
    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      if (len > 0.001) {
        this.lastMoveDirX = vx / len;
        this.lastMoveDirY = vy / len;
      }
    }
    if (!this.dashInProgress) {
      this.player.setVelocity(vx, vy);
    }
    if (Phaser.Input.Keyboard.JustDown(this.reloadKey)) {
      this.startReload("手动换弹");
    }
    if (Phaser.Input.Keyboard.JustDown(this.dashKey)) {
      this.tryUseDash(this.time.now);
    }
  }

  private enforcePlayerControlLock(now: number): void {
    if (now >= this.playerControlLockUntil) {
      return;
    }
    this.player.sprite.setPosition(this.playerControlLockX, this.playerControlLockY);
    this.player.syncVisual();
    this.player.setVelocity(0, 0);
  }

  private tryUseDash(now: number): void {
    if (!this.gameStarted || this.player.isDead || this.choicePaused || this.manualPaused || this.dashCharges <= 0 || this.dashInProgress) {
      return;
    }
    const len = Math.hypot(this.lastMoveDirX, this.lastMoveDirY);
    const dirX = len > 0.001 ? this.lastMoveDirX / len : 1;
    const dirY = len > 0.001 ? this.lastMoveDirY / len : 0;
    const sx = this.player.sprite.x;
    const sy = this.player.sprite.y;
    const nx = Phaser.Math.Clamp(sx + dirX * this.dashDistance, 20, WORLD_SIZE - 20);
    const ny = Phaser.Math.Clamp(sy + dirY * this.dashDistance, 20, WORLD_SIZE - 20);
    this.player.setVelocity(0, 0);
    this.dashInProgress = true;
    this.passive.invincibleUntil = Math.max(this.passive.invincibleUntil, now + this.dashInvincibleMs);
    this.tweens.add({
      targets: this.player.sprite,
      x: nx,
      y: ny,
      duration: 90,
      ease: "Cubic.Out",
      onUpdate: () => this.player.syncVisual(),
      onComplete: () => {
        this.dashInProgress = false;
        this.player.syncVisual();
      },
    });
    const trail = this.add.line(0, 0, sx, sy, nx, ny, 0x67e8f9, 0.34).setOrigin(0, 0).setDepth(17);
    trail.setLineWidth(3, 1.5);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: 110,
      ease: "Quad.Out",
      onComplete: () => trail.destroy(),
    });
    this.dashCharges -= 1;
    if (this.dashCharges < this.dashMaxCharges && this.nextDashChargeAt <= 0) {
      this.nextDashChargeAt = now + this.dashRechargeMs;
    }
    const fx = this.add.circle(nx, ny, 16, 0x67e8f9, 0.24).setDepth(18);
    this.tweens.add({
      targets: fx,
      alpha: 0,
      scale: 2.1,
      duration: 180,
      ease: "Quad.Out",
      onComplete: () => fx.destroy(),
    });
  }

  private updateDashRecharge(now: number): void {
    if (this.dashCharges >= this.dashMaxCharges) {
      this.nextDashChargeAt = 0;
      return;
    }
    if (this.nextDashChargeAt <= 0) {
      this.nextDashChargeAt = now + this.dashRechargeMs;
      return;
    }
    if (now < this.nextDashChargeAt) {
      return;
    }
    this.dashCharges = Math.min(this.dashMaxCharges, this.dashCharges + 1);
    if (this.dashCharges < this.dashMaxCharges) {
      this.nextDashChargeAt = now + this.dashRechargeMs;
    } else {
      this.nextDashChargeAt = 0;
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
    if (this.devModeEnabled) {
      return;
    }
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
      if (enemy.variant === "mainB") {
        const centerX = WORLD_SIZE / 2;
        const centerY = WORLD_SIZE / 2;
        enemy.sprite.setPosition(centerX, centerY);
        const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0, 0);
        enemy.syncVisual();
        continue;
      }
      if (enemy.variant === "mainA" && ai?.enraged && ai?.roamTargetX !== undefined && ai?.roamTargetY !== undefined) {
        const roamSpeed = ai.roamSpeed ?? enemy.moveSpeed;
        this.physics.moveTo(enemy.sprite, ai.roamTargetX, ai.roamTargetY, roamSpeed);
        enemy.syncVisual();
        continue;
      }
      if (ai?.dashUntil !== undefined && now < ai.dashUntil) {
        const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
        if (ai.dashVx === undefined || ai.dashVy === undefined) {
          body.setVelocity(0, 0);
        }
        if (ai.dashVx !== undefined && ai.dashVy !== undefined) {
          body.setVelocity(ai.dashVx, ai.dashVy);
        }
        enemy.syncVisual();
        continue;
      }
      if (enemy.kind === "finalBoss" && ai?.roamTargetX !== undefined && ai?.roamTargetY !== undefined) {
        const roamSpeed = ai.roamSpeed ?? enemy.moveSpeed;
        this.physics.moveTo(enemy.sprite, ai.roamTargetX, ai.roamTargetY, roamSpeed);
        enemy.syncVisual();
        continue;
      }
      if (enemy.variant === "miniE" && ai?.roamTargetX !== undefined && ai?.roamTargetY !== undefined) {
        const roamSpeed = ai.roamSpeed ?? enemy.moveSpeed;
        this.physics.moveTo(enemy.sprite, ai.roamTargetX, ai.roamTargetY, roamSpeed);
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
        (enemy.variant === "miniF" && hpRatio <= 0.5) ||
        (enemy.variant === "mainA" && hpRatio <= 0.5) ||
        (enemy.variant === "mainB" && hpRatio <= 0.5) ||
        (enemy.variant === "final" && hpRatio <= 0.5);
      if (shouldEnrage) {
        state.enraged = true;
        state.nextBurstAt = now + 500;
        state.nextDashAt = now + 450;
        state.nextZoneAt = now + 900;
        state.nextSpecialAt = now + 950;
        if (enemy.variant === "miniB") {
          state.nextSpecialAt = now;
        } else if (enemy.variant === "miniC") {
          state.nextSpecialAt = now + 4000;
        } else if (enemy.variant === "mainA") {
          // 狂暴阶段取消安全区机制，避免“安全区贴身”问题
          this.clearMainASpotlights(enemy.id);
          state.nextBurstAt = now + 700;
          state.nextSpecialAt = now + 1200;
          state.nextDashAt = now + 2200;
          state.nextZoneAt = now + 3600;
          state.mainAClockStep = undefined;
          state.mainAClockNextAt = undefined;
          state.mainAClockBaseAngle = undefined;
          state.mainASweepUntil = undefined;
          state.mainASweepNextAt = undefined;
          state.mainASweepAngle = undefined;
        } else if (enemy.variant === "miniF") {
          state.nextDashAt = now + 400;
          state.nextSpecialAt = now + 1200;
          state.nextBurstAt = now + 450;
          state.nextZoneAt = now + 450;
          state.comboActive = true;
          state.miniFComboStep = 0;
          state.nextComboDashAt = undefined;
        } else if (enemy.variant === "miniE") {
          state.nextSummonAt = now;
          state.nextBurstAt = now;
          state.nextZoneAt = now + 1200;
          state.roamTargetX = undefined;
          state.roamTargetY = undefined;
          state.roamSpeed = enemy.moveSpeed * 1.3;
          state.miniEAnchorX = undefined;
          state.miniEAnchorY = undefined;
          state.miniENextAnchorAt = undefined;
        } else if (enemy.variant === "mainB") {
          state.nextBurstAt = now + 600;
          state.nextSpecialAt = now + 700;
          state.nextZoneAt = undefined;
          state.dashPrepUntil = undefined;
          state.dashUntil = undefined;
          state.dashTargetX = undefined;
          state.dashTargetY = undefined;
          state.dashVx = undefined;
          state.dashVy = undefined;
        } else if (enemy.variant === "final") {
          state.nextBurstAt = now;
          state.nextSpecialAt = now + 800;
          state.nextZoneAt = now + 2800;
          state.roamSpeed = enemy.moveSpeed * 1.3;
          state.roamTargetX = undefined;
          state.roamTargetY = undefined;
        }
        this.spawnText(enemy.sprite.x, enemy.sprite.y - 30, "狂暴阶段", "#fb7185", 15);
        this.cameras.main.shake(130, 0.0025);
      }
    }

    if (enemy.variant === "miniA") {
      if (state.dashUntil !== undefined && now >= state.dashUntil) {
        if (state.enraged && state.dashEmitOnEnd) {
          this.spawnRadialProjectiles(enemy, 8, 185);
        }
        state.dashUntil = undefined;
        state.dashVx = undefined;
        state.dashVy = undefined;
        state.dashEmitOnEnd = false;
        if ((state.dashChainLeft ?? 0) > 0) {
          state.nextDashAt = now + 500;
        } else {
          state.nextDashAt = now + (state.enraged ? 1500 : 2000);
        }
      }
      if (state.dashPrepUntil !== undefined && now >= state.dashPrepUntil) {
        const tx = state.dashTargetX ?? this.player.sprite.x;
        const ty = state.dashTargetY ?? this.player.sprite.y;
        const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, tx, ty);
        const speed = enemy.moveSpeed * (state.enraged ? 4.2 : 3.7);
        state.dashVx = Math.cos(angle) * speed;
        state.dashVy = Math.sin(angle) * speed;
        state.dashUntil = now + (state.enraged ? 720 : 620);
        state.dashPrepUntil = undefined;
        state.dashTargetX = undefined;
        state.dashTargetY = undefined;
        state.dashEmitOnEnd = state.enraged;
        const body = enemy.sprite.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(state.dashVx, state.dashVy);
      }
      const isDashing = state.dashUntil !== undefined && now < state.dashUntil;
      const isPreparing = state.dashPrepUntil !== undefined && now < state.dashPrepUntil;
      if ((state.nextDashAt ?? 0) <= now && !isDashing && !isPreparing) {
        const chainTotal = state.enraged ? 2 : 1;
        if ((state.dashChainLeft ?? 0) <= 0) {
          state.dashChainLeft = chainTotal;
        }
        state.dashChainLeft = Math.max(0, (state.dashChainLeft ?? 0) - 1);
        state.dashPrepUntil = now + 500;
        state.dashTargetX = this.player.sprite.x;
        state.dashTargetY = this.player.sprite.y;
        this.drawDashWarning(enemy, state.dashTargetX, state.dashTargetY, 500);
      }
    }
    if (enemy.variant === "miniB") {
      // 普攻：每秒一发（1/s），与技能波次独立
      if ((state.miniBAimAt ?? 0) <= now) {
        state.miniBAimAt = now + 1000;
        this.spawnEnemyProjectile(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y, enemy.projectileDamage);
      }

      // 螺旋波次：打一波 -> 停几秒
      if ((state.nextBurstAt ?? 0) <= now && now >= (state.miniBWaveUntil ?? 0)) {
        state.miniBWaveUntil = now + (state.enraged ? 2300 : 2500);
        state.nextCrossAt = now;
        state.nextBurstAt = now + (state.enraged ? 6000 : 8000);
      }
      if (now < (state.miniBWaveUntil ?? 0) && (state.nextCrossAt ?? 0) <= now) {
        state.nextCrossAt = now + (state.enraged ? 170 : 210);
        const angle = Phaser.Math.DegToRad(state.crossAngleDeg ?? 0);
        this.spawnSpiralProjectiles(enemy, state.enraged ? 12 : 10, 220, angle);
        state.crossAngleDeg = ((state.crossAngleDeg ?? 0) + 12) % 360;
      }

      // 扇形弹幕（普通阶段保留）
      if (!state.enraged && (state.nextDashAt ?? 0) <= now) {
        state.nextDashAt = now + 3000;
        this.spawnAimedBurst(enemy, 6, 0.12, 220);
      }
      if (state.enraged && (state.nextDashAt ?? 0) <= now) {
        state.nextDashAt = now + 2600;
        this.spawnAimedBurst(enemy, 7, 0.12, 230);
      }

      if (state.enraged && (state.nextSpecialAt ?? 0) <= now) {
        state.nextSpecialAt = now + 2400;
        const playerBody = this.player.sprite.body as Phaser.Physics.Arcade.Body | undefined;
        const leadMs = 700;
        const predX = this.player.sprite.x + (playerBody?.velocity.x ?? 0) * (leadMs / 1000);
        const predY = this.player.sprite.y + (playerBody?.velocity.y ?? 0) * (leadMs / 1000);
        const fallbackAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const fallbackDist = Phaser.Math.Between(58, 110);
        const targetX = Phaser.Math.Clamp(
          Math.hypot(playerBody?.velocity.x ?? 0, playerBody?.velocity.y ?? 0) > 8
            ? predX
            : this.player.sprite.x + Math.cos(fallbackAngle) * fallbackDist,
          30,
          WORLD_SIZE - 30,
        );
        const targetY = Phaser.Math.Clamp(
          Math.hypot(playerBody?.velocity.x ?? 0, playerBody?.velocity.y ?? 0) > 8
            ? predY
            : this.player.sprite.y + Math.sin(fallbackAngle) * fallbackDist,
          30,
          WORLD_SIZE - 30,
        );
        this.spawnBossHazardZone(targetX, targetY, 84, 4600, 10, 420, "毒区", 1200);
      }
    }
    if (enemy.variant === "miniC") {
      if (!state.enraged) {
        if ((state.nextBurstAt ?? 0) <= now) {
          state.nextBurstAt = now + 3600;
          this.spawnSpiralProjectiles(enemy, 12, 210, now * 0.0026);
        }
        if ((state.nextSummonAt ?? 0) <= now) {
          state.nextSummonAt = now + 4200;
          const spawned = this.spawnEnemyNear(enemy.sprite.x, enemy.sprite.y, "normal");
          if (spawned !== undefined) {
            this.miniCActiveMobs.push(spawned);
          }
        }
      } else if ((state.nextSpecialAt ?? 0) <= now) {
        state.nextSpecialAt = now + 4000;
        this.cleanupMiniCActiveMobs();
        const points: Array<{ x: number; y: number }> = [{ x: this.player.sprite.x, y: this.player.sprite.y }];
        const mobPool = Phaser.Utils.Array.Shuffle([...this.miniCActiveMobs]).slice(0, 12);
        for (const mob of mobPool) {
          points.push({ x: mob.sprite.x, y: mob.sprite.y });
        }
        for (const p of points) {
          this.castSignalMeteorWithZone(p.x, p.y);
        }
      }
    }
    if (enemy.variant === "miniD") {
      if ((state.nextDashAt ?? 0) <= now) {
        state.nextDashAt = now + (state.enraged ? Phaser.Math.Between(2400, 3200) : Phaser.Math.Between(3400, 4600));
        this.spawnAimedBurst(enemy, state.enraged ? 7 : 5, state.enraged ? 0.18 : 0.11, state.enraged ? 260 : 220);
      }
      if ((state.nextSpecialAt ?? 0) <= now) {
        state.nextSpecialAt = now + (state.enraged ? Phaser.Math.Between(4200, 5600) : Phaser.Math.Between(6200, 7600));
        if (state.enraged) {
          this.castMiniDMeteorRain(enemy, 4, 73, 120, 320);
        } else {
          this.castMiniDMeteorRain(enemy, 3, 56, 90, 280);
        }
      }
    }
    if (enemy.variant === "miniE") {
      // A: 轨道锚点模式，玩家很难靠绕圈“干扰”它的移动决策
      if (state.miniEAnchorX === undefined || state.miniEAnchorY === undefined) {
        state.miniEAnchorX = this.player.sprite.x;
        state.miniEAnchorY = this.player.sprite.y;
        state.miniENextAnchorAt = now + 1400;
        state.miniEOrbitDir = Math.random() < 0.5 ? -1 : 1;
        state.miniEOrbitAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        state.miniEOrbitRadius = state.enraged ? 420 : 390;
      }

      const reachedRoamPoint =
        state.roamTargetX !== undefined &&
        state.roamTargetY !== undefined &&
        Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, state.roamTargetX, state.roamTargetY) <= 56;

      if ((state.miniENextAnchorAt ?? 0) <= now) {
        const ax = state.miniEAnchorX;
        const ay = state.miniEAnchorY;
        const playerMovedFar = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, ax, ay) > 170;
        if (playerMovedFar) {
          state.miniEAnchorX = Phaser.Math.Linear(ax, this.player.sprite.x, 0.38);
          state.miniEAnchorY = Phaser.Math.Linear(ay, this.player.sprite.y, 0.38);
        }
        state.miniENextAnchorAt = now + (state.enraged ? 1150 : 1450);
      }

      if (state.roamTargetX === undefined || state.roamTargetY === undefined || reachedRoamPoint || (state.nextSummonAt ?? 0) <= now) {
        let targetAngle = state.miniEOrbitAngle ?? 0;
        let targetRadius = state.miniEOrbitRadius ?? (state.enraged ? 420 : 390);
        const dir = state.miniEOrbitDir ?? 1;
        targetAngle += dir * Phaser.Math.FloatBetween(state.enraged ? 0.78 : 0.62, state.enraged ? 0.98 : 0.84);
        targetRadius = Phaser.Math.Clamp(targetRadius + Phaser.Math.Between(-20, 24), 320, 540);

        state.miniEOrbitAngle = targetAngle;
        state.miniEOrbitRadius = targetRadius;
        const anchorX = state.miniEAnchorX ?? this.player.sprite.x;
        const anchorY = state.miniEAnchorY ?? this.player.sprite.y;
        state.roamTargetX = Phaser.Math.Clamp(anchorX + Math.cos(targetAngle) * targetRadius, 24, WORLD_SIZE - 24);
        state.roamTargetY = Phaser.Math.Clamp(anchorY + Math.sin(targetAngle) * targetRadius, 24, WORLD_SIZE - 24);
        state.roamSpeed = enemy.moveSpeed * (state.enraged ? 1.24 : 1.08);
        state.nextSummonAt = now + (state.enraged ? 860 : 1060);
      }

      // B: 每 0.5s 留下一段毒气轨迹
      if ((state.nextBurstAt ?? 0) <= now) {
        state.nextBurstAt = now + 500;
        this.spawnBossHazardZone(enemy.sprite.x, enemy.sprite.y, 58, 12000, 10, 420, "毒气");
      }

      // C: 狂暴后每 3s 在玩家周围抛 3 个减速区
      if (state.enraged && (state.nextZoneAt ?? 0) <= now) {
        state.nextZoneAt = now + 3000;
        for (let i = 0; i < 3; i += 1) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const dist = Phaser.Math.Between(70, 220);
          const zx = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(angle) * dist, 36, WORLD_SIZE - 36);
          const zy = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(angle) * dist, 36, WORLD_SIZE - 36);
          this.spawnBossSlowZone(zx, zy, 56, 3200, 0.5);
        }
      }
    }
    if (enemy.variant === "miniF") {
      const nextSkillAt = state.nextZoneAt ?? 0;
      const busy = state.dashUntil !== undefined && now < state.dashUntil;
      const mustOpenWithTriangle = !!state.enraged && !!state.comboActive;
      if (!busy && !mustOpenWithTriangle && now >= nextSkillAt && (state.nextDashAt ?? 0) <= now) {
        const useCircular = ((state.miniFComboStep ?? 0) % 2) === 0;
        state.miniFComboStep = (state.miniFComboStep ?? 0) + 1;
        state.nextDashAt = now + 1200;
        state.nextZoneAt = now + (state.enraged ? 4000 : 5000);

        if (useCircular) {
          // 技能1（狂暴强化）：本体冲刺圆斩 + 影分身补一刀（交替触发）
          const tx = this.player.sprite.x;
          const ty = this.player.sprite.y;
          this.drawDashWarning(enemy, tx, ty, 500);
          state.dashUntil = now + (state.enraged ? 3000 : 2200);
          this.time.delayedCall(500, () => {
            if (enemy.isDead || !enemy.sprite.active) {
              return;
            }
            this.startMiniFDash(enemy, tx, ty, 70, () => {
              this.spawnCircularSlashWarning(enemy.sprite.x, enemy.sprite.y, 180, 1500, 20, enemy.id);
            });
            if (state.enraged) {
              this.time.delayedCall(380, () => {
                if (enemy.isDead || !enemy.sprite.active) {
                  return;
                }
                // 分身尽量从 Boss 相反侧切入，减少技能范围重叠
                const bossFacing = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
                const angle = bossFacing + Math.PI + Phaser.Math.FloatBetween(-0.4, 0.4);
                const dist = Phaser.Math.Between(240, 280);
                const cx = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(angle) * dist, 24, WORLD_SIZE - 24);
                const cy = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(angle) * dist, 24, WORLD_SIZE - 24);
                this.spawnMiniFCloneFx(cx, cy);
                this.spawnCircularSlashWarning(cx, cy, 180, 1200, 20, enemy.id);
              });
            }
          });
        } else {
          // 技能2（狂暴强化）：本体横劈 + 影分身横劈（交替触发）
          this.spawnMiniFChargeFx(enemy.sprite.x, enemy.sprite.y, 2000, 28, 0x94a3b8);
          state.dashUntil = now + (state.enraged ? 4200 : 3600);
          this.time.delayedCall(2000, () => {
            if (enemy.isDead || !enemy.sprite.active) {
              return;
            }
            const toPlayer = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
            const sideOffset = Math.random() < 0.5 ? Math.PI * 0.5 : -Math.PI * 0.5;
            const sideDist = 96;
            const bx = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(toPlayer + sideOffset) * sideDist, 24, WORLD_SIZE - 24);
            const by = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(toPlayer + sideOffset) * sideDist, 24, WORLD_SIZE - 24);
            enemy.sprite.setPosition(bx, by);
            enemy.syncVisual();
            this.spawnMiniFCloneFx(bx, by);
            const facing = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
            this.spawnMiniFSectorChargeWarning(enemy.sprite.x, enemy.sprite.y, facing, 1500, 360, 1.18, 20, enemy.id);
            if (state.enraged) {
              this.time.delayedCall(380, () => {
                if (enemy.isDead || !enemy.sprite.active) {
                  return;
                }
                // 分身从玩家另一侧出手，避免与本体扇形大幅重合
                const backAngle = Phaser.Math.Angle.Between(this.player.sprite.x, this.player.sprite.y, enemy.sprite.x, enemy.sprite.y) + Phaser.Math.FloatBetween(-0.35, 0.35);
                const cx = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(backAngle) * 210, 24, WORLD_SIZE - 24);
                const cy = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(backAngle) * 210, 24, WORLD_SIZE - 24);
                this.spawnMiniFCloneFx(cx, cy);
                const cloneFacing = Phaser.Math.Angle.Between(cx, cy, this.player.sprite.x, this.player.sprite.y) + Phaser.Math.FloatBetween(-0.32, 0.32);
                this.spawnMiniFSectorChargeWarning(cx, cy, cloneFacing, 1200, 360, 1.18, 20, enemy.id);
              });
            }
          });
        }
      }

      // 狂暴爆发：Boss 本体 + 两个分身组成三角，同时蓄力扇形，避免中间出现站桩安全位
      const busyNow = state.dashUntil !== undefined && now < state.dashUntil;
      if (
        state.enraged &&
        !busyNow &&
        (state.nextBurstAt ?? 0) <= now &&
        ((state.comboActive ?? false) || now >= (state.nextZoneAt ?? 0))
      ) {
        state.comboActive = false;
        state.nextBurstAt = now + 20000;
        state.nextZoneAt = now + 4000;
        state.dashUntil = now + 2600;
        this.miniFTimeStopUntil = now + 700;
        if (!this.miniFProjectilesFrozen) {
          this.freezeEnemyProjectiles();
          this.miniFProjectilesFrozen = true;
        }
        const points = [
          { x: this.player.sprite.x, y: this.player.sprite.y - 240 },
          { x: this.player.sprite.x - 240, y: this.player.sprite.y + 180 },
          { x: this.player.sprite.x + 240, y: this.player.sprite.y + 180 },
        ];
        const bossPoint = {
          x: Phaser.Math.Clamp(points[0].x, 24, WORLD_SIZE - 24),
          y: Phaser.Math.Clamp(points[0].y, 24, WORLD_SIZE - 24),
        };
        enemy.sprite.setPosition(bossPoint.x, bossPoint.y);
        enemy.syncVisual();
        for (const point of points) {
          const px = Phaser.Math.Clamp(point.x, 24, WORLD_SIZE - 24);
          const py = Phaser.Math.Clamp(point.y, 24, WORLD_SIZE - 24);
          if (Math.abs(px - bossPoint.x) < 0.1 && Math.abs(py - bossPoint.y) < 0.1) {
            continue;
          }
          this.spawnMiniFCloneFx(px, py);
        }
        this.time.delayedCall(700, () => {
          if (enemy.isDead || !enemy.sprite.active) {
            return;
          }
          for (const point of points) {
            const px = Phaser.Math.Clamp(point.x, 24, WORLD_SIZE - 24);
            const py = Phaser.Math.Clamp(point.y, 24, WORLD_SIZE - 24);
            const facing = Phaser.Math.Angle.Between(px, py, this.player.sprite.x, this.player.sprite.y);
            this.spawnMiniFSectorChargeWarning(px, py, facing, 1500, 290, 2.1, 20, enemy.id);
          }
        });
      }
    }
    if (enemy.variant === "mainA") {
      if (!state.enraged) {
        this.ensureMainASpotlights(enemy, state, now);

        if (state.nextBurstAt === undefined) {
          state.nextBurstAt = now + 2200;
        }
        if (state.nextSpecialAt === undefined) {
          state.nextSpecialAt = now + 4200;
        }
        if (state.nextZoneAt === undefined) {
          state.nextZoneAt = now + 7600;
        }

        if ((state.nextBurstAt ?? 0) <= now) {
          state.nextBurstAt = now + 6200;
          this.castMainAOffsetBulletWaves(enemy, false);
        }
        if ((state.nextSpecialAt ?? 0) <= now) {
          state.nextSpecialAt = now + 10800;
          this.castMainAHexLaser(enemy, false);
        }

        const normalClockActive = (state.mainAClockStep ?? 8) < 8;
        if (!normalClockActive && (state.nextZoneAt ?? 0) <= now) {
          state.mainAClockStep = 0;
          state.mainAClockNextAt = now + 220;
          state.mainAClockBaseAngle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
          state.nextZoneAt = now + 24000;
        }
        if (normalClockActive && (state.mainAClockNextAt ?? 0) <= now) {
          const step = state.mainAClockStep ?? 0;
          const base = state.mainAClockBaseAngle ?? 0;
          const angle = base + Phaser.Math.DegToRad(step * 45);
          this.spawnMainALaserTelegraph(enemy, angle, 940, 86, 560, 10, "六方激光");
          state.mainAClockStep = step + 1;
          state.mainAClockNextAt = now + 1000;
          if ((state.mainAClockStep ?? 0) >= 8) {
            state.mainAClockStep = undefined;
            state.mainAClockNextAt = undefined;
            state.mainAClockBaseAngle = undefined;
          }
        }
      } else {
        // 狂暴：移除安全区/暗区玩法，转为高压激光机制
        this.clearMainASpotlights(enemy.id);

        if (state.nextBurstAt === undefined) {
          state.nextBurstAt = now + 1500;
        }
        if (state.nextSpecialAt === undefined) {
          state.nextSpecialAt = now + 2600;
        }
        if (state.nextDashAt === undefined) {
          state.nextDashAt = now + 3600;
        }
        if (state.nextZoneAt === undefined) {
          state.nextZoneAt = now + 5200;
        }

        if ((state.nextBurstAt ?? 0) <= now) {
          state.nextBurstAt = now + 4600;
          this.castMainAOffsetBulletWaves(enemy, true);
        }
        if ((state.nextSpecialAt ?? 0) <= now) {
          state.nextSpecialAt = now + 9800;
          this.castMainAHexLaser(enemy, true);
        }
        if ((state.nextDashAt ?? 0) <= now) {
          state.nextDashAt = now + 9600;
          this.castMainAQuadrantCut(enemy);
        }

        const inSweep = state.mainASweepUntil !== undefined && now < state.mainASweepUntil;
        if (!inSweep && (state.nextZoneAt ?? 0) <= now) {
          state.mainASweepUntil = now + 5600;
          state.mainASweepNextAt = now + 240;
          // 起手偏移约 4.5 段，让扫射在第 4~5 下才扫到玩家当前位置
          const target = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, this.player.sprite.x, this.player.sprite.y);
          state.mainASweepAngle = target - Phaser.Math.DegToRad(63);
          state.nextZoneAt = now + 16500;
          gameEvents.emit("ui:warning", { text: "狂暴激光：顺时针扫射！", color: "#fda4af" });
        }
        if (inSweep && (state.mainASweepNextAt ?? 0) <= now) {
          const angle = state.mainASweepAngle ?? 0;
          this.spawnMainALaserTelegraph(enemy, angle, 980, 74, 280, 10, "狂暴激光");
          state.mainASweepAngle = angle + Phaser.Math.DegToRad(14);
          state.mainASweepNextAt = now + 180;
        }
        if (state.mainASweepUntil !== undefined && now >= state.mainASweepUntil) {
          state.mainASweepUntil = undefined;
          state.mainASweepNextAt = undefined;
          state.mainASweepAngle = undefined;
        }
      }
    }
    if (enemy.variant === "mainB") {
      if (state.dashUntil !== undefined && now >= state.dashUntil) {
        state.dashUntil = undefined;
        state.dashVx = undefined;
        state.dashVy = undefined;
      }
      if (state.dashPrepUntil !== undefined && now >= state.dashPrepUntil) {
        const tx = state.dashTargetX ?? this.player.sprite.x;
        const ty = state.dashTargetY ?? this.player.sprite.y;
        const angle = Phaser.Math.Angle.Between(enemy.sprite.x, enemy.sprite.y, tx, ty);
        const speed = enemy.moveSpeed * 4;
        state.dashVx = Math.cos(angle) * speed;
        state.dashVy = Math.sin(angle) * speed;
        state.dashUntil = now + 520;
        state.dashPrepUntil = undefined;
        state.dashTargetX = undefined;
        state.dashTargetY = undefined;
      }
      const isDashing = state.dashUntil !== undefined && now < state.dashUntil;
      const isPreparing = state.dashPrepUntil !== undefined && now < state.dashPrepUntil;
      if (!state.enraged) {
        state.gravityForce = 95;
        if ((state.nextBurstAt ?? 0) <= now) {
          state.nextBurstAt = now + 4000;
          this.spawnMeteorStrike(enemy.sprite.x, enemy.sprite.y, 2000, 22, 54);
        }
        if ((state.nextSpecialAt ?? 0) <= now) {
          state.nextSpecialAt = now + 3000;
          this.spawnSpiralProjectiles(enemy, 20, 255, now * 0.0025);
        }
      } else if (!isDashing && !isPreparing) {
        state.gravityForce = -133;
        if (!state.edgeLockdownDone) {
          state.edgeLockdownDone = true;
          const centerX = WORLD_SIZE / 2;
          const centerY = WORLD_SIZE / 2;
          const ringRadius = Math.floor(WORLD_SIZE * 0.42);
          const points = 16;
          for (let i = 0; i < points; i += 1) {
            const angle = (Math.PI * 2 * i) / points;
            const x = Phaser.Math.Clamp(centerX + Math.cos(angle) * ringRadius, 36, WORLD_SIZE - 36);
            const y = Phaser.Math.Clamp(centerY + Math.sin(angle) * ringRadius, 36, WORLD_SIZE - 36);
            this.spawnMeteorStrike(x, y, 2000, 20, 34, () => {
              this.spawnBossHazardZone(x, y, 68, 600000, 10, 320, "毒墙");
            });
          }
        }
        if ((state.nextBurstAt ?? 0) <= now) {
          state.nextBurstAt = now + 1500;
          this.spawnRadialProjectiles(enemy, 14, 248);
        }
      }
    }
    if (enemy.kind === "finalBoss") {
      state.finalLives ??= 3;
      state.finalPhase ??= 1;
      state.roamSpeed = enemy.moveSpeed * 1.05;

      if (state.finalProjectilesFrozen && now >= (state.finalTimeStopUntil ?? 0)) {
        this.unfreezeEnemyProjectiles();
        state.finalProjectilesFrozen = false;
      }

      if (state.finalLives === 2 && state.finalPhase < 2) {
        state.finalPhase = 2;
        state.finalNextTimeStopAt = now + 2200;
        gameEvents.emit("ui:warning", { text: "第二阶段：绝对时停", color: "#c4b5fd" });
      }
      if (state.finalLives === 1 && state.finalPhase < 3) {
        state.finalPhase = 3;
        state.finalInvulnerable = true;
        state.finalWindSlowUntil = now + 5200;
        this.forcePlayerToArenaEdge();
        gameEvents.emit("ui:warning", { text: "第三阶段：逆风朝圣", color: "#fda4af" });
      }
      if (state.finalLives === 1 && state.finalPhase === 3 && enemy.health <= enemy.maxHealth * 0.3 && !state.phase4Triggered) {
        state.phase4Triggered = true;
        state.finalPhase = 4;
        state.finalInvulnerable = true;
        this.spawnFinalPylons();
        state.finalNextMobWaveAt = now + 900;
        gameEvents.emit("ui:warning", { text: "第四阶段：破阵之战", color: "#fb7185" });
      }
      if (state.finalPhase === 4 && this.finalPylons.length <= 0) {
        state.finalPhase = 5;
        state.finalInvulnerable = false;
        this.clearAllNormalEnemiesInstant();
        gameEvents.emit("ui:warning", { text: "第五阶段：终末疯狂", color: "#fca5a5" });
      }

      // Phase 1/2 base kit: mobility + toxic trail + spiral + meteor rain.
      if (state.finalPhase === 1 || state.finalPhase === 2 || state.finalPhase === 3 || state.finalPhase === 5) {
        if ((state.nextSummonAt ?? 0) <= now) {
          state.nextSummonAt = now + 230;
          const ringMin = 220;
          const ringMax = 460;
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const radius = Phaser.Math.Between(ringMin, ringMax);
          state.roamTargetX = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(angle) * radius, 48, WORLD_SIZE - 48);
          state.roamTargetY = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(angle) * radius, 48, WORLD_SIZE - 48);
          state.roamSpeed = enemy.moveSpeed * (state.finalPhase >= 3 ? 1.2 : 1.05);
        }
        const targetX = state.roamTargetX ?? enemy.sprite.x;
        const targetY = state.roamTargetY ?? enemy.sprite.y;
        const reached = Phaser.Math.Distance.Between(enemy.sprite.x, enemy.sprite.y, targetX, targetY) <= 30;
        if (reached) {
          state.nextSummonAt = now;
        }
        if ((state.nextBurstAt ?? 0) <= now) {
          state.nextBurstAt = now + 620;
          this.spawnBossHazardZone(enemy.sprite.x, enemy.sprite.y, 58, 180000, 10, 420, "毒水");
        }
        if ((state.nextSpecialAt ?? 0) <= now) {
          state.nextSpecialAt = now + 3000;
          this.spawnSpiralProjectiles(enemy, state.finalPhase >= 5 ? 28 : 18, state.finalPhase >= 5 ? 290 : 240, now * 0.0033);
        }
        if ((state.finalNextRainAt ?? 0) <= now) {
          state.finalNextRainAt = now + 3600;
          this.castMeteorRain(state.finalPhase >= 5 ? 6 : 3);
        }
      }

      // Phase 2: time stop + sword net.
      if (state.finalPhase === 2 && (state.finalNextTimeStopAt ?? 0) <= now) {
        state.finalNextTimeStopAt = now + 9200;
        state.finalTimeStopUntil = now + 2000;
        this.freezeEnemyProjectiles();
        state.finalProjectilesFrozen = true;
        gameEvents.emit("ui:warning", { text: "砸瓦鲁多！", color: "#e2e8f0" });
        const centerX = this.player.sprite.x;
        const centerY = this.player.sprite.y;
        this.playerControlLockX = centerX;
        this.playerControlLockY = centerY;
        this.playerControlLockUntil = now + 2000;
        state.finalLockX = centerX;
        state.finalLockY = centerY;

        // 顺序：左上 -> 左下 -> 右下 -> 右上
        const points = [
          { x: centerX - 170, y: centerY - 170, chargeMs: 3500 },
          { x: centerX - 170, y: centerY + 170, chargeMs: 3000 },
          { x: centerX + 170, y: centerY + 170, chargeMs: 2500 },
          { x: centerX + 170, y: centerY - 170, chargeMs: 2000 },
        ];

        for (let i = 0; i < points.length; i += 1) {
          const point = points[i];
          this.time.delayedCall(i * 500, () => {
            if (enemy.isDead || !enemy.sprite.active) {
              return;
            }
            const px = Phaser.Math.Clamp(point.x, 36, WORLD_SIZE - 36);
            const py = Phaser.Math.Clamp(point.y, 36, WORLD_SIZE - 36);
            this.spawnFinalShadowFx(px, py, enemy.id);
            const facing = Phaser.Math.Angle.Between(px, py, centerX, centerY);
            this.spawnMiniFSectorChargeWarning(px, py, facing, point.chargeMs, 250, 1.46, 20, enemy.id);
            const ringSeed = this.add.circle(px, py, 12, 0xfda4af, 0.2).setStrokeStyle(2, 0xfda4af, 0.95).setDepth(15);
            this.registerBossTelegraph(enemy.id, ringSeed);
            this.tweens.add({
              targets: ringSeed,
              scale: 1.45,
              alpha: 0.52,
              duration: 420,
              ease: "Sine.Out",
            });
          });
        }

        // 时停结束：四个环形弹幕同时散开（慢速）
        this.time.delayedCall(2000, () => {
          if (enemy.isDead || !enemy.sprite.active) {
            return;
          }
          for (const point of points) {
            const px = Phaser.Math.Clamp(point.x, 36, WORLD_SIZE - 36);
            const py = Phaser.Math.Clamp(point.y, 36, WORLD_SIZE - 36);
            this.spawnRadialProjectilesAt(px, py, 12, 145, 10, 0xfda4af);
          }
          const cx = WORLD_SIZE / 2;
          const cy = WORLD_SIZE / 2;
          enemy.sprite.setPosition(cx, cy);
          enemy.syncVisual();
        });
      }

      // Phase 3: center invulnerable until player enters 10-grid.
      if (state.finalPhase === 3) {
        const cx = WORLD_SIZE / 2;
        const cy = WORLD_SIZE / 2;
        enemy.sprite.setPosition(cx, cy);
        enemy.syncVisual();
        const dist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, cx, cy);
        const near = dist <= 640;
        state.finalInvulnerable = !near;
        if (!near) {
          if ((state.nextSpecialAt ?? 0) <= now) {
            state.nextSpecialAt = now + 1200;
            this.spawnRadialProjectiles(enemy, 16, 265);
          }
          if ((state.finalNextRainAt ?? 0) <= now) {
            state.finalNextRainAt = now + 2000;
            this.castMeteorRain(4);
          }
          if ((state.nextZoneAt ?? 0) <= now) {
            state.nextZoneAt = now + 3000;
            for (let i = 0; i < 3; i += 1) {
              const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
              const dist = Phaser.Math.Between(70, 220);
              const zx = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(angle) * dist, 36, WORLD_SIZE - 36);
              const zy = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(angle) * dist, 36, WORLD_SIZE - 36);
              this.spawnBossSlowZone(zx, zy, 56, 3200, 0.5);
            }
          }
        } else if ((state.finalNextBlinkAt ?? 0) <= now) {
          state.finalNextBlinkAt = now + 2200;
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const blinkDist = 340;
          enemy.sprite.setPosition(
            Phaser.Math.Clamp(this.player.sprite.x + Math.cos(angle) * blinkDist, 36, WORLD_SIZE - 36),
            Phaser.Math.Clamp(this.player.sprite.y + Math.sin(angle) * blinkDist, 36, WORLD_SIZE - 36),
          );
          enemy.syncVisual();
        }
      }

      // Phase 4: pylon check + boss self-heal.
      if (state.finalPhase === 4) {
        state.finalInvulnerable = true;
        enemy.health = Math.min(enemy.maxHealth, enemy.health + enemy.maxHealth * 0.0012);
        const cx = WORLD_SIZE / 2;
        const cy = WORLD_SIZE / 2;
        enemy.sprite.setPosition(cx, cy);
        enemy.syncVisual();
        if ((state.finalNextMobWaveAt ?? 0) <= now) {
          state.finalNextMobWaveAt = now + 700;
          for (let i = 0; i < 4; i += 1) {
            this.spawnEnemy("normal");
          }
        }
      }

      // Phase 5: frenzy stomp + zero-latency pressure.
      if (state.finalPhase === 5) {
        if ((state.finalNextStompAt ?? 0) <= now) {
          state.finalNextStompAt = now + 620;
          enemy.sprite.setPosition(this.player.sprite.x, this.player.sprite.y);
          enemy.syncVisual();
          this.spawnMeteorStrike(enemy.sprite.x, enemy.sprite.y, 220, 20, 66);
        }
        if ((state.nextSpecialAt ?? 0) <= now) {
          state.nextSpecialAt = now + 700;
          this.spawnRadialProjectiles(enemy, 18, 300);
        }
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

  private spawnRadialProjectilesAt(
    x: number,
    y: number,
    rays: number,
    speed: number,
    damage: number,
    color = 0xfca5a5,
  ): void {
    for (let i = 0; i < rays; i += 1) {
      const angle = (Math.PI * 2 * i) / rays;
      const orb = this.add.circle(x, y, 4, color);
      this.physics.add.existing(orb);
      const body = orb.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.enemyProjectiles.push({
        id: this.enemyProjectileId++,
        sprite: orb,
        damage,
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

  private spawnRadialProjectilesAtAngle(
    x: number,
    y: number,
    rays: number,
    speed: number,
    damage: number,
    angleOffsetRad: number,
    color = 0xfca5a5,
  ): void {
    for (let i = 0; i < rays; i += 1) {
      const angle = angleOffsetRad + (Math.PI * 2 * i) / rays;
      const orb = this.add.circle(x, y, 4, color);
      this.physics.add.existing(orb);
      const body = orb.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      this.enemyProjectiles.push({
        id: this.enemyProjectileId++,
        sprite: orb,
        damage,
        spawnAt: this.time.now,
      });
    }
  }

  private castMainAOffsetBulletWaves(enemy: Enemy, enraged: boolean): void {
    const rays = enraged ? 14 : 12;
    const speed = enraged ? 245 : 220;
    const offset = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.spawnRadialProjectilesAtAngle(enemy.sprite.x, enemy.sprite.y, rays, speed, enemy.projectileDamage, offset, 0xfda4af);
    this.time.delayedCall(220, () => {
      if (!enemy.sprite.active || enemy.isDead) {
        return;
      }
      this.spawnRadialProjectilesAtAngle(
        enemy.sprite.x,
        enemy.sprite.y,
        rays,
        speed,
        enemy.projectileDamage,
        offset + Math.PI / rays,
        0x7dd3fc,
      );
    });
  }

  private castMainAHexLaser(enemy: Enemy, enraged: boolean): void {
    const base = Phaser.Math.FloatBetween(0, Math.PI * 2);
    for (let i = 0; i < 6; i += 1) {
      const angle = base + (Math.PI * 2 * i) / 6;
      this.spawnMainALaserTelegraph(enemy, angle, 980, enraged ? 94 : 86, enraged ? 1040 : 620, 10, "六方激光");
    }
    this.spawnText(enemy.sprite.x, enemy.sprite.y - 48, "六方激光", "#fda4af", 13);
  }

  private castMainAQuadrantCut(enemy: Enemy): void {
    const radius = 820;
    const chargeMs = 2100;
    const pairType = Math.random() < 0.5 ? 0 : 1;
    const graph = this.add.graphics().setDepth(15);
    this.registerBossTelegraph(enemy.id, graph);

    const draw = (intensity: number): void => {
      graph.clear();
      graph.fillStyle(0xef4444, 0.13 + intensity * 0.24);
      const sectors =
        pairType === 0
          ? [
              { start: Phaser.Math.DegToRad(0), end: Phaser.Math.DegToRad(90) },
              { start: Phaser.Math.DegToRad(180), end: Phaser.Math.DegToRad(270) },
            ]
          : [
              { start: Phaser.Math.DegToRad(90), end: Phaser.Math.DegToRad(180) },
              { start: Phaser.Math.DegToRad(270), end: Phaser.Math.DegToRad(360) },
            ];
      for (const sector of sectors) {
        graph.slice(enemy.sprite.x, enemy.sprite.y, radius * (0.68 + intensity * 0.32), sector.start, sector.end, false);
        graph.fillPath();
      }
      graph.lineStyle(3, 0xfca5a5, 0.9);
      graph.beginPath();
      graph.moveTo(enemy.sprite.x - radius, enemy.sprite.y);
      graph.lineTo(enemy.sprite.x + radius, enemy.sprite.y);
      graph.moveTo(enemy.sprite.x, enemy.sprite.y - radius);
      graph.lineTo(enemy.sprite.x, enemy.sprite.y + radius);
      graph.strokePath();
    };

    draw(0);
    const holder = { p: 0 };
    this.tweens.add({
      targets: holder,
      p: 1,
      duration: chargeMs,
      ease: "Linear",
      onUpdate: () => draw(holder.p),
      onComplete: () => {
        const burst = this.add.circle(enemy.sprite.x, enemy.sprite.y, 40, 0xf43f5e, 0.42).setDepth(16);
        this.registerBossTelegraph(enemy.id, burst);
        this.tweens.add({
          targets: burst,
          scale: 5.6,
          alpha: 0,
          duration: 230,
          ease: "Quad.Out",
          onComplete: () => burst.destroy(),
        });
        const dx = this.player.sprite.x - enemy.sprite.x;
        const dy = this.player.sprite.y - enemy.sprite.y;
        if (Math.hypot(dx, dy) <= radius) {
          const inSameSignQuadrant = dx * dy >= 0;
          const inDanger = pairType === 0 ? inSameSignQuadrant : !inSameSignQuadrant;
          if (inDanger) {
            this.damagePlayer(20, "十字切割");
          }
        }
        graph.destroy();
      },
    });
  }

  private spawnMainALaserTelegraph(
    enemy: Enemy,
    angle: number,
    length: number,
    width: number,
    chargeMs: number,
    damage: number,
    reason: string,
  ): void {
    const ox = enemy.sprite.x;
    const oy = enemy.sprite.y;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const cx = ox + dirX * length * 0.5;
    const cy = oy + dirY * length * 0.5;

    const warnOuter = this.add.rectangle(cx, cy, length, width, 0xfb7185, 0.12).setRotation(angle).setDepth(15).setStrokeStyle(2, 0xfda4af, 0.88);
    const warnCore = this.add.rectangle(cx, cy, length, width * 0.42, 0xfef2f2, 0.22).setRotation(angle).setDepth(16);
    warnCore.setScale(0.01, 1);
    this.registerBossTelegraph(enemy.id, warnOuter, warnCore);

    this.tweens.add({
      targets: warnCore,
      scaleX: 1,
      duration: chargeMs,
      ease: "Linear",
    });
    this.tweens.add({
      targets: warnOuter,
      alpha: 0.28,
      duration: chargeMs * 0.5,
      yoyo: true,
      repeat: 1,
      ease: "Sine.InOut",
    });

    const fire = (): void => {
      if (!warnOuter.active || !warnCore.active || enemy.isDead || !enemy.sprite.active) {
        return;
      }
      if (!this.gameStarted || this.choicePaused || this.manualPaused) {
        this.time.delayedCall(80, fire);
        return;
      }
      const beamOuter = this.add.rectangle(cx, cy, length, width, 0xf43f5e, 0.35).setRotation(angle).setDepth(17);
      const beamCore = this.add.rectangle(cx, cy, length, Math.max(10, width * 0.26), 0xfef2f2, 0.8).setRotation(angle).setDepth(18);
      this.registerBossTelegraph(enemy.id, beamOuter, beamCore);
      this.tweens.add({
        targets: [beamOuter, beamCore],
        alpha: 0,
        duration: 140,
        ease: "Quad.Out",
        onComplete: () => {
          beamOuter.destroy();
          beamCore.destroy();
        },
      });
      warnOuter.destroy();
      warnCore.destroy();
      if (this.isPointInsideLaser(this.player.sprite.x, this.player.sprite.y, ox, oy, angle, length, width)) {
        this.damagePlayer(damage, reason);
      }
    };

    this.time.delayedCall(chargeMs, fire);
  }

  private isPointInsideLaser(
    pointX: number,
    pointY: number,
    originX: number,
    originY: number,
    angle: number,
    length: number,
    width: number,
  ): boolean {
    const dx = pointX - originX;
    const dy = pointY - originY;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const forward = dx * cos + dy * sin;
    if (forward < 0 || forward > length) {
      return false;
    }
    const side = Math.abs(-dx * sin + dy * cos);
    return side <= width * 0.5;
  }

  private castMeteorRain(count: number, explosionRadius = 28, distMin = 50, distMax = 180): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const minDist = Math.max(0, Math.min(distMin, distMax));
      const maxDist = Math.max(minDist + 1, Math.max(distMin, distMax));
      const dist = Phaser.Math.Between(minDist, maxDist);
      const x = this.player.sprite.x + Math.cos(angle) * dist;
      const y = this.player.sprite.y + Math.sin(angle) * dist;
      this.spawnMeteorStrike(x, y, 920, 20, explosionRadius);
    }
  }

  private castMiniDMeteorRain(enemy: Enemy, count: number, explosionRadius = 28, distMin = 60, distMax = 220): void {
    const body = this.player.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    const leadX = this.player.sprite.x + (body?.velocity.x ?? 0) * 0.2;
    const leadY = this.player.sprite.y + (body?.velocity.y ?? 0) * 0.2;
    const minDist = Math.max(0, Math.min(distMin, distMax));
    const maxDist = Math.max(minDist + 1, Math.max(distMin, distMax));
    for (let i = 0; i < count; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(minDist, maxDist);
      const usePlayerAnchor = i === 0;
      const baseX = usePlayerAnchor ? leadX : enemy.sprite.x;
      const baseY = usePlayerAnchor ? leadY : enemy.sprite.y;
      const x = Phaser.Math.Clamp(baseX + Math.cos(angle) * dist, 30, WORLD_SIZE - 30);
      const y = Phaser.Math.Clamp(baseY + Math.sin(angle) * dist, 30, WORLD_SIZE - 30);
      this.spawnMeteorStrike(x, y, 980, 20, explosionRadius);
    }
  }

  private cleanupMiniCActiveMobs(): void {
    this.miniCActiveMobs = this.miniCActiveMobs.filter((mob) => mob.sprite.active && !mob.isDead);
  }

  private castSignalMeteorWithZone(x: number, y: number): void {
    this.spawnMeteorStrike(x, y, 920, 20, 36, () => {
      this.spawnBossHazardZone(x, y, 76, 4200, 10, 420, "毒区");
    });
  }

  private spawnMeteorStrike(
    x: number,
    y: number,
    delayMs: number,
    damage: number,
    radius: number,
    onExplode?: () => void,
  ): void {
    const outer = this.add.circle(x, y, radius, 0xf97316, 0.1).setStrokeStyle(2, 0xfb923c, 0.92).setDepth(14);
    const inner = this.add.circle(x, y, radius * 0.86, 0xfb923c, 0.38).setScale(0.01).setDepth(15);
    this.tweens.add({
      targets: inner,
      scaleX: 1,
      scaleY: 1,
      duration: delayMs,
      ease: "Linear",
    });
    this.time.delayedCall(delayMs, () => {
      if (!outer.active || !inner.active) {
        return;
      }
      outer.setStrokeStyle(3, 0xef4444, 1);
      outer.setFillStyle(0xef4444, 0.18);
      inner.setFillStyle(0xef4444, 0.52);
      const distToPlayer = Phaser.Math.Distance.Between(x, y, this.player.sprite.x, this.player.sprite.y);
      if (distToPlayer <= radius) {
        this.damagePlayer(damage, "陨石");
      }
      const blast = this.add.circle(x, y, radius + 8, 0xfb7185, 0.34).setDepth(16);
      this.tweens.add({
        targets: blast,
        alpha: 0,
        scale: 1.6,
        duration: 220,
        ease: "Quad.Out",
        onComplete: () => blast.destroy(),
      });
      onExplode?.();
      outer.destroy();
      inner.destroy();
    });
  }

  private startMiniFDash(enemy: Enemy, targetX: number, targetY: number, durationMs: number, onArrive: () => void): void {
    const body = enemy.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setVelocity(0, 0);
    const startX = enemy.sprite.x;
    const startY = enemy.sprite.y;
    const trail = this.add.line(0, 0, startX, startY, targetX, targetY, 0xfb7185, 0.5).setOrigin(0, 0).setDepth(16);
    trail.setLineWidth(4, 2);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      duration: Math.max(90, durationMs),
      ease: "Quad.Out",
      onComplete: () => trail.destroy(),
    });
    this.tweens.add({
      targets: enemy.sprite,
      x: targetX,
      y: targetY,
      duration: Math.max(60, durationMs),
      ease: "Expo.Out",
      onUpdate: () => enemy.syncVisual(),
      onComplete: () => {
        enemy.syncVisual();
        onArrive();
      },
    });
  }

  private spawnCircularSlashWarning(
    x: number,
    y: number,
    radius: number,
    delayMs: number,
    damage: number,
    ownerId?: number,
  ): void {
    const outer = this.add.circle(x, y, radius, 0xef4444, 0.1).setStrokeStyle(2, 0xfb7185, 0.92).setDepth(14);
    const inner = this.add.circle(x, y, radius * 0.85, 0xfb7185, 0.24).setScale(0.02).setDepth(15);
    if (ownerId !== undefined) {
      this.registerBossTelegraph(ownerId, outer, inner);
    }
    this.tweens.add({
      targets: inner,
      scaleX: 1,
      scaleY: 1,
      duration: delayMs,
      ease: "Linear",
    });
    this.time.delayedCall(delayMs, () => {
      if (!outer.active || !inner.active) {
        return;
      }
      const slashRing = this.add.circle(x, y, radius + 8, 0xfca5a5, 0.35).setDepth(16);
      if (ownerId !== undefined) {
        this.registerBossTelegraph(ownerId, slashRing);
      }
      this.tweens.add({
        targets: slashRing,
        scale: 1.4,
        alpha: 0,
        duration: 180,
        ease: "Quad.Out",
        onComplete: () => slashRing.destroy(),
      });
      if (Phaser.Math.Distance.Between(x, y, this.player.sprite.x, this.player.sprite.y) <= radius) {
        this.damagePlayer(damage, "圆斩");
      }
      outer.destroy();
      inner.destroy();
    });
  }

  private spawnMiniFCloneFx(x: number, y: number): void {
    const ring = this.add.circle(x, y, 18, 0xfb7185, 0.24).setStrokeStyle(3, 0xfda4af, 1).setDepth(15);
    const ringOuter = this.add.circle(x, y, 26, 0xf43f5e, 0.12).setStrokeStyle(2, 0xf43f5e, 0.86).setDepth(15);
    this.tweens.add({
      targets: ring,
      scale: 2.6,
      alpha: 0,
      duration: 420,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: ringOuter,
      scale: 1.95,
      alpha: 0,
      duration: 520,
      ease: "Sine.Out",
      onComplete: () => ringOuter.destroy(),
    });
    const ghost = this.add.image(x, y, "enemy-emoji-miniF").setDisplaySize(54, 54).setAlpha(0.12).setDepth(16).setTint(0xfb7185);
    this.tweens.add({
      targets: ghost,
      alpha: 0.95,
      duration: 140,
      yoyo: true,
      repeat: 2,
      onComplete: () => ghost.destroy(),
    });
  }

  private spawnMiniFChargeFx(x: number, y: number, durationMs: number, radius: number, color: number): void {
    const ring = this.add.circle(x, y, radius, color, 0.08).setStrokeStyle(2, color, 0.9).setDepth(14);
    this.tweens.add({
      targets: ring,
      scale: 1.55,
      alpha: 0.75,
      duration: durationMs,
      ease: "Linear",
      onComplete: () => ring.destroy(),
    });
  }

  private spawnFinalShadowFx(x: number, y: number, ownerId?: number): void {
    const ring = this.add.circle(x, y, 18, 0xe9d5ff, 0.2).setStrokeStyle(2, 0xc4b5fd, 0.98).setDepth(15);
    const ghost = this.add.image(x, y, "enemy-emoji-final").setDisplaySize(62, 62).setAlpha(0.12).setDepth(16).setTint(0xc4b5fd);
    if (ownerId !== undefined) {
      this.registerBossTelegraph(ownerId, ring, ghost);
    }
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 520,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: ghost,
      alpha: 0.9,
      duration: 140,
      yoyo: true,
      repeat: 1,
      onComplete: () => ghost.destroy(),
    });
  }

  private spawnMiniFSectorChargeWarning(
    x: number,
    y: number,
    facingRad: number,
    delayMs: number,
    radius: number,
    spreadRad: number,
    damage: number,
    ownerId?: number,
  ): void {
    const half = spreadRad * 0.5;
    const start = facingRad - half;
    const end = facingRad + half;
    const warn = this.add.graphics().setDepth(15);
    if (ownerId !== undefined) {
      this.registerBossTelegraph(ownerId, warn);
    }
    const draw = (ratio: number) => {
      warn.clear();
      warn.fillStyle(0xfb7185, 0.16 + ratio * 0.22);
      warn.slice(x, y, radius * (0.55 + ratio * 0.45), start, end, false);
      warn.fillPath();
      warn.lineStyle(2, 0xfda4af, 0.88);
      warn.beginPath();
      warn.moveTo(x, y);
      warn.arc(x, y, radius, start, end, false);
      warn.closePath();
      warn.strokePath();
    };
    draw(0);
    const holder = { p: 0 };
    this.tweens.add({
      targets: holder,
      p: 1,
      duration: delayMs,
      ease: "Linear",
      onUpdate: () => draw(holder.p),
      onComplete: () => {
        warn.clear();
        warn.fillStyle(0xef4444, 0.35);
        warn.slice(x, y, radius, start, end, false);
        warn.fillPath();
        const dx = this.player.sprite.x - x;
        const dy = this.player.sprite.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist <= radius + 2) {
          const dir = Math.atan2(dy, dx);
          const delta = Math.abs(Phaser.Math.Angle.Wrap(dir - facingRad));
          if (delta <= half) {
            this.damagePlayer(damage, "横劈");
          }
        }
        this.time.delayedCall(90, () => warn.destroy());
      },
    });
  }

  private freezeEnemyProjectiles(): void {
    for (const projectile of this.enemyProjectiles) {
      if (!projectile.sprite.active) {
        continue;
      }
      const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      if (body === undefined) {
        continue;
      }
      projectile.sprite.setData("frozenVx", body.velocity.x);
      projectile.sprite.setData("frozenVy", body.velocity.y);
      body.setVelocity(0, 0);
    }
  }

  private unfreezeEnemyProjectiles(): void {
    for (const projectile of this.enemyProjectiles) {
      if (!projectile.sprite.active) {
        continue;
      }
      const body = projectile.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      if (body === undefined) {
        continue;
      }
      const vx = Number(projectile.sprite.getData("frozenVx") ?? 0);
      const vy = Number(projectile.sprite.getData("frozenVy") ?? 0);
      body.setVelocity(vx, vy);
      projectile.sprite.setData("frozenVx", 0);
      projectile.sprite.setData("frozenVy", 0);
    }
  }

  private forcePlayerToArenaEdge(): void {
    const cx = WORLD_SIZE / 2;
    const cy = WORLD_SIZE / 2;
    const angle = Phaser.Math.Angle.Between(cx, cy, this.player.sprite.x, this.player.sprite.y);
    const radius = Math.floor(WORLD_SIZE * 0.46);
    const px = Phaser.Math.Clamp(cx + Math.cos(angle) * radius, 20, WORLD_SIZE - 20);
    const py = Phaser.Math.Clamp(cy + Math.sin(angle) * radius, 20, WORLD_SIZE - 20);
    this.player.sprite.setPosition(px, py);
    this.player.syncVisual();
    this.cameras.main.shake(120, 0.0022);
  }

  private spawnFinalPylons(): void {
    this.clearFinalPylons();
    const margin = 84;
    const points = [
      { x: margin, y: margin },
      { x: WORLD_SIZE - margin, y: margin },
      { x: margin, y: WORLD_SIZE - margin },
      { x: WORLD_SIZE - margin, y: WORLD_SIZE - margin },
    ];
    for (const p of points) {
      const sprite = this.add.rectangle(p.x, p.y, 52, 52, 0x7c3aed, 0.8).setStrokeStyle(3, 0xc4b5fd, 0.95).setDepth(16);
      this.finalPylons.push({
        id: this.finalPylonId++,
        sprite,
        hp: 480,
        maxHp: 480,
      });
      this.spawnText(p.x, p.y - 38, "阵眼", "#ddd6fe", 13);
    }
  }

  private clearFinalPylons(): void {
    for (const p of this.finalPylons) {
      p.sprite.destroy();
    }
    this.finalPylons = [];
  }

  private clearAllNormalEnemiesInstant(): void {
    const remain: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.kind !== "normal") {
        remain.push(enemy);
        continue;
      }
      this.destroyMiniBossBar(enemy.id);
      this.destroyEliteFx(enemy.id);
      this.enemyBossAi.delete(enemy.id);
      this.enemyStatus.delete(enemy.id);
      enemy.destroy();
    }
    this.enemies = remain;
    gameEvents.emit("ui:toast", { text: "阵破：杂兵清场", color: "#93c5fd" });
  }

  private createMainASpotlight(ownerBossId: number, x: number, y: number, radius: number, mode: "roam" | "orbit", now: number): MainASpotlight {
    const circle = this.add.circle(x, y, radius, 0xfef08a, 0.12).setStrokeStyle(2, 0xfacc15, 0.85).setDepth(11);
    const label = this.add
      .text(x, y, "安全区", {
        color: "#fef08a",
        fontFamily: "Segoe UI",
        fontSize: "12px",
        fontStyle: "bold",
        stroke: "#020617",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(12);
    return {
      id: this.mainASpotlightId++,
      ownerBossId,
      circle,
      label,
      mode,
      radius,
      vx: Phaser.Math.Between(-66, 66),
      vy: Phaser.Math.Between(-66, 66),
      angle: Phaser.Math.FloatBetween(0, Math.PI * 2),
      orbitRadius: 150,
      orbitAngularSpeed: 0.95,
      centerX: x,
      centerY: y,
      nextWanderAt: now + Phaser.Math.Between(1200, 2000),
    };
  }

  private clearMainASpotlights(ownerBossId?: number): void {
    const remain: MainASpotlight[] = [];
    for (const light of this.mainASpotlights) {
      if (ownerBossId !== undefined && light.ownerBossId !== ownerBossId) {
        remain.push(light);
        continue;
      }
      light.circle.destroy();
      light.label.destroy();
    }
    this.mainASpotlights = remain;
  }

  private ensureMainASpotlights(enemy: Enemy, state: BossAiState, now: number): void {
    const myLights = this.mainASpotlights.filter((l) => l.ownerBossId === enemy.id);
    if (!state.enraged) {
      if (myLights.length >= 2) {
        return;
      }
      this.clearMainASpotlights(enemy.id);
      // Boss 出场：先在玩家脚下给安全区，再开始向 Boss 附近漫游
      const px = Phaser.Math.Clamp(this.player.sprite.x, 40, WORLD_SIZE - 40);
      const py = Phaser.Math.Clamp(this.player.sprite.y, 40, WORLD_SIZE - 40);
      for (let i = 0; i < 2; i += 1) {
        const light = this.createMainASpotlight(enemy.id, px, py, 220, "roam", now);
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const safeMin = light.radius + enemy.sprite.radius + 70;
        const radius = Phaser.Math.Between(Math.max(320, safeMin), Math.max(460, safeMin + 80));
        light.centerX = Phaser.Math.Clamp(enemy.sprite.x + Math.cos(angle) * radius, 40, WORLD_SIZE - 40);
        light.centerY = Phaser.Math.Clamp(enemy.sprite.y + Math.sin(angle) * radius, 40, WORLD_SIZE - 40);
        light.vx = Phaser.Math.Between(62, 78);
        light.vy = 0;
        light.nextWanderAt = now + Phaser.Math.Between(700, 980);
        this.mainASpotlights.push(light);
      }
      return;
    }
    this.clearMainASpotlights(enemy.id);
  }

  private updateMainASpotlights(now: number): void {
    if (this.mainASpotlights.length <= 0) {
      return;
    }
    if (!this.gameStarted || this.choicePaused || this.manualPaused) {
      return;
    }
    const dt = Math.max(0.001, this.game.loop.delta / 1000);
    const aliveMainAMap = new Map<number, Enemy>();
    for (const e of this.enemies) {
      if (!e.isDead && e.variant === "mainA") {
        aliveMainAMap.set(e.id, e);
      }
    }
    const remain: MainASpotlight[] = [];
    for (const light of this.mainASpotlights) {
      const owner = aliveMainAMap.get(light.ownerBossId);
      if (owner === undefined || !light.circle.active || !light.label.active) {
        light.circle.destroy();
        light.label.destroy();
        continue;
      }
      const needRetarget =
        now >= light.nextWanderAt ||
        Phaser.Math.Distance.Between(light.circle.x, light.circle.y, light.centerX, light.centerY) <= 22;
      if (needRetarget) {
        const hardMin = light.radius + owner.sprite.radius + 64;
        const nearMinBase = owner.kind === "mainBoss" && this.enemyBossAi.get(owner.id)?.enraged ? 260 : 320;
        const nearMaxBase = owner.kind === "mainBoss" && this.enemyBossAi.get(owner.id)?.enraged ? 380 : 520;
        const nearMin = Math.max(nearMinBase, hardMin);
        const nearMax = Math.max(nearMaxBase, nearMin + 80);
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const radius = Phaser.Math.Between(nearMin, nearMax);
        light.centerX = Phaser.Math.Clamp(owner.sprite.x + Math.cos(angle) * radius, 40, WORLD_SIZE - 40);
        light.centerY = Phaser.Math.Clamp(owner.sprite.y + Math.sin(angle) * radius, 40, WORLD_SIZE - 40);
        light.vx = Phaser.Math.Between(58, 76);
        light.nextWanderAt = now + Phaser.Math.Between(760, 1280);
      }

      const dx = light.centerX - light.circle.x;
      const dy = light.centerY - light.circle.y;
      const len = Math.hypot(dx, dy);
      const speed = Math.max(48, light.vx);
      const step = Math.min(len, speed * dt);
      const nx = len > 0.001 ? light.circle.x + (dx / len) * step : light.circle.x;
      const ny = len > 0.001 ? light.circle.y + (dy / len) * step : light.circle.y;
      let finalX = nx;
      let finalY = ny;
      const bossDx = finalX - owner.sprite.x;
      const bossDy = finalY - owner.sprite.y;
      const bossDist = Math.hypot(bossDx, bossDy);
      const noOverlapDist = light.radius + owner.sprite.radius + 24;
      if (bossDist < noOverlapDist && bossDist > 0.001) {
        const push = noOverlapDist - bossDist;
        finalX = Phaser.Math.Clamp(finalX + (bossDx / bossDist) * push, 40, WORLD_SIZE - 40);
        finalY = Phaser.Math.Clamp(finalY + (bossDy / bossDist) * push, 40, WORLD_SIZE - 40);
      }
      light.circle.setPosition(finalX, finalY);
      light.label.setPosition(finalX, finalY - Math.max(18, light.radius * 0.18));
      const pulse = 0.08 + Math.abs(Math.sin((now + light.id * 37) * 0.007)) * 0.18;
      light.circle.setAlpha(pulse);
      light.label.setAlpha(0.72 + pulse * 0.8);
      remain.push(light);
    }
    this.mainASpotlights = remain;
  }

  private updateDarkZonePunish(now: number): void {
    if (!this.gameStarted || this.player.isDead || this.choicePaused || this.manualPaused) {
      return;
    }
    const hasMainA = this.enemies.some((e) => !e.isDead && e.variant === "mainA");
    if (!hasMainA || this.mainASpotlights.length <= 0) {
      return;
    }
    if (now < this.lastDarkZonePunishAt + 500) {
      return;
    }
    this.lastDarkZonePunishAt = now;
    const insideAny = this.mainASpotlights.some((light) => Phaser.Math.Distance.Between(light.circle.x, light.circle.y, this.player.sprite.x, this.player.sprite.y) <= light.radius);
    if (!insideAny) {
      this.damagePlayer(5, "暗区");
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 34, "暗区 -5", "#fca5a5", 11);
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
    armDelayMs = 0,
  ): void {
    const circle = this.add.circle(x, y, radius, 0x16a34a, 0.16).setStrokeStyle(2, 0x4ade80, 0.9).setDepth(13);
    const text = this.add
      .text(x, y, label, {
        color: "#86efac",
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
      nextDamageAt: this.time.now + Math.max(0, armDelayMs),
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
        this.damagePlayer(hazard.damage, "区域");
      }
      hazard.nextDamageAt = now + hazard.damageIntervalMs;
    }
    this.bossHazards = this.bossHazards.filter((hazard) => hazard.circle.active && now < hazard.expiresAt);
  }

  private spawnBossSlowZone(x: number, y: number, radius: number, lifeMs: number, slowMul: number): void {
    const circle = this.add.circle(x, y, radius, 0xfacc15, 0.16).setStrokeStyle(2, 0xfde047, 0.92).setDepth(13);
    const label = this.add
      .text(x, y, "减速区", {
        color: "#fde68a",
        fontFamily: "Segoe UI",
        fontSize: "11px",
        fontStyle: "bold",
        stroke: "#020617",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(14);
    this.bossSlowZones.push({
      id: this.bossSlowZoneId++,
      circle,
      label,
      expiresAt: this.time.now + lifeMs,
      slowMul: Phaser.Math.Clamp(slowMul, 0.3, 0.95),
    });
  }

  private updateBossSlowZones(now: number): void {
    if (this.bossSlowZones.length <= 0) {
      return;
    }
    for (const zone of this.bossSlowZones) {
      if (now >= zone.expiresAt || !zone.circle.active) {
        zone.circle.destroy();
        zone.label.destroy();
        continue;
      }
      const pulse = 0.1 + Math.abs(Math.sin((now + zone.id * 47) * 0.01)) * 0.16;
      zone.circle.setAlpha(pulse);
    }
    this.bossSlowZones = this.bossSlowZones.filter((zone) => zone.circle.active && zone.label.active && now < zone.expiresAt);
  }

  private getBossSlowMultiplier(now: number): number {
    if (this.bossSlowZones.length <= 0 || !this.gameStarted || this.choicePaused || this.manualPaused || this.player.isDead) {
      return 1;
    }
    let mul = 1;
    for (const zone of this.bossSlowZones) {
      if (!zone.circle.active || now >= zone.expiresAt) {
        continue;
      }
      const dist = Phaser.Math.Distance.Between(zone.circle.x, zone.circle.y, this.player.sprite.x, this.player.sprite.y);
      if (dist <= zone.circle.radius) {
        mul = Math.min(mul, zone.slowMul);
      }
    }
    return mul;
  }

  private applyMainBGravityField(): void {
    const mainB = this.enemies.find((enemy) => !enemy.isDead && enemy.variant === "mainB");
    if (mainB === undefined) {
      return;
    }
    const state = this.enemyBossAi.get(mainB.id);
    const force = state?.gravityForce ?? 0;
    if (Math.abs(force) < 0.001) {
      return;
    }
    const dt = Math.max(0.001, this.game.loop.delta / 1000);
    const dist = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, mainB.sprite.x, mainB.sprite.y);
    if (dist <= 0.001) {
      return;
    }
    const ux = (mainB.sprite.x - this.player.sprite.x) / dist;
    const uy = (mainB.sprite.y - this.player.sprite.y) / dist;
    const step = Math.abs(force) * dt;
    const sign = force >= 0 ? 1 : -1;
    const nx = Phaser.Math.Clamp(this.player.sprite.x + ux * step * sign, 20, WORLD_SIZE - 20);
    const ny = Phaser.Math.Clamp(this.player.sprite.y + uy * step * sign, 20, WORLD_SIZE - 20);
    this.player.sprite.setPosition(nx, ny);
    this.player.syncVisual();
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

  private spawnEnemyNear(x: number, y: number, kind: EnemyKind): Enemy | undefined {
    if (this.enemies.length >= MAX_ENEMIES) {
      return undefined;
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
    return enemy;
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
    if (status === undefined) {
      return enemy.moveSpeed;
    }
    const freezeFactor = now < status.freezeUntil ? 1 - status.freezeSlow : 1;
    const hitFactor = now < status.hitSlowUntil ? status.hitSlowFactor : 1;
    return Math.max(25, enemy.moveSpeed * freezeFactor * hitFactor);
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

      if (status.flameTicksLeft > 0 && now >= status.flameNextTickAt) {
        status.flameTicksLeft = Math.max(0, status.flameTicksLeft - 1);
        status.flameNextTickAt = now + 200;
        this.dealStatusDamage(enemy, status.flameTickDamage, "#fb923c");
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
      if (now >= status.hitSlowUntil) {
        status.hitSlowFactor = 1;
      }

      const inactive =
        status.burnPower <= 0 &&
        status.flameTicksLeft <= 0 &&
        status.poisonStacks <= 0 &&
        now >= status.freezeUntil &&
        now >= status.hitSlowUntil;
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

    const range = 160 + rangeLv * 24;
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
      const damage = this.player.stats.damage * (0.12 + rangeLv * 0.03);
      this.dealStatusDamage(enemy, damage, "#fb923c");
      this.applyFlamethrowerDot(enemy, now);
      if (hitCount >= 8) {
        break;
      }
    }
    if (hitCount > 0) {
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 34, "喷火器", "#fb923c", 11);
    }
  }

  private playFlamethrowerEffect(range: number): void {
    const wave = this.add.circle(this.player.sprite.x, this.player.sprite.y, 26, 0xfb923c, 0.3).setDepth(15);
    wave.setStrokeStyle(3, 0xf97316, 0.95);
    this.tweens.add({
      targets: wave,
      radius: range,
      alpha: 0,
      duration: 280,
      ease: "Quad.Out",
      onComplete: () => wave.destroy(),
    });
    for (let i = 0; i < 16; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spark = this.add.circle(this.player.sprite.x, this.player.sprite.y, Phaser.Math.Between(4, 7), 0xf97316, 0.9).setDepth(15);
      this.tweens.add({
        targets: spark,
        x: this.player.sprite.x + Math.cos(angle) * Phaser.Math.Between(Math.floor(range * 0.45), Math.floor(range * 0.85)),
        y: this.player.sprite.y + Math.sin(angle) * Phaser.Math.Between(Math.floor(range * 0.45), Math.floor(range * 0.85)),
        alpha: 0,
        duration: 300,
        ease: "Quad.Out",
        onComplete: () => spark.destroy(),
      });
    }
  }

  private applyFlamethrowerDot(enemy: Enemy, now: number): void {
    const status = this.enemyStatus.get(enemy.id) ?? {
      burnUntil: 0,
      burnNextTickAt: 0,
      burnPower: 0,
      flameTicksLeft: 0,
      flameTickDamage: 0,
      flameNextTickAt: 0,
      poisonUntil: 0,
      poisonNextTickAt: 0,
      poisonStacks: 0,
      poisonPower: 0,
      freezeUntil: 0,
      freezeSlow: 0,
      hitSlowUntil: 0,
      hitSlowFactor: 1,
    };
    const totalDot = Math.max(10, Math.round(this.player.stats.damage * this.getCurrentDamageMultiplier(now) * 0.62));
    const tickDamage = Math.max(1, Math.round(totalDot / 10));
    status.flameTicksLeft = 10;
    status.flameTickDamage = Math.max(status.flameTickDamage, tickDamage);
    status.flameNextTickAt = now + 200;
    this.enemyStatus.set(enemy.id, status);
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
      flameTicksLeft: 0,
      flameTickDamage: 0,
      flameNextTickAt: 0,
      poisonUntil: 0,
      poisonNextTickAt: 0,
      poisonStacks: 0,
      poisonPower: 0,
      freezeUntil: 0,
      freezeSlow: 0,
      hitSlowUntil: 0,
      hitSlowFactor: 1,
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
    let chainDelay = 0;
    for (let i = 0; i < chainCount; i += 1) {
      const target = this.findNearestEnemyInRange(fromX, fromY, range, hit);
      if (target === undefined) {
        break;
      }
      hit.add(target.id);
      const startX = fromX;
      const startY = fromY;
      const targetX = target.sprite.x;
      const targetY = target.sprite.y;
      const targetRef = target;
      this.time.delayedCall(chainDelay, () => {
        if (!targetRef.sprite.active || targetRef.isDead) {
          return;
        }
        const dealt = targetRef.damage(damage);
        if (dealt <= 0) {
          return;
        }
        const now = this.time.now;
        this.evolutionBehaviorState.damage_dealt = (this.evolutionBehaviorState.damage_dealt ?? 0) + dealt;
        this.spawnDamageText(targetRef.sprite.x, targetRef.sprite.y - targetRef.sprite.radius - 8, dealt, "#a5b4fc");
        const bolt = this.add.line(0, 0, startX, startY, targetX, targetY, 0x93c5fd, 0.98).setOrigin(0, 0);
        bolt.setLineWidth(3.2, 2.2);
        const spark = this.add.circle(targetX, targetY, 9, 0xa5f3fc, 0.62);
        spark.setStrokeStyle(1, 0xe0f2fe, 0.95);
        this.tweens.add({
          targets: [bolt, spark],
          alpha: 0,
          duration: 110,
          ease: "Quad.easeOut",
          onComplete: () => {
            bolt.destroy();
            spark.destroy();
          },
        });
        if (now - this.lastLightningSfxAt > 22) {
          this.playSfx("sfx_lightning", 0.68, Phaser.Math.FloatBetween(0.96, 1.05));
          this.lastLightningSfxAt = now;
        }
      });
      fromX = targetX;
      fromY = targetY;
      chainDelay += 72;
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
    const interval = 1000 / (this.player.stats.fireRate * this.getCurrentFireRateMultiplier(now));
    if (now < this.lastFireAt + interval) {
      return;
    }
    const target = this.findNearestEnemy(this.player.sprite.x, this.player.sprite.y);
    if (target === undefined) {
      return;
    }

    this.lastFireAt = now;
    this.currentAmmo -= 1;
    if (now - this.lastShootSfxAt > 60) {
      this.playSfx("sfx_shoot", 0.18);
      this.lastShootSfxAt = now;
    }
    if (this.passive.bloodTriggerChance > 0 && Math.random() < this.passive.bloodTriggerChance) {
      if (this.player.stats.health > 1) {
        this.damagePlayer(1, "血契扳机");
      }
      if (this.player.isDead) {
        return;
      }
    }
    this.firePlayerVolley(now, target, 0);
    if (Math.random() < this.characterExtraShotChance) {
      this.time.delayedCall(80, () => {
        if (this.player.isDead || !this.gameStarted || this.choicePaused) {
          return;
        }
        const followTarget = this.findNearestEnemy(this.player.sprite.x, this.player.sprite.y);
        if (followTarget === undefined) {
          return;
        }
        this.playSfx("sfx_shoot", 0.14);
        this.firePlayerVolley(this.time.now, followTarget, Phaser.Math.DegToRad(1.8));
      });
    }

    while (this.bullets.length > MAX_BULLETS) {
      const oldest = this.bullets.shift();
      oldest?.sprite.destroy();
    }

    if (this.currentAmmo <= 0) {
      this.startReload("弹夹打空，自动换弹");
    }
  }

  private firePlayerVolley(now: number, target: Enemy, angleOffset: number): void {
    const baseAngle =
      Phaser.Math.Angle.Between(
        this.player.sprite.x,
        this.player.sprite.y,
        target.sprite.x,
        target.sprite.y,
      ) + angleOffset;
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
      const damage = baseDamage * this.getCurrentDamageMultiplier(now) * this.player.stats.bulletDamageMul;
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
      body.setVelocity(Math.cos(angle) * projectileSpeed, Math.sin(angle) * projectileSpeed);
      this.bullets.push(bullet);
    }
  }

  private resolveBulletHits(): void {
    const now = this.time.now;
    for (const bullet of this.bullets) {
      if (!bullet.sprite.active) {
        continue;
      }
      for (const pylon of this.finalPylons) {
        if (!pylon.sprite.active) {
          continue;
        }
        const hitDistance = Math.max(pylon.sprite.width, pylon.sprite.height) * 0.5 + bullet.sprite.radius;
        const distance = Phaser.Math.Distance.Between(bullet.sprite.x, bullet.sprite.y, pylon.sprite.x, pylon.sprite.y);
        if (distance > hitDistance) {
          continue;
        }
        pylon.hp -= bullet.damage;
        bullet.hitEnemyIds.add(-10000 - pylon.id);
        this.spawnDamageText(pylon.sprite.x, pylon.sprite.y - 30, Math.max(1, Math.round(bullet.damage)), "#c4b5fd");
        if (pylon.hp <= 0) {
          this.spawnHitParticles(pylon.sprite.x, pylon.sprite.y, 0xc4b5fd, 10);
          pylon.sprite.destroy();
        }
      }
      this.finalPylons = this.finalPylons.filter((p) => p.sprite.active && p.hp > 0);
      for (const enemy of this.enemies) {
        if (enemy.isDead) {
          continue;
        }
        if (enemy.variant === "final") {
          const ai = this.enemyBossAi.get(enemy.id);
          if (ai?.finalInvulnerable) {
            continue;
          }
        }
        if (bullet.hitEnemyIds.has(enemy.id)) {
          continue;
        }
        const hitDistance = enemy.sprite.radius + bullet.sprite.radius;
        const distance = Phaser.Math.Distance.Between(bullet.sprite.x, bullet.sprite.y, enemy.sprite.x, enemy.sprite.y);
        if (distance > hitDistance) {
          continue;
        }

        const bossMul = enemy.kind === "normal" ? 1 : 1;
        const ai = this.enemyBossAi.get(enemy.id);
        const hitDamage = this.devOneHitKill ? this.getOneHitDamageWithPhaseGuard(enemy, ai) : bullet.damage * bossMul;
        const dealt = enemy.damage(hitDamage);
        bullet.hitEnemyIds.add(enemy.id);
        if (dealt > 0) {
          if (now - this.lastEnemyHitSfxAt > 18) {
            this.playSfx("sfx_hit", 0.62, Phaser.Math.FloatBetween(0.94, 1.08));
            this.lastEnemyHitSfxAt = now;
          }
          this.evolutionBehaviorState.damage_dealt = (this.evolutionBehaviorState.damage_dealt ?? 0) + dealt;
          if (bullet.isCrit) {
            this.evolutionBehaviorState.crit_hits = (this.evolutionBehaviorState.crit_hits ?? 0) + 1;
          }
          this.tryApplyElementStatuses(enemy, dealt, now);
          if (enemy.kind === "normal") {
            const status = this.enemyStatus.get(enemy.id) ?? {
              burnUntil: 0,
              burnNextTickAt: 0,
              burnPower: 0,
              flameTicksLeft: 0,
              flameTickDamage: 0,
              flameNextTickAt: 0,
              poisonUntil: 0,
              poisonNextTickAt: 0,
              poisonStacks: 0,
              poisonPower: 0,
              freezeUntil: 0,
              freezeSlow: 0,
              hitSlowUntil: 0,
              hitSlowFactor: 1,
            };
            const hitOrder = bullet.hitEnemyIds.size;
            if (hitOrder <= 3) {
              const baseByOrder = hitOrder === 1 ? 0.62 : hitOrder === 2 ? 0.76 : 0.88;
              const factor = bullet.isCrit ? Math.max(0.5, baseByOrder - 0.08) : baseByOrder;
              status.hitSlowUntil = Math.max(status.hitSlowUntil, now + 170);
              status.hitSlowFactor = Math.min(status.hitSlowFactor, factor);
            }
            this.enemyStatus.set(enemy.id, status);
          }
          this.flashHit(enemy.visual, 70, enemy.eliteTintColor);
          this.bumpEnemyOnHit(enemy, bullet.isCrit);
          this.spawnDamageText(
            enemy.sprite.x,
            enemy.sprite.y - 16,
            dealt,
            bullet.sprite.fillColor === 0xfbbf24 ? "#fde68a" : "#fecaca",
          );
          this.spawnHitParticles(enemy.sprite.x, enemy.sprite.y, bullet.isCrit ? 0xfde68a : 0xb6f0ff, bullet.isCrit ? 8 : 4);
        }
        if (bullet.hitEnemyIds.size > 1) {
          this.evolutionBehaviorState.enemies_pierced = (this.evolutionBehaviorState.enemies_pierced ?? 0) + 1;
        }
      }
    }
  }

  private getOneHitDamageWithPhaseGuard(enemy: Enemy, ai?: BossAiState): number {
    // 小怪保持原有一击秒杀。
    if (enemy.kind === "normal") {
      return enemy.health + 99999;
    }

    // Final Boss 特判：
    // 1) 前两命：一击打掉一整命；
    // 2) 最后一命：优先压到 30% 转阶段线（不是直接秒）。
    if (enemy.kind === "finalBoss" || enemy.variant === "final") {
      const lives = ai?.finalLives ?? 3;
      const phase = ai?.finalPhase ?? 1;
      if (lives > 1) {
        return enemy.health + 99999;
      }
      const transitionHp = Math.max(1, enemy.maxHealth * 0.3);
      if (phase < 4 && enemy.health > transitionHp) {
        return Math.max(1, enemy.health - transitionHp);
      }
      return enemy.health + 99999;
    }

    // 其他 Boss：
    // 普通阶段一击压到狂暴阈值；狂暴阶段可直接秒。
    if (ai?.enraged) {
      return enemy.health + 99999;
    }
    const ratio = this.getBossEnrageThresholdRatio(enemy.variant);
    if (ratio <= 0) {
      return enemy.health + 99999;
    }
    const thresholdHp = Math.max(1, enemy.maxHealth * ratio);
    if (enemy.health > thresholdHp) {
      return Math.max(1, enemy.health - thresholdHp);
    }
    return enemy.health + 99999;
  }

  private getBossEnrageThresholdRatio(variant: EnemyVariant): number {
    if (variant === "miniA") return 0.5;
    if (variant === "miniB") return 0.5;
    if (variant === "miniC") return 0.4;
    if (variant === "miniD") return 0.5;
    if (variant === "miniE") return 0.45;
    if (variant === "miniF") return 0.5;
    if (variant === "mainA") return 0.5;
    if (variant === "mainB") return 0.5;
    if (variant === "final") return 0.5;
    return 0;
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
      this.damagePlayer(20, "碰撞");
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
      this.damagePlayer(10, "弹幕");
    }
  }

  private damagePlayer(amount: number, source: string): void {
    if (this.devGodMode) {
      return;
    }
    if (this.time.now < this.passive.invincibleUntil) {
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 30, "无敌", "#93c5fd", 12);
      return;
    }

    const now = this.time.now;
    const wouldDie = this.player.stats.health <= amount;
    const canDefyDeath =
      this.passive.deathDefyCooldownMs > 0 &&
      now >= this.passive.deathDefyNextReadyAt &&
      wouldDie;
    if (canDefyDeath) {
      this.player.stats.health = 1;
      this.passive.deathDefyNextReadyAt = now + this.passive.deathDefyCooldownMs;
      this.passive.invincibleUntil = now + this.passive.deathDefyInvincibleMs;
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 30, "不屈触发", "#fde68a", 13);
      this.triggerPainRush(now);
      this.refreshPassiveDetails();
      return;
    }

    const dealt = this.player.damage(amount);
    if (dealt > 0) {
      this.flashHit(this.player.visual, 110);
      this.player.visual.setTint(0xef4444);
      this.time.delayedCall(120, () => {
        if (this.player.visual.active) {
          this.player.visual.clearTint();
        }
      });
      // Global hit i-frame: every valid hit grants 0.5s invulnerability.
      this.passive.invincibleUntil = Math.max(this.passive.invincibleUntil, now + 500);
      this.spawnDamageText(this.player.sprite.x, this.player.sprite.y - 18, dealt, "#fef08a");
      if (source === "血契扳机") {
        this.spawnText(this.player.sprite.x, this.player.sprite.y - 36, "血契 -1", "#fb7185", 11);
      }
      this.triggerPainRush(now);
      this.refreshPassiveDetails();
      this.cameras.main.shake(60, 0.0017);
    }
    if (this.player.isDead) {
      if (!this.gameFinished) {
        this.gameFinished = true;
        this.gameStarted = false;
        this.setChoicePaused(true);
        gameEvents.emit("ui:showGameOver", {
          elapsedSec: Math.floor((this.time.now - this.runStartedAt) / 1000),
          canRevive: !this.reviveUsed,
        });
      }
    }
  }

  private startBgmIfNeeded(): void {
    this.ensureAudioUnlocked();
    if (this.bgm?.isPlaying) {
      return;
    }
    this.bgm = this.sound.add("bgm_loop", { loop: true, volume: this.bgmVolume });
    this.bgm?.play();
  }

  private activateDevMode(): void {
    this.devModeEnabled = true;
    this.devAutoSpawnEnabled = false;
    this.pendingBossStep = undefined;
    this.pendingBossSpawnAt = 0;
    this.pendingPlayerUpgrades = 0;
    this.activeUpgradeChoices = [];
    this.setChoicePaused(false);
    gameEvents.emit("ui:toast", { text: "开发者模式已开启", color: "#facc15" });
    gameEvents.emit("dev:state", { autoSpawn: this.devAutoSpawnEnabled, godMode: this.devGodMode, oneHitKill: this.devOneHitKill });
    this.emitDevUpgradeLevels();
    this.emitDevSkillState();
  }

  private devSpawnNormals(count: number): void {
    if (!this.devModeEnabled) {
      return;
    }
    const cap = Math.max(0, MAX_ENEMIES - this.enemies.length);
    const want = Phaser.Math.Clamp(Math.floor(count), 1, 400);
    const spawnCount = Math.min(want, cap);
    for (let i = 0; i < spawnCount; i += 1) {
      this.spawnEnemy("normal");
    }
    gameEvents.emit("ui:toast", { text: `已召唤 ${spawnCount} 只小怪`, color: "#93c5fd" });
  }

  private devClearAllEnemies(): void {
    if (!this.devModeEnabled) {
      return;
    }
    let removed = 0;
    for (const enemy of this.enemies) {
      removed += 1;
      this.destroyMiniBossBar(enemy.id);
      const eliteFx = this.enemyEliteFx.get(enemy.id);
      eliteFx?.aura.destroy();
      eliteFx?.mark.destroy();
      this.enemyEliteFx.delete(enemy.id);
      this.enemyStatus.delete(enemy.id);
      this.enemyBossAi.delete(enemy.id);
      enemy.destroy();
    }
    this.enemies = [];
    for (const projectile of this.enemyProjectiles) {
      projectile.sprite.destroy();
    }
    this.enemyProjectiles = [];
    for (const hazard of this.bossHazards) {
      hazard.circle.destroy();
      hazard.label.destroy();
    }
    this.bossHazards = [];
    for (const zone of this.bossSlowZones) {
      zone.circle.destroy();
      zone.label.destroy();
    }
    this.bossSlowZones = [];
    for (const marker of this.bossGuideMarkers.values()) {
      marker.arrow.destroy();
      marker.label.destroy();
    }
    this.bossGuideMarkers.clear();
    this.clearFinalPylons();
    this.clearMainASpotlights();
    gameEvents.emit("ui:toast", { text: `已清除 ${removed} 只敌人`, color: "#93c5fd" });
  }

  private devSpawnBoss(variant: EnemyVariant): void {
    if (!this.devModeEnabled) {
      return;
    }
    if (variant.startsWith("mini")) {
      this.spawnEnemy("miniBoss", variant);
    } else if (variant.startsWith("main")) {
      this.spawnEnemy("mainBoss", variant);
    } else if (variant === "final") {
      this.spawnEnemy("finalBoss", "final");
    } else {
      return;
    }
    gameEvents.emit("ui:toast", { text: `已召唤 ${variant}`, color: "#fda4af" });
  }

  private devHealFull(): void {
    if (!this.devModeEnabled) {
      return;
    }
    this.player.stats.health = this.player.stats.maxHealth;
    gameEvents.emit("ui:toast", { text: "生命已回满", color: "#86efac" });
  }

  private devToggleGodMode(): void {
    if (!this.devModeEnabled) {
      return;
    }
    this.devGodMode = !this.devGodMode;
    gameEvents.emit("ui:toast", { text: this.devGodMode ? "无敌模式：开启" : "无敌模式：关闭", color: "#fde68a" });
    gameEvents.emit("dev:state", { autoSpawn: this.devAutoSpawnEnabled, godMode: this.devGodMode, oneHitKill: this.devOneHitKill });
  }

  private devToggleOneHitKill(): void {
    if (!this.devModeEnabled) {
      return;
    }
    this.devOneHitKill = !this.devOneHitKill;
    gameEvents.emit("ui:toast", { text: this.devOneHitKill ? "一击必杀：开启" : "一击必杀：关闭", color: "#fda4af" });
    gameEvents.emit("dev:state", { autoSpawn: this.devAutoSpawnEnabled, godMode: this.devGodMode, oneHitKill: this.devOneHitKill });
  }

  private devSetUpgradeLevel(upgradeId: string, level: number): void {
    if (!this.devModeEnabled) {
      return;
    }
    const id = upgradeId.trim();
    const target = Phaser.Math.Clamp(Math.floor(level), 0, 5);
    const current = this.upgradeLevels.get(id) ?? 0;
    const delta = target - current;
    if (delta === 0) {
      gameEvents.emit("ui:toast", { text: `${id} 已是 Lv.${target}`, color: "#93c5fd" });
      return;
    }
    const applyDelta = (fn: () => void, times: number) => {
      for (let i = 0; i < times; i += 1) {
        fn();
      }
    };
    const s = this.player.stats;
    if (delta > 0) {
      if (id === "damage_up") applyDelta(() => (s.bulletDamageMul *= 1.15), delta);
      else if (id === "fire_rate") applyDelta(() => (s.fireRate += 0.4), delta);
      else if (id === "projectile_count") applyDelta(() => (s.projectileCount += 1), delta);
      else if (id === "projectile_size") applyDelta(() => (s.projectileSize += 1.5), delta);
      else if (id === "move_speed") applyDelta(() => (s.moveSpeed += 14), delta);
      else if (id === "pickup_range") applyDelta(() => (s.pickupRadius += 34), delta);
      else if (id === "max_ammo") applyDelta(() => (s.maxAmmo += 2), delta);
      else if (id === "reload_speed") applyDelta(() => (s.reloadMs = Math.max(1000, s.reloadMs - 200)), delta);
      else {
        gameEvents.emit("ui:toast", { text: `未知升级ID: ${id}`, color: "#fca5a5" });
        return;
      }
    } else {
      const back = Math.abs(delta);
      if (id === "damage_up") applyDelta(() => (s.bulletDamageMul = Math.max(0.35, s.bulletDamageMul / 1.15)), back);
      else if (id === "fire_rate") applyDelta(() => (s.fireRate = Math.max(1, s.fireRate - 0.4)), back);
      else if (id === "projectile_count") applyDelta(() => (s.projectileCount = Math.max(1, s.projectileCount - 1)), back);
      else if (id === "projectile_size") applyDelta(() => (s.projectileSize = Math.max(5, s.projectileSize - 1.5)), back);
      else if (id === "move_speed") applyDelta(() => (s.moveSpeed = Math.max(190, s.moveSpeed - 14)), back);
      else if (id === "pickup_range") applyDelta(() => (s.pickupRadius = Math.max(68, s.pickupRadius - 34)), back);
      else if (id === "max_ammo") applyDelta(() => (s.maxAmmo = Math.max(8, s.maxAmmo - 2)), back);
      else if (id === "reload_speed") applyDelta(() => (s.reloadMs = Math.min(2000, s.reloadMs + 200)), back);
      else {
        gameEvents.emit("ui:toast", { text: `未知升级ID: ${id}`, color: "#fca5a5" });
        return;
      }
    }
    if (id === "max_ammo") {
      this.currentAmmo = Math.min(this.currentAmmo, s.maxAmmo);
    }
    this.upgradeLevels.set(id, target);
    gameEvents.emit("ui:toast", { text: `${id} -> Lv.${target}`, color: "#93c5fd" });
    gameEvents.emit("dev:upgradeLevel", { upgradeId: id, level: target });
  }

  private devAdjustUpgradeLevel(upgradeId: string, delta: number): void {
    if (!this.devModeEnabled) {
      return;
    }
    const id = upgradeId.trim();
    const current = this.upgradeLevels.get(id) ?? 0;
    const target = Phaser.Math.Clamp(current + Math.floor(delta), 0, 5);
    this.devSetUpgradeLevel(id, target);
  }

  private emitDevUpgradeLevels(): void {
    gameEvents.emit("dev:upgradeLevels", {
      damage_up: this.upgradeLevels.get("damage_up") ?? 0,
      fire_rate: this.upgradeLevels.get("fire_rate") ?? 0,
      projectile_count: this.upgradeLevels.get("projectile_count") ?? 0,
      projectile_size: this.upgradeLevels.get("projectile_size") ?? 0,
      move_speed: this.upgradeLevels.get("move_speed") ?? 0,
      pickup_range: this.upgradeLevels.get("pickup_range") ?? 0,
      max_ammo: this.upgradeLevels.get("max_ammo") ?? 0,
      reload_speed: this.upgradeLevels.get("reload_speed") ?? 0,
    });
  }

  private emitDevSkillState(): void {
    gameEvents.emit("dev:skillState", {
      unlocked: { ...this.skillUnlocked },
      levels: {
        flamethrower: { ...this.skillNodeLevels.flamethrower },
        lightning_bug: { ...this.skillNodeLevels.lightning_bug },
        poison_orb: { ...this.skillNodeLevels.poison_orb },
        frost_core: { ...this.skillNodeLevels.frost_core },
      },
    });
  }

  private devSetSkillUnlock(kind: SkillKind, enabled: boolean): void {
    if (!this.devModeEnabled) {
      return;
    }
    this.skillUnlocked[kind] = enabled;
    if (!enabled) {
      this.skillNodeLevels[kind].a = 0;
      this.skillNodeLevels[kind].b = 0;
    }
    this.recomputeElementBonuses();
    this.emitDevSkillState();
    gameEvents.emit("ui:toast", {
      text: `${this.getSkillDisplayName(kind)} ${enabled ? "已解锁" : "已关闭"}`,
      color: enabled ? "#93c5fd" : "#cbd5e1",
    });
  }

  private devAdjustSkillNode(kind: SkillKind, node: SkillNode, delta: number): void {
    if (!this.devModeEnabled) {
      return;
    }
    if (!this.skillUnlocked[kind]) {
      this.skillUnlocked[kind] = true;
    }
    const current = this.skillNodeLevels[kind][node];
    const next = Phaser.Math.Clamp(current + Math.floor(delta), 0, 5);
    this.skillNodeLevels[kind][node] = next;
    this.recomputeElementBonuses();
    this.emitDevSkillState();
  }

  private playSfx(key: string, volume: number, rate = 1): void {
    this.ensureAudioUnlocked();
    if (this.sound.get(key) == null && !this.cache.audio.exists(key)) {
      return;
    }
    this.sound.play(key, { volume: volume * this.sfxVolume, rate });
  }

  private ensureAudioUnlocked(): void {
    if (this.audioUnlocked) {
      return;
    }
    try {
      if ("unlock" in this.sound && typeof (this.sound as unknown as { unlock: () => void }).unlock === "function") {
        (this.sound as unknown as { unlock: () => void }).unlock();
      }
      const soundAny = this.sound as unknown as { context?: AudioContext };
      const ctx = soundAny.context;
      if (ctx != null && ctx.state !== "running") {
        void ctx.resume();
      }
      this.audioUnlocked = true;
    } catch {
      // Ignore and retry on next user gesture.
    }
  }

  private setAudioLevels(bgm?: number, sfx?: number): void {
    if (bgm !== undefined) {
      this.bgmVolume = Phaser.Math.Clamp(bgm, 0, 1);
      if (this.bgm != null) {
        const bgmAny = this.bgm as unknown as { setVolume?: (v: number) => void; volume?: number };
        if (typeof bgmAny.setVolume === "function") {
          bgmAny.setVolume(this.bgmVolume);
        } else if (typeof bgmAny.volume === "number") {
          bgmAny.volume = this.bgmVolume;
        }
      }
    }
    if (sfx !== undefined) {
      this.sfxVolume = Phaser.Math.Clamp(sfx, 0, 1);
    }
    gameEvents.emit("audio:state", { bgm: this.bgmVolume, sfx: this.sfxVolume });
  }

  private tryReviveByCode(): void {
    if (this.reviveUsed || !this.player.isDead) {
      return;
    }
    this.reviveUsed = true;
    this.player.isDead = false;
    this.player.sprite.setVisible(true);
    this.player.visual.setVisible(true);
    this.player.stats.health = Math.max(1, Math.floor(this.player.stats.maxHealth * 0.5));
    this.player.setVelocity(0, 0);
    this.passive.invincibleUntil = Math.max(this.passive.invincibleUntil, this.time.now + 2200);
    this.gameFinished = false;
    this.gameStarted = true;
    this.setChoicePaused(false);
    this.refreshPassiveDetails();
    gameEvents.emit("ui:toast", { text: "神秘代码生效：原地复活", color: "#86efac" });
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

  private collectItemDrops(): void {
    const collected = new Set<ItemDrop>();
    for (const item of this.itemDrops) {
      const distance = Phaser.Math.Distance.Between(item.sprite.x, item.sprite.y, this.player.sprite.x, this.player.sprite.y);
      if (distance <= this.player.stats.pickupRadius + 8) {
        collected.add(item);
        this.applyItemDrop(item.kind);
      }
    }
    for (const item of collected) {
      item.sprite.destroy();
    }
    this.itemDrops = this.itemDrops.filter((item) => !collected.has(item));
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
    const evolutionBranch = this.getBossDropEvolutionBranch();
    if ((this.passiveLevels[option.kind] ?? 0) > 0 && evolutionBranch === undefined) {
      this.setChoicePaused(false);
      gameEvents.emit("ui:toast", { text: "该被动已拥有，转化为经验", color: "#93c5fd" });
      this.addExperience(18);
      return;
    }
    this.activePassiveOption = option;
    this.passiveRerollAvailable = 1;
    this.setChoicePaused(true);

    const token = ++this.passiveSelectionToken;
    const selectPassive = (kind: PassiveDropKind) => {
      const level = this.applyPassiveDrop(kind);
      this.activePassiveOption = undefined;
      this.setChoicePaused(false);
      gameEvents.emit("ui:toast", { text: level > 1 ? `被动已强化 Lv.${level}` : "被动已获取", color: "#a7f3d0" });
    };
    const selectHandler = (kind: PassiveDropKind) => {
      if (token !== this.passiveSelectionToken) {
        return;
      }
      selectPassive(kind);
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

    if (evolutionBranch !== undefined) {
      const selectBossDropHandler = (pick: "evolution" | "passive") => {
        if (token !== this.passiveSelectionToken) {
          return;
        }
        if (pick === "evolution") {
          this.applyEvolutionBranch(evolutionBranch.id);
          this.activePassiveOption = undefined;
          this.setChoicePaused(false);
          return;
        }
        if (this.activePassiveOption !== undefined) {
          selectPassive(this.activePassiveOption.kind);
        }
      };
      const rerollBossDropHandler = () => {
        if (token !== this.passiveSelectionToken || this.passiveRerollAvailable <= 0 || this.activePassiveOption === undefined) {
          return;
        }
        this.passiveRerollAvailable = 0;
        const rerolled = this.getRandomPassiveOption(this.activePassiveOption.kind);
        if (rerolled !== undefined) {
          this.activePassiveOption = rerolled;
        }
        gameEvents.emit("bossdrop:open", {
          evolution: { title: `进化：${evolutionBranch.name}`, description: evolutionBranch.description },
          passive: this.activePassiveOption,
          rerollLeft: this.passiveRerollAvailable,
        });
      };
      gameEvents.once("bossdrop:selected", selectBossDropHandler);
      gameEvents.once("bossdrop:reroll", rerollBossDropHandler);
      gameEvents.emit("bossdrop:open", {
        evolution: { title: `进化：${evolutionBranch.name}`, description: evolutionBranch.description },
        passive: this.activePassiveOption,
        rerollLeft: this.passiveRerollAvailable,
      });
      return;
    }

    gameEvents.once("passive:selected", selectHandler);
    gameEvents.once("passive:reroll", rerollHandler);
    gameEvents.emit("passive:open", { option: this.activePassiveOption, rerollLeft: this.passiveRerollAvailable });
  }

  private getBossDropEvolutionBranch(): EvolutionBranch | undefined {
    const branches = this.getAvailableEvolutionBranches();
    if (branches.length <= 0) {
      return undefined;
    }
    return branches[0];
  }

  private getRandomPassiveOption(exclude?: PassiveDropKind): PassiveOption | undefined {
    return getRandomPassiveOption(this.passiveLevels, exclude);
  }

  private addExperience(rawValue: number): void {
    if (this.devModeEnabled) {
      return;
    }
    const gained = Math.max(1, Math.round(rawValue * this.player.stats.expGainMultiplier * this.passive.expGainMultiplier * 0.5));
    this.player.exp += gained;
    while (this.player.exp >= this.player.expToNext) {
      this.player.exp -= this.player.expToNext;
      this.player.level += 1;
      this.player.expToNext = Math.max(12, Math.floor((this.player.expToNext * 1.3 + 12) * 0.9));
      this.player.stats.damage *= 1.1;
      this.pendingPlayerUpgrades += 1;
    }
    if (this.pendingPlayerUpgrades > 0 && !this.choicePaused) {
      this.openUpgradeSelection();
    }
  }

  private openUpgradeSelection(): void {
    const available = upgradePool.filter((upgrade) => (this.upgradeLevels.get(upgrade.id) ?? 0) < 5);
    const skillChoices = this.getSkillUpgradeChoices();
    const optionPool = [...available, ...skillChoices];
    if (optionPool.length === 0) {
      this.pendingPlayerUpgrades = 0;
      return;
    }

    let candidatePool = [...optionPool];
    if (candidatePool.length > 4) {
      const filtered = candidatePool.filter((item) => !this.recentUpgradeIds.includes(item.id));
      if (filtered.length >= 4) {
        candidatePool = filtered;
      }
    }
    this.activeUpgradeChoices = Phaser.Utils.Array.Shuffle(candidatePool).slice(0, 4).map((upgrade) => {
      const lv = this.upgradeLevels.get(upgrade.id) ?? 0;
      const fixedLabel = upgrade.id.startsWith("skill:") || upgrade.id.startsWith("evo:");
      return {
        ...upgrade,
        title: fixedLabel ? upgrade.title : `${upgrade.title} Lv.${lv + 1}/5`,
        description: fixedLabel ? upgrade.description : `${upgrade.description}（当前 ${lv}/5）`,
      };
    });
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
        this.rememberRecentUpgrade(choiceId);
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
    return true;
  }

  private getUpgradeLevelByEvolutionStatKey(key: string): number {
    const mapping: Record<string, string> = {
      projectile_count: "projectile_count",
      damage: "damage_up",
      fire_rate: "fire_rate",
      projectile_size: "projectile_size",
      projectile_speed: "fire_rate",
      penetration: "projectile_size",
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
    this.player.stats.bulletDamageMul *= branch.effects.bulletDamageMul ?? 1;
    this.player.stats.projectileSize *= branch.effects.projectileSizeMul ?? 1;
    this.player.stats.projectileSpeed *= branch.effects.projectileSpeedMul ?? 1;
    this.player.stats.moveSpeed *= branch.effects.moveSpeedMul ?? 1;
    this.player.stats.fireRate *= branch.effects.fireRateMul ?? 1;
    this.projectileKnockbackMul *= branch.effects.knockbackMul ?? 1;
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
    const viewRadius = Math.hypot(this.cameras.main.width, this.cameras.main.height) * 0.5;
    const minDistance = Math.max(540, Math.floor(viewRadius + 140));
    const spawnDistance = Phaser.Math.Between(minDistance, minDistance + 420);
    const x = Phaser.Math.Clamp(this.player.sprite.x + Math.cos(spawnAngle) * spawnDistance, 20, WORLD_SIZE - 20);
    const y = Phaser.Math.Clamp(this.player.sprite.y + Math.sin(spawnAngle) * spawnDistance, 20, WORLD_SIZE - 20);
    const finalVariant = kind === "normal" && variant === undefined ? this.pickNormalVariantForProgress() : variant;
    const eliteAffixId = kind === "normal" ? this.getEliteAffixForSpawn() : undefined;
    const enemy = new Enemy(this, x, y, kind, finalVariant, eliteAffixId);
    if (kind !== "normal") {
      this.playBossSpawnEffect(enemy);
      if (kind === "mainBoss" || kind === "finalBoss") {
        this.clearNormalEnemiesForMainBossPhase();
      }
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

  private hasMainBossOnField(): boolean {
    return this.enemies.some((enemy) => !enemy.isDead && (enemy.kind === "mainBoss" || enemy.kind === "finalBoss"));
  }

  private clearNormalEnemiesForMainBossPhase(): void {
    const remain: Enemy[] = [];
    for (const enemy of this.enemies) {
      if (enemy.kind !== "normal") {
        remain.push(enemy);
        continue;
      }
      this.enemyStatus.delete(enemy.id);
      this.destroyMiniBossBar(enemy.id);
      const eliteFx = this.enemyEliteFx.get(enemy.id);
      eliteFx?.aura.destroy();
      eliteFx?.mark.destroy();
      this.enemyEliteFx.delete(enemy.id);
      this.enemyBossAi.delete(enemy.id);
      enemy.destroy();
    }
    this.enemies = remain;
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
    const baseScaleX = enemy.visual.scaleX;
    const baseScaleY = enemy.visual.scaleY;
    enemy.visual.setScale(baseScaleX * 0.78, baseScaleY * 0.78);
    this.tweens.add({
      targets: enemy.visual,
      scaleX: baseScaleX,
      scaleY: baseScaleY,
      duration: 260,
      ease: "Back.Out",
    });
    this.cameras.main.shake(90, 0.0018);
  }

  private applyEnemyDifficulty(enemy: Enemy): void {
    const elapsedSec = Math.floor((this.time.now - this.runStartedAt) / 1000);
    if (enemy.kind === "normal") {
      const hpMul = 1 + elapsedSec / 240 + Math.sqrt(elapsedSec) / 40;
      enemy.maxHealth = Math.floor(enemy.maxHealth * hpMul);
      enemy.health = enemy.maxHealth;
      enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 340));
      return;
    }
    if (enemy.kind === "miniBoss") {
      const hpMul = 1 + elapsedSec / 280 + Math.sqrt(elapsedSec) / 42;
      enemy.maxHealth = Math.floor(enemy.maxHealth * hpMul);
      enemy.health = enemy.maxHealth;
      enemy.moveSpeed = Math.min(135, enemy.moveSpeed + elapsedSec * 0.04);
      enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 320));
      return;
    }
    if (enemy.kind === "mainBoss") {
      const hpMul = 1 + elapsedSec / 320 + Math.sqrt(elapsedSec) / 48;
      enemy.maxHealth = Math.floor(enemy.maxHealth * hpMul);
      enemy.health = enemy.maxHealth;
      enemy.moveSpeed = Math.min(115, enemy.moveSpeed + elapsedSec * 0.03);
      enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 300));
      return;
    }
    const hpMul = 1 + elapsedSec / 290 + Math.sqrt(elapsedSec) / 44;
    enemy.maxHealth = Math.floor(enemy.maxHealth * hpMul);
    enemy.health = enemy.maxHealth;
    enemy.moveSpeed = Math.min(130, enemy.moveSpeed + elapsedSec * 0.04);
    enemy.expReward = Math.floor(enemy.expReward * (1 + elapsedSec / 240));
  }

  private cleanupDeadEnemies(): void {
    this.cleanupMiniCActiveMobs();
    for (const enemy of this.enemies) {
      if (!enemy.isDead) {
        continue;
      }
      this.clearBossTelegraphs(enemy.id);
      if (enemy.kind === "finalBoss") {
        const state = this.enemyBossAi.get(enemy.id) ?? {};
        const lives = state.finalLives ?? 3;
        if (lives > 1) {
          state.finalLives = lives - 1;
          state.finalInvulnerable = false;
          enemy.isDead = false;
          enemy.health = enemy.maxHealth;
          enemy.sprite.setVisible(true);
          enemy.visual.setVisible(true);
          const body = enemy.sprite.body as Phaser.Physics.Arcade.Body | undefined;
          if (body !== undefined) {
            body.enable = true;
            body.setVelocity(0, 0);
          }
          const phaseHint = state.finalLives === 2 ? "第一条命击破！" : "第二条命击破！";
          gameEvents.emit("ui:warning", { text: phaseHint, color: "#fda4af" });
          this.enemyBossAi.set(enemy.id, state);
          continue;
        }
      }
      if (enemy.kind === "mainBoss") {
        this.mainBossDefeated += 1;
      }
      if (enemy.variant === "mainA") {
        this.clearMainASpotlights(enemy.id);
      }
      if (enemy.kind === "finalBoss" && !this.gameFinished) {
        this.gameFinished = true;
        this.gameStarted = false;
        this.setChoicePaused(true);
        this.clearFinalPylons();
        gameEvents.emit("ui:showWin", {
          elapsedSec: Math.floor((this.time.now - this.runStartedAt) / 1000),
        });
      }
      this.killCount += 1;
      this.evolutionBehaviorState.kill_count = this.killCount;
      this.applyKillPassives(enemy);

      const shouldDropExp = enemy.kind !== "normal" || Math.random() < 0.7;
      const orbCount = !shouldDropExp ? 0 : enemy.kind === "normal" ? 1 : enemy.kind === "miniBoss" ? 6 : enemy.kind === "mainBoss" ? 12 : 22;
      for (let i = 0; i < orbCount && this.orbs.length < MAX_ORBS; i += 1) {
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const distance = Phaser.Math.Between(8, 26);
        this.orbs.push(
          new ExperienceOrb(
            this,
            enemy.sprite.x + Math.cos(angle) * distance,
            enemy.sprite.y + Math.sin(angle) * distance,
            Math.round((enemy.expReward / orbCount) * 1.2),
          ),
        );
      }
      this.trySpawnItemDrop(enemy);

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
      this.clearBossTelegraphs(enemy.id);
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

  private applyKillPassives(enemy: Enemy): void {
    if (this.passive.killBlastRadius <= 0) {
      return;
    }
    this.triggerKillBlast(enemy.sprite.x, enemy.sprite.y, enemy.id);
  }

  private trySpawnItemDrop(enemy: Enemy): void {
    if (enemy.kind !== "normal") {
      return;
    }
    const roll = Math.random();
    if (roll < 0.002) {
      this.itemDrops.push(new ItemDrop(this, enemy.sprite.x, enemy.sprite.y, "magnet"));
      this.spawnText(enemy.sprite.x, enemy.sprite.y - 28, "掉落：磁铁", "#fbbf24", 12);
      return;
    }
    if (roll < 0.015) {
      this.itemDrops.push(new ItemDrop(this, enemy.sprite.x, enemy.sprite.y, "heal_potion"));
      this.spawnText(enemy.sprite.x, enemy.sprite.y - 28, "掉落：血瓶", "#fca5a5", 12);
    }
  }

  private applyItemDrop(kind: ItemDropKind): void {
    if (kind === "magnet") {
      this.magnetActiveUntil = this.time.now + 1300;
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 34, "磁铁：全图吸附", "#fbbf24", 13);
      return;
    }
    const heal = Math.min(10, this.player.stats.maxHealth - this.player.stats.health);
    if (heal > 0) {
      this.player.stats.health += heal;
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 34, `血瓶 +${heal}`, "#86efac", 13);
    } else {
      this.spawnText(this.player.sprite.x, this.player.sprite.y - 34, "血量已满", "#cbd5e1", 12);
    }
  }

  private updateMagnetAttraction(now: number): void {
    if (now > this.magnetActiveUntil) {
      return;
    }
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    const dt = Math.max(0.001, this.game.loop.delta / 1000);
    const speed = 1400;
    for (const orb of this.orbs) {
      this.moveDropTowardPlayer(orb.sprite, px, py, speed, dt);
    }
    for (const drop of this.passiveDrops) {
      this.moveDropTowardPlayer(drop.sprite, px, py, speed * 0.9, dt);
    }
  }

  private moveDropTowardPlayer(sprite: Phaser.GameObjects.Arc, px: number, py: number, speed: number, dt: number): void {
    const dx = px - sprite.x;
    const dy = py - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) {
      sprite.setPosition(px, py);
      return;
    }
    const step = Math.min(dist, speed * dt);
    sprite.setPosition(sprite.x + (dx / dist) * step, sprite.y + (dy / dist) * step);
  }

  private rememberRecentUpgrade(id: string): void {
    if (id.startsWith("skill:") || id.startsWith("evo:")) {
      return;
    }
    this.recentUpgradeIds.push(id);
    if (this.recentUpgradeIds.length > 3) {
      this.recentUpgradeIds.shift();
    }
  }

  private updatePassiveInvincible(now: number): void {
    if (this.player.isDead) {
      this.player.visual.setAlpha(1);
      return;
    }
    this.player.visual.setAlpha(now < this.passive.invincibleUntil ? 0.68 : 1);
  }

  private updateEmergencyShield(_now: number): void {
    // Deprecated hook: retained to keep update loop shape stable.
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
    this.reloadEndsAt = this.time.now + this.player.stats.reloadMs * threatReloadMul;
    gameEvents.emit("ui:toast", { text: reason, color: "#fcd34d" });
  }

  private isLowHpTriggered(): boolean {
    if (this.passive.lowHpThresholdRatio <= 0 || this.player.stats.maxHealth <= 0) {
      return false;
    }
    return this.player.stats.health / this.player.stats.maxHealth <= this.passive.lowHpThresholdRatio;
  }

  private getCurrentMoveMultiplier(now: number): number {
    let mul = 1;
    if (this.isLowHpTriggered()) {
      mul *= this.passive.lowHpMoveMultiplier;
    }
    if (this.passive.painRushUntil > now) {
      mul *= this.passive.painRushMoveMultiplier;
    }
    if (this.passive.threatSenseActive) {
      mul *= this.passive.threatSenseMoveMultiplier;
    }
    const finalBoss = this.enemies.find((enemy) => !enemy.isDead && enemy.variant === "final");
    if (finalBoss !== undefined) {
      const ai = this.enemyBossAi.get(finalBoss.id);
      if ((ai?.finalWindSlowUntil ?? 0) > now) {
        mul *= 0.28;
      }
    }
    mul *= this.getBossSlowMultiplier(now);
    return mul;
  }

  private getCurrentFireRateMultiplier(now: number): number {
    let mul = 1;
    if (this.passive.painRushUntil > now) {
      mul *= this.passive.painRushFireRateMultiplier;
    }
    if (this.passive.threatSenseActive) {
      mul *= this.passive.threatSenseFireRateMultiplier;
    }
    return mul;
  }

  private getCurrentDamageMultiplier(now: number): number {
    let mul = 1;
    if (this.isLowHpTriggered()) {
      mul *= this.passive.lowHpDamageMultiplier;
    }
    mul *= this.passive.bloodTriggerDamageMultiplier;
    if (this.passive.painRushUntil > now) {
      mul *= 1.05;
    }
    return mul;
  }

  private triggerPainRush(now: number): void {
    if (this.passive.painRushDurationMs <= 0) {
      return;
    }
    this.passive.painRushUntil = Math.max(this.passive.painRushUntil, now + this.passive.painRushDurationMs);
  }

  private triggerKillBlast(x: number, y: number, sourceEnemyId: number): void {
    const radius = this.passive.killBlastRadius;
    const baseDamage = this.passive.killBlastDamage > 0 ? this.passive.killBlastDamage : Math.max(1, this.player.stats.damage * 0.3);
    if (radius <= 0 || baseDamage <= 0) {
      return;
    }
    const ring = this.add.circle(x, y, 6, 0xfb7185, 0.22).setDepth(14);
    ring.setStrokeStyle(2, 0xfda4af, 0.9);
    this.tweens.add({
      targets: ring,
      radius,
      alpha: 0,
      duration: 170,
      ease: "Quad.Out",
      onComplete: () => ring.destroy(),
    });

    const now = this.time.now;
    for (const enemy of this.enemies) {
      if (enemy.isDead || enemy.id === sourceEnemyId) {
        continue;
      }
      const dist = Phaser.Math.Distance.Between(x, y, enemy.sprite.x, enemy.sprite.y);
      if (dist > radius) {
        continue;
      }
      const dealt = enemy.damage(baseDamage * this.getCurrentDamageMultiplier(now));
      if (dealt <= 0) {
        continue;
      }
      this.evolutionBehaviorState.damage_dealt = (this.evolutionBehaviorState.damage_dealt ?? 0) + dealt;
      this.flashHit(enemy.visual, 60, enemy.eliteTintColor);
      this.spawnDamageText(enemy.sprite.x, enemy.sprite.y - 16, dealt, "#fda4af");
    }
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
      if (outOfWorld || now - bullet.spawnAt > 1500) {
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
      nextMini: this.devModeEnabled ? 0 : this.getNextBossCountdown("miniBoss"),
      nextMain: this.devModeEnabled ? 0 : this.getNextBossCountdown("mainBoss"),
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
      damage: this.player.stats.damage,
      effectiveDamage: this.player.stats.damage * this.getCurrentDamageMultiplier(this.time.now) * this.player.stats.bulletDamageMul,
      bulletDamageMul: this.player.stats.bulletDamageMul,
      fireRate: this.player.stats.fireRate,
      effectiveFireRate: this.player.stats.fireRate * this.getCurrentFireRateMultiplier(this.time.now),
      critChance: this.player.stats.critChance,
      critMultiplier: this.player.stats.critMultiplier,
      moveSpeed: this.player.stats.moveSpeed,
      effectiveMoveSpeed: this.player.stats.moveSpeed * this.getCurrentMoveMultiplier(this.time.now),
      projectileCount: this.player.stats.projectileCount,
      projectileSize: this.player.stats.projectileSize,
      reloadMs: this.player.stats.reloadMs,
      pickupRadius: this.player.stats.pickupRadius,
      dashCharges: this.dashCharges,
      dashMaxCharges: this.dashMaxCharges,
      dashRechargeMs: this.dashRechargeMs,
      dashCooldownLeftMs: this.dashCharges >= this.dashMaxCharges || this.nextDashChargeAt <= 0 ? 0 : Math.max(0, this.nextDashChargeAt - this.time.now),
      paused: this.manualPaused,
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
    const view = this.cameras.main.worldView;
    const pad = 64;
    const left = view.x - pad;
    const top = view.y - pad;
    const right = view.right + pad;
    const bottom = view.bottom + pad;
    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        continue;
      }
      const ex = enemy.sprite.x;
      const ey = enemy.sprite.y;
      if (ex < left || ex > right || ey < top || ey > bottom) {
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
    for (const [enemyId, fx] of this.enemyEliteFx) {
      const enemy = this.enemies.find((item) => item.id === enemyId);
      if (enemy === undefined || enemy.isDead || !enemy.sprite.active || !enemy.visual.active) {
        fx.aura.destroy();
        fx.mark.destroy();
        this.enemyEliteFx.delete(enemyId);
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

  private spawnHitParticles(x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.Between(38, 120);
      const dot = this.add.circle(x, y, Phaser.Math.Between(1, 3), color, 0.9).setDepth(16);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: Phaser.Math.Between(120, 220),
        ease: "Quad.Out",
        onComplete: () => dot.destroy(),
      });
    }
  }

  private bumpEnemyOnHit(enemy: Enemy, crit: boolean): void {
    if (!enemy.visual.active) {
      return;
    }
    if (enemy.kind === "normal" && this.projectileKnockbackMul > 1) {
      const body = enemy.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      if (body != null) {
        const dx = enemy.sprite.x - this.player.sprite.x;
        const dy = enemy.sprite.y - this.player.sprite.y;
        const len = Math.max(1, Math.hypot(dx, dy));
        const knockSpeed = (crit ? 52 : 38) * this.projectileKnockbackMul;
        body.setVelocity(body.velocity.x + (dx / len) * knockSpeed, body.velocity.y + (dy / len) * knockSpeed);
      }
    }
    const angleKick = (enemy.kind === "normal" ? 3 : 1.8) * (Math.random() < 0.5 ? -1 : 1) * (crit ? 1.25 : 1);
    const kickDist = crit ? 5 : 3;
    const kickAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const fromX = enemy.visual.x;
    const fromY = enemy.visual.y;
    this.tweens.add({
      targets: enemy.visual,
      angle: angleKick,
      x: fromX + Math.cos(kickAngle) * kickDist,
      y: fromY + Math.sin(kickAngle) * kickDist,
      duration: 45,
      yoyo: true,
      ease: "Quad.Out",
      onComplete: () => {
        if (enemy.visual.active) {
          enemy.visual.setAngle(0);
          enemy.visual.setPosition(Math.round(enemy.sprite.x), Math.round(enemy.sprite.y));
        }
      },
    });
  }
}
