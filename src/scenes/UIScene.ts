import Phaser from "phaser";
import { isMobileGameplayDevice } from "../core/device";
import { gameEvents } from "../core/events";
import type { UpgradeChoice } from "../core/types";
import type { PassiveDropKind } from "../entities/PassiveDrop";

interface HudPayload {
  health: number;
  maxHealth: number;
  level: number;
  exp: number;
  expToNext: number;
  enemyCount: number;
  bullets: number;
  kills: number;
  aliveBosses: number;
  elapsedSec: number;
  nextMini: number;
  nextMain: number;
  ammo: number;
  maxAmmo: number;
  reloading: boolean;
  reloadRatio: number;
  passiveDetails: string[];
  invincibleLeftMs: number;
  rerollLeft: number;
  passiveDropCount: number;
  bossName: string;
  bossHealth: number;
  bossMaxHealth: number;
  damage: number;
  effectiveDamage: number;
  bulletDamageMul: number;
  fireRate: number;
  effectiveFireRate: number;
  critChance: number;
  critMultiplier: number;
  moveSpeed: number;
  effectiveMoveSpeed: number;
  projectileCount: number;
  projectileSize: number;
  reloadMs: number;
  pickupRadius: number;
  dashCharges: number;
  dashMaxCharges: number;
  dashRechargeMs: number;
  dashCooldownLeftMs: number;
  paused: boolean;
}

interface ResultPayload {
  elapsedSec: number;
  canRevive?: boolean;
}

interface PassiveOption {
  kind: PassiveDropKind;
  title: string;
  description: string;
}

interface BossDropChoicePayload {
  evolution: { title: string; description: string };
  passive: PassiveOption;
  rerollLeft: number;
}

interface DevStatePayload {
  autoSpawn: boolean;
  godMode: boolean;
  oneHitKill: boolean;
}

type DevUpgradeLevelMap = Record<string, number>;
type DevSkillKind = "flamethrower" | "lightning_bug" | "poison_orb" | "frost_core";
type DevSkillNode = "a" | "b";
type DevSkillLevelMap = Record<DevSkillKind, Record<DevSkillNode, number>>;
type DevSkillUnlockMap = Record<DevSkillKind, boolean>;

interface DevSkillStatePayload {
  unlocked: DevSkillUnlockMap;
  levels: DevSkillLevelMap;
}

const DEV_UNLOCK_KEYWORD = "lzs";

interface HeartSlot {
  bg: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Image;
}

export class UIScene extends Phaser.Scene {
  private panelContainer?: Phaser.GameObjects.Container;
  private toastText?: Phaser.GameObjects.Text;
  private rerollLeft = 0;
  private isMobileUi = false;
  private hudBarWidth = 220;
  private bossBarWidth = 520;
  private bottomBarY = 0;
  private lastLayoutW = -1;
  private lastLayoutH = -1;
  private modalOverlay?: Phaser.GameObjects.Container;

  private topBg!: Phaser.GameObjects.Rectangle;
  private topText!: Phaser.GameObjects.Text;
  private leftBg!: Phaser.GameObjects.Rectangle;
  private leftText!: Phaser.GameObjects.Text;
  private rightBg!: Phaser.GameObjects.Rectangle;
  private rightText!: Phaser.GameObjects.Text;
  private bottomBg!: Phaser.GameObjects.Rectangle;
  private ammoText!: Phaser.GameObjects.Text;
  private expBarBg!: Phaser.GameObjects.Rectangle;
  private expBarFill!: Phaser.GameObjects.Rectangle;
  private ammoBarBg!: Phaser.GameObjects.Rectangle;
  private ammoBarFill!: Phaser.GameObjects.Rectangle;
  private reloadBarBg!: Phaser.GameObjects.Rectangle;
  private reloadBarFill!: Phaser.GameObjects.Rectangle;
  private dashSkillIconBg!: Phaser.GameObjects.Arc;
  private dashSkillIconText!: Phaser.GameObjects.Text;
  private dashSkillRing!: Phaser.GameObjects.Graphics;
  private dashChargePips: Phaser.GameObjects.Arc[] = [];
  private bossBarBg!: Phaser.GameObjects.Rectangle;
  private bossBarFill!: Phaser.GameObjects.Rectangle;
  private bossNameText!: Phaser.GameObjects.Text;
  private bossHpText!: Phaser.GameObjects.Text;
  private heartPanel!: Phaser.GameObjects.Rectangle;
  private heartTitle!: Phaser.GameObjects.Text;
  private heartValue!: Phaser.GameObjects.Text;
  private mobileTimeText!: Phaser.GameObjects.Text;
  private heartSlots: HeartSlot[] = [];
  private audioBtnBg!: Phaser.GameObjects.Rectangle;
  private audioBtnText!: Phaser.GameObjects.Text;
  private audioPanel?: Phaser.GameObjects.Container;
  private audioBgmText?: Phaser.GameObjects.Text;
  private audioSfxText?: Phaser.GameObjects.Text;
  private audioBgm = 0.16;
  private audioSfx = 1;
  private statsBtnBg!: Phaser.GameObjects.Rectangle;
  private statsBtnText!: Phaser.GameObjects.Text;
  private pauseBtnBg!: Phaser.GameObjects.Rectangle;
  private pauseBtnText!: Phaser.GameObjects.Text;
  private devBtnBg?: Phaser.GameObjects.Rectangle;
  private devBtnText?: Phaser.GameObjects.Text;
  private statsPanel?: Phaser.GameObjects.Container;
  private statsPanelText?: Phaser.GameObjects.Text;
  private pausePanel?: Phaser.GameObjects.Container;
  private latestHud?: HudPayload;
  private devUnlocked = false;
  private devPanel?: Phaser.GameObjects.Container;
  private devUpgradePanel?: Phaser.GameObjects.Container;
  private devUpgradePanelMode: "root" | "main_weapon" | "player_attr" | "sub_weapon" = "root";
  private devState: DevStatePayload = { autoSpawn: true, godMode: false, oneHitKill: false };
  private devUpgradeLevels: DevUpgradeLevelMap = {
    damage_up: 0,
    fire_rate: 0,
    projectile_count: 0,
    projectile_size: 0,
    move_speed: 0,
    pickup_range: 0,
    max_ammo: 0,
    reload_speed: 0,
  };
  private devSkillUnlocked: DevSkillUnlockMap = {
    flamethrower: false,
    lightning_bug: false,
    poison_orb: false,
    frost_core: false,
  };
  private devSkillLevels: DevSkillLevelMap = {
    flamethrower: { a: 0, b: 0 },
    lightning_bug: { a: 0, b: 0 },
    poison_orb: { a: 0, b: 0 },
    frost_core: { a: 0, b: 0 },
  };
  private devTapCount = 0;
  private devTapResetAt = 0;

  public constructor() {
    super("UIScene");
  }

  public create(): void {
    this.isMobileUi = isMobileGameplayDevice();
    this.ensureHeartTexture("ui-heart-full", "#ef4444");
    this.ensureHeartTexture("ui-heart-empty", "#334155");

    this.topBg = this.add.rectangle(0, 0, 700, 60, 0x020617, 0.76).setScrollFactor(0).setDepth(1000).setStrokeStyle(2, 0x334155, 0.9);
    this.topText = this.add.text(0, 0, "", { color: "#e2e8f0", fontFamily: "Segoe UI", fontSize: "20px", fontStyle: "bold" }).setScrollFactor(0).setDepth(1001).setOrigin(0.5);

    this.leftBg = this.add.rectangle(0, 0, 306, 98, 0x020617, 0.66).setScrollFactor(0).setDepth(1000).setOrigin(0, 0).setStrokeStyle(2, 0x334155, 0.85);
    this.leftText = this.add.text(0, 0, "", { color: "#e2e8f0", fontFamily: "Segoe UI", fontSize: "13px", lineSpacing: 4 }).setScrollFactor(0).setDepth(1001).setOrigin(0, 0);

    this.rightBg = this.add.rectangle(0, 0, 306, 142, 0x020617, 0.66).setScrollFactor(0).setDepth(1000).setOrigin(1, 0).setStrokeStyle(2, 0x334155, 0.85);
    this.rightText = this.add.text(0, 0, "", { color: "#a7f3d0", fontFamily: "Segoe UI", fontSize: "13px", lineSpacing: 4, wordWrap: { width: 276 } }).setScrollFactor(0).setDepth(1001).setOrigin(0, 0);

    this.bottomBg = this.add.rectangle(0, 0, 520, 78, 0x020617, 0.86).setScrollFactor(0).setDepth(1000);
    this.ammoText = this.add.text(0, 0, "", { color: "#f8fafc", fontFamily: "Consolas", fontSize: "26px", fontStyle: "bold" }).setScrollFactor(0).setDepth(1002).setOrigin(0.5);

    this.expBarBg = this.add.rectangle(0, 0, 184, 8, 0x111827, 0.9).setScrollFactor(0).setDepth(1001).setOrigin(0, 0.5);
    this.expBarFill = this.add.rectangle(0, 0, 184, 4, 0x38bdf8, 1).setScrollFactor(0).setDepth(1002).setOrigin(0, 0.5);
    this.ammoBarBg = this.add.rectangle(0, 0, 184, 8, 0x111827, 0.9).setScrollFactor(0).setDepth(1001).setOrigin(0, 0.5);
    this.ammoBarFill = this.add.rectangle(0, 0, 184, 4, 0xf8fafc, 1).setScrollFactor(0).setDepth(1002).setOrigin(0, 0.5);
    this.reloadBarBg = this.add.rectangle(0, 0, 184, 8, 0x111827, 0.9).setScrollFactor(0).setDepth(1001).setOrigin(0, 0.5);
    this.reloadBarFill = this.add.rectangle(0, 0, 184, 4, 0xfbbf24, 1).setScrollFactor(0).setDepth(1002).setOrigin(0, 0.5);
    this.dashSkillIconBg = this.add.circle(0, 0, 24, 0x020617, 0.9).setScrollFactor(0).setDepth(1000).setStrokeStyle(2, 0x334155, 0.9);
    this.dashSkillIconText = this.add
      .text(0, 0, "⇧", {
        color: "#bae6fd",
        fontFamily: "Segoe UI",
        fontSize: "18px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);
    this.dashSkillRing = this.add.graphics().setScrollFactor(0).setDepth(1002);
    this.dashChargePips = [0, 1].map(() => this.add.circle(0, 0, 4, 0x334155, 1).setScrollFactor(0).setDepth(1001));

    this.bossBarBg = this.add.rectangle(0, 0, 560, 14, 0x111827, 0.92).setScrollFactor(0).setDepth(1003).setVisible(false);
    this.bossBarFill = this.add.rectangle(0, 0, 554, 8, 0xf43f5e, 1).setScrollFactor(0).setDepth(1004).setOrigin(0, 0.5).setVisible(false);
    this.bossNameText = this.add.text(0, 0, "", { color: "#fecdd3", fontFamily: "Segoe UI", fontSize: "20px", fontStyle: "bold" }).setScrollFactor(0).setDepth(1004).setOrigin(0.5).setVisible(false);
    this.bossHpText = this.add.text(0, 0, "", { color: "#ffe4e6", fontFamily: "Consolas", fontSize: "16px", fontStyle: "bold" }).setScrollFactor(0).setDepth(1004).setOrigin(0.5).setVisible(false);

    this.heartPanel = this.add.rectangle(0, 0, 334, 82, 0x111827, 0).setScrollFactor(0).setDepth(1100).setOrigin(0, 0);
    this.heartPanel.setStrokeStyle(0, 0x7f1d1d, 0);
    this.heartTitle = this.add.text(0, 0, "生命", { color: "#fecaca", fontFamily: "Segoe UI", fontSize: "22px", fontStyle: "bold" }).setScrollFactor(0).setDepth(1101).setOrigin(0, 0.5);
    this.heartValue = this.add.text(0, 0, "", { color: "#fef2f2", fontFamily: "Consolas", fontSize: "21px", fontStyle: "bold" }).setScrollFactor(0).setDepth(1101).setOrigin(1, 0.5);

    this.mobileTimeText = this.add
      .text(0, 0, "", {
        color: "#e2e8f0",
        fontFamily: "Consolas",
        fontSize: "13px",
        fontStyle: "bold",
        stroke: "#020617",
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setDepth(1103)
      .setOrigin(0.5)
      .setVisible(false);

    for (let i = 0; i < 5; i += 1) {
      const bg = this.add.image(0, 0, "ui-heart-empty").setScrollFactor(0).setDepth(1101);
      const fill = this.add.image(0, 0, "ui-heart-full").setScrollFactor(0).setDepth(1102).setOrigin(0.5);
      this.heartSlots.push({ bg, fill });
    }

    this.audioBtnBg = this.add
      .rectangle(0, 0, 72, 28, 0x0f172a, 0.88)
      .setStrokeStyle(1, 0x93c5fd, 0.9)
      .setScrollFactor(0)
      .setDepth(1200)
      .setInteractive({ useHandCursor: true });
    this.audioBtnText = this.add
      .text(0, 0, "音量", {
        color: "#dbeafe",
        fontFamily: "Segoe UI",
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1201);
    this.audioBtnBg.on("pointerdown", () => this.toggleAudioPanel());

    this.statsBtnBg = this.add
      .rectangle(0, 0, 72, 28, 0x0f172a, 0.9)
      .setStrokeStyle(1, 0x67e8f9, 0.95)
      .setScrollFactor(0)
      .setDepth(1200)
      .setInteractive({ useHandCursor: true });
    this.statsBtnText = this.add
      .text(0, 0, "属性", {
        color: "#ccfbf1",
        fontFamily: "Segoe UI",
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1201);
    this.statsBtnBg.on("pointerdown", () => this.toggleStatsPanel());

    this.pauseBtnBg = this.add
      .rectangle(0, 0, 72, 28, 0x1f2937, 0.92)
      .setStrokeStyle(1, 0xfbbf24, 0.95)
      .setScrollFactor(0)
      .setDepth(1200)
      .setInteractive({ useHandCursor: true });
    this.pauseBtnText = this.add
      .text(0, 0, "暂停", {
        color: "#fef3c7",
        fontFamily: "Segoe UI",
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1201);
    this.pauseBtnBg.on("pointerdown", () => this.togglePausePanel());

    this.devBtnBg = this.add
      .rectangle(0, 0, 62, 28, 0x7c2d12, 0.92)
      .setStrokeStyle(1, 0xfacc15, 0.95)
      .setScrollFactor(0)
      .setDepth(1200)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.devBtnText = this.add
      .text(0, 0, "DEV", {
        color: "#fef3c7",
        fontFamily: "Consolas",
        fontSize: "14px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1201)
      .setVisible(false);
    this.devBtnBg.on("pointerdown", () => this.toggleDevPanel());

    this.layoutUI();
    this.scale.on("resize", () => this.layoutUI());
    this.time.delayedCall(0, () => this.layoutUI());
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.devUpgradePanel != null) {
        this.closeDevUpgradePanel(true);
        return;
      }
      if (this.devPanel != null) {
        this.devPanel.destroy(true);
        this.devPanel = undefined;
        return;
      }
      if (this.modalOverlay != null || this.panelContainer != null) {
        return;
      }
      this.togglePausePanel();
    });

    gameEvents.on("hud:update", (payload: HudPayload) => this.updateHud(payload));
    gameEvents.on("upgrade:open", ({ choices, rerollLeft }: { choices: UpgradeChoice[]; rerollLeft: number }) => {
      this.rerollLeft = rerollLeft;
      this.openUpgradePanel(choices);
    });
    gameEvents.on("passive:open", ({ option, rerollLeft }: { option: PassiveOption; rerollLeft: number }) => {
      this.rerollLeft = rerollLeft;
      this.openPassivePanel(option);
    });
    gameEvents.on("bossdrop:open", (payload: BossDropChoicePayload) => {
      this.rerollLeft = payload.rerollLeft;
      this.openBossDropPanel(payload);
    });
    gameEvents.on("ui:toast", ({ text, color }: { text: string; color?: string }) => this.showToast(text, color ?? "#f8fafc"));
    gameEvents.on("ui:warning", ({ text, color }: { text: string; color?: string }) => this.showWarning(text, color ?? "#fca5a5"));
    gameEvents.on("audio:state", ({ bgm, sfx }: { bgm: number; sfx: number }) => {
      this.audioBgm = Phaser.Math.Clamp(bgm, 0, 1);
      this.audioSfx = Phaser.Math.Clamp(sfx, 0, 1);
      this.refreshAudioPanelText();
    });
    gameEvents.on("dev:state", (payload: DevStatePayload) => {
      this.devState = payload;
      this.refreshDevPanelLabels();
    });
    gameEvents.on("dev:upgradeLevel", ({ upgradeId, level }: { upgradeId: string; level: number }) => {
      this.devUpgradeLevels[upgradeId] = level;
      this.refreshDevUpgradePanel();
    });
    gameEvents.on("dev:upgradeLevels", (levels: DevUpgradeLevelMap) => {
      this.devUpgradeLevels = { ...this.devUpgradeLevels, ...levels };
      this.refreshDevUpgradePanel();
    });
    gameEvents.on("dev:skillState", (payload: DevSkillStatePayload) => {
      this.devSkillUnlocked = { ...payload.unlocked };
      this.devSkillLevels = {
        flamethrower: { ...payload.levels.flamethrower },
        lightning_bug: { ...payload.levels.lightning_bug },
        poison_orb: { ...payload.levels.poison_orb },
        frost_core: { ...payload.levels.frost_core },
      };
      this.refreshDevUpgradePanel();
    });
    gameEvents.on("ui:showStart", () => this.openStartPanel());
    gameEvents.on("ui:showGameOver", (payload?: ResultPayload) => this.openResultPanelV2(false, payload?.elapsedSec ?? 0, payload?.canRevive ?? false));
    gameEvents.on("ui:showWin", (payload?: ResultPayload) => this.openResultPanelV2(true, payload?.elapsedSec ?? 0, false));
    void this.openUpgradePanelLegacy;
    void this.openResultPanel;
  }

  private formatRunTime(totalSec: number): string {
    const sec = Math.max(0, Math.floor(totalSec));
    const mm = Math.floor(sec / 60);
    const ss = sec % 60;
    return `${mm}:${ss.toString().padStart(2, "0")}`;
  }

  private ensureHeartTexture(key: string, color: string): void {
    if (this.textures.exists(key)) {
      return;
    }
    const canvas = this.textures.createCanvas(key, 40, 36);
    if (canvas == null) {
      return;
    }
    const ctx = canvas.getContext();
    ctx.clearRect(0, 0, 40, 36);
    ctx.fillStyle = color;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, 31);
    ctx.bezierCurveTo(20, 31, 4, 21, 4, 11);
    ctx.bezierCurveTo(4, 4, 10, 2, 14, 2);
    ctx.bezierCurveTo(17, 2, 20, 4, 20, 8);
    ctx.bezierCurveTo(20, 4, 23, 2, 26, 2);
    ctx.bezierCurveTo(30, 2, 36, 4, 36, 11);
    ctx.bezierCurveTo(36, 21, 20, 31, 20, 31);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    canvas.refresh();
  }

  private layoutUI(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.lastLayoutW = w;
    this.lastLayoutH = h;
    const topY = this.isMobileUi ? 52 : 28;
    const audioX = w - 52;
    const pauseX = audioX - 84;
    const statsX = pauseX - 84;
    const devX = statsX - 78;
    this.audioBtnBg.setPosition(audioX, topY);
    this.audioBtnText.setPosition(audioX, topY);
    this.pauseBtnBg.setPosition(pauseX, topY);
    this.pauseBtnText.setPosition(pauseX, topY);
    this.statsBtnBg.setPosition(statsX, topY);
    this.statsBtnText.setPosition(statsX, topY);
    if (this.devBtnBg != null && this.devBtnText != null) {
      this.devBtnBg.setPosition(devX, topY).setVisible(this.devUnlocked);
      this.devBtnText.setPosition(devX, topY).setVisible(this.devUnlocked);
    }
    if (this.audioPanel != null) {
      this.positionAudioPanel();
    }
    if (this.statsPanel != null) {
      this.positionStatsPanel();
    }
    if (this.pausePanel != null) {
      this.positionPausePanel();
    }

    if (this.isMobileUi) {
      this.heartPanel.setScale(0.52).setPosition(4, 4);
      this.heartTitle.setScale(0.58).setPosition(10, 12);
      this.heartValue.setScale(0.58).setPosition(116, 12);
      this.mobileTimeText.setVisible(true).setOrigin(1, 0.5).setPosition(w - 8, 34).setFontSize("11px");
      for (let i = 0; i < this.heartSlots.length; i += 1) {
        const x = 18 + i * 26;
        const y = 30;
        this.heartSlots[i].bg.setScale(0.48).setPosition(x, y);
        this.heartSlots[i].fill.setScale(0.48).setPosition(x, y);
      }

      this.topBg.setVisible(false);
      this.topText.setVisible(false);
      this.leftBg.setVisible(false);
      this.leftText.setVisible(false);
      this.rightBg.setVisible(false);
      this.rightText.setVisible(false);

      this.bossBarWidth = Math.max(160, w - 110);
      this.bossBarBg.width = this.bossBarWidth;
      this.bossBarBg.setPosition(w / 2, 70);
      this.bossBarFill.setPosition(w / 2 - (this.bossBarWidth - 6) / 2, 70);
      this.bossNameText.setPosition(w / 2, 56).setFontSize("11px");
      this.bossHpText.setPosition(w / 2, 80).setFontSize("10px");

      this.bottomBarY = h - 58;
      this.hudBarWidth = Math.max(96, Math.min(132, w - 220));
      this.expBarBg.setVisible(false);
      this.ammoBarBg.setVisible(false);
      this.reloadBarBg.setVisible(false);
      const dashX = w - 54;
      const dashY = h - 140;
      this.dashSkillIconBg.setRadius(20).setPosition(dashX, dashY);
      this.dashSkillIconText.setPosition(dashX, dashY).setFontSize("15px");
      this.dashChargePips[0].setPosition(dashX - 8, dashY + 28);
      this.dashChargePips[1].setPosition(dashX + 8, dashY + 28);
      this.syncMobileHudAnchors();
      return;
    }

    this.heartPanel.setScale(0.8).setPosition(14, 4);
    this.heartTitle.setScale(0.84).setPosition(24, 20);
    this.heartValue.setScale(0.84).setPosition(268, 20);
    this.mobileTimeText.setVisible(false);
    for (let i = 0; i < this.heartSlots.length; i += 1) {
      const x = 36 + i * 43;
      const y = 46;
      this.heartSlots[i].bg.setScale(0.8).setPosition(x, y);
      this.heartSlots[i].fill.setScale(0.8).setPosition(x, y);
    }

    this.topBg.setVisible(true);
    this.topText.setVisible(true);
    this.expBarBg.setVisible(true);
    this.ammoBarBg.setVisible(true);
    this.reloadBarBg.setVisible(true);
    this.topBg.setPosition(w / 2, 28);
    this.topText.setPosition(w / 2, 28).setFontSize("13px");

    const sideMargin = 14;
    const sideTopY = 92;
    const sideInnerPad = 14;
    const topFrameWidth = this.topBg.displayWidth;
    const alignedSideWidth = Math.max(280, Math.floor((w - topFrameWidth) / 2) - sideMargin);
    const alignedSideHeight = 120;

    this.leftBg.setSize(alignedSideWidth, alignedSideHeight);
    this.leftBg.setVisible(true).setPosition(sideMargin, sideTopY);
    this.leftText.setVisible(true).setPosition(sideMargin + sideInnerPad, sideTopY + 12);

    this.rightBg.setSize(alignedSideWidth, alignedSideHeight);
    this.rightBg.setVisible(true).setPosition(w - sideMargin, sideTopY);
    this.rightText.setWordWrapWidth(alignedSideWidth - sideInnerPad * 2);
    this.rightText.setVisible(true).setPosition(w - sideMargin - alignedSideWidth + sideInnerPad, sideTopY + 12);

    this.bossBarWidth = 560;
    this.bossBarBg.width = this.bossBarWidth;
    this.bossBarBg.setPosition(w / 2, 148);
    this.bossBarFill.setPosition(w / 2 - (this.bossBarWidth - 6) / 2, 148);
    this.bossNameText.setPosition(w / 2, 120).setFontSize("20px");
    this.bossHpText.setPosition(w / 2, 168).setFontSize("16px");

    this.bottomBarY = h - 82;
    this.bottomBg.setSize(500, 78);
    this.bottomBg.setPosition(w / 2, this.bottomBarY);
    this.ammoText.setPosition(w / 2, this.bottomBarY - 10).setFontSize("24px");

    this.hudBarWidth = 184;
    const barsX = Math.round(w / 2 - this.bottomBg.width / 2 + 18);
    this.expBarBg.setSize(this.hudBarWidth, 8);
    this.ammoBarBg.setSize(this.hudBarWidth, 8);
    this.reloadBarBg.setSize(this.hudBarWidth, 8);
    this.expBarBg.setPosition(barsX, this.bottomBarY + 8);
    this.expBarFill.setPosition(barsX, this.bottomBarY + 8);
    this.ammoBarBg.setPosition(barsX, this.bottomBarY + 20);
    this.ammoBarFill.setPosition(barsX, this.bottomBarY + 20);
    this.reloadBarBg.setPosition(barsX, this.bottomBarY + 32);
    this.reloadBarFill.setPosition(barsX, this.bottomBarY + 32);
    const dashX = w - 72;
    const dashY = h - 92;
    this.dashSkillIconBg.setRadius(24).setPosition(dashX, dashY);
    this.dashSkillIconText.setPosition(dashX, dashY).setFontSize("18px");
    this.dashChargePips[0].setPosition(dashX - 10, dashY + 32);
    this.dashChargePips[1].setPosition(dashX + 10, dashY + 32);
  }

  private updateHud(payload: HudPayload): void {
    this.latestHud = payload;
    if (this.scale.width !== this.lastLayoutW || this.scale.height !== this.lastLayoutH) {
      this.layoutUI();
    }
    if (this.statsPanel != null) {
      this.refreshStatsPanel();
    }

    const fillMax = this.hudBarWidth;
    const expRatio = Phaser.Math.Clamp(payload.exp / payload.expToNext, 0, 1);
    const ammoRatio = Phaser.Math.Clamp(payload.ammo / payload.maxAmmo, 0, 1);
    this.expBarFill.width = fillMax * expRatio;
    this.ammoBarFill.width = fillMax * ammoRatio;
    this.reloadBarFill.width = payload.reloading ? fillMax * (1 - payload.reloadRatio) : 0;

    const hp = Phaser.Math.Clamp(payload.health, 0, payload.maxHealth);
    this.heartValue.setText(`${Math.ceil(hp)} / ${payload.maxHealth}`);
    for (let i = 0; i < this.heartSlots.length; i += 1) {
      const slot = this.heartSlots[i];
      const segmentStart = i * 20;
      const fillRatio = Phaser.Math.Clamp((hp - segmentStart) / 20, 0, 1);
      slot.fill.setVisible(fillRatio > 0.01);
      const tex = this.textures.get("ui-heart-full");
      const frame = tex.get();
      slot.fill.setCrop(0, 0, frame.width * fillRatio, frame.height);
    }

    if (!this.isMobileUi) {
      if (hp <= 40) {
        const pulse = 0.7 + Math.abs(Math.sin(this.time.now * 0.02)) * 0.3;
        this.heartPanel.setStrokeStyle(3, 0xef4444, pulse);
      } else {
        this.heartPanel.setStrokeStyle(2, 0x7f1d1d, 0.9);
      }
    }

    const showBossBar = payload.bossMaxHealth > 0;
    this.bossBarBg.setVisible(showBossBar);
    this.bossBarFill.setVisible(showBossBar);
    this.bossNameText.setVisible(showBossBar);
    this.bossHpText.setVisible(showBossBar);
    if (showBossBar) {
      this.bossNameText.setText(payload.bossName);
      const ratio = Phaser.Math.Clamp(payload.bossHealth / payload.bossMaxHealth, 0, 1);
      this.bossBarFill.width = (this.bossBarWidth - 6) * ratio;
      this.bossHpText.setText(`HP ${Math.ceil(payload.bossHealth)} / ${Math.ceil(payload.bossMaxHealth)}`);
    }

    const ringRadius = this.isMobileUi ? 22 : 26;
    const chargeReady = Phaser.Math.Clamp(payload.dashCharges, 0, payload.dashMaxCharges);
    const charging = payload.dashCharges < payload.dashMaxCharges;
    const cooldownProgress = charging ? Phaser.Math.Clamp(1 - payload.dashCooldownLeftMs / payload.dashRechargeMs, 0, 1) : 1;
    this.dashSkillRing.clear();
    this.dashSkillRing.lineStyle(3, 0x334155, 0.95);
    this.dashSkillRing.strokeCircle(this.dashSkillIconBg.x, this.dashSkillIconBg.y, ringRadius);
    this.dashSkillRing.lineStyle(3, chargeReady > 0 ? 0x38bdf8 : 0x64748b, 1);
    this.dashSkillRing.beginPath();
    this.dashSkillRing.arc(
      this.dashSkillIconBg.x,
      this.dashSkillIconBg.y,
      ringRadius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * cooldownProgress,
      false,
    );
    this.dashSkillRing.strokePath();
    this.dashSkillIconBg.setStrokeStyle(2, chargeReady > 0 ? 0x38bdf8 : 0x475569, 0.9);
    this.dashSkillIconText.setColor(chargeReady > 0 ? "#bae6fd" : "#64748b");
    for (let i = 0; i < this.dashChargePips.length; i += 1) {
      this.dashChargePips[i].setFillStyle(i < chargeReady ? 0x38bdf8 : 0x334155, 1);
    }

    if (this.isMobileUi) {
      this.syncMobileHudAnchors();
      this.mobileTimeText.setText(`时间 ${this.formatRunTime(payload.elapsedSec)}`);
      this.ammoText.setText(
        payload.reloading
          ? `换弹中 ${Math.round((1 - payload.reloadRatio) * 100)}%  ${payload.ammo}/${payload.maxAmmo}`
          : `子弹 ${payload.ammo} / ${payload.maxAmmo}`,
      );
      return;
    }

    this.topText.setText(
      `时间 ${this.formatRunTime(payload.elapsedSec)}  |  击杀 ${payload.kills}  |  场上怪物 ${payload.enemyCount}  |  小Boss ${payload.nextMini}s  大Boss ${payload.nextMain}s`,
    );
    this.leftText.setText(
      [
        `等级 ${payload.level}    经验 ${payload.exp} / ${payload.expToNext}`,
        `当前Boss ${payload.aliveBosses}    地面掉落 ${payload.passiveDropCount}`,
        payload.invincibleLeftMs > 0 ? `无敌剩余 ${(payload.invincibleLeftMs / 1000).toFixed(1)}s` : "无敌：未触发",
      ].join("\n"),
    );
    const rolePassive = "角色被动：20%概率追加一轮射击（不耗弹）";
    const extraPassive =
      payload.passiveDetails.length > 0 ? payload.passiveDetails.map((item) => `- ${item}`).join("\n") : "- 暂无被动效果";
    this.rightText.setText(`被动技能：\n${rolePassive}\n额外被动：\n${extraPassive}`);
    const rightDynamicHeight = Phaser.Math.Clamp(this.rightText.height + 28, 120, 320);
    this.rightBg.setSize(this.rightBg.width, rightDynamicHeight);
    this.ammoText.setText(
      payload.reloading
        ? `换弹中 ${Math.round((1 - payload.reloadRatio) * 100)}%    子弹 ${payload.ammo}/${payload.maxAmmo}`
        : `子弹 ${payload.ammo} / ${payload.maxAmmo}`,
    );
  }

  private openUpgradePanelLegacy(choices: UpgradeChoice[]): void {
    this.openSharedPanel({
      title: "升级三选一",
      hint: this.isMobileUi ? "点击卡片选择" : "点击卡片，或按 1 / 2 / 3 选择",
      cards: choices.map((choice) => ({ title: choice.title, description: choice.description, onSelect: () => this.selectUpgrade(choice.id) })),
      allowReroll: false,
      rerollLabel: "",
      onReroll: () => undefined,
    });
  }

  private openUpgradePanel(choices: UpgradeChoice[]): void {
    this.panelContainer?.destroy(true);
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const backdrop = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.64).setInteractive();
    const title = this.add
      .text(centerX, centerY - (this.isMobileUi ? 170 : 176), "升级四选一", {
        color: "#f8fafc",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "26px" : "32px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const hint = this.add
      .text(centerX, centerY - (this.isMobileUi ? 140 : 136), this.isMobileUi ? "点击卡片选择" : "点击卡片，或按 1 / 2 / 3 / 4 选择", {
        color: "#cbd5e1",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "13px" : "17px",
      })
      .setOrigin(0.5);

    const cards: Phaser.GameObjects.Container[] = [];
    choices.forEach((choice, idx) => {
      const count = choices.length;
      const width = this.isMobileUi ? Math.min(this.scale.width - 52, 300) : count >= 4 ? 262 : 250;
      const height = this.isMobileUi ? 94 : count >= 4 ? 182 : 230;
      let x = centerX;
      let y = centerY;
      if (this.isMobileUi) {
        y = centerY - (count - 1) * 50 + idx * 108;
      } else if (count >= 4) {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        x = centerX + (col === 0 ? -172 : 172);
        y = centerY + (row === 0 ? -116 : 116);
      } else {
        x = count === 1 ? centerX : centerX - 290 + idx * 290;
      }
      const bg = this.add.rectangle(x, y, width, height, 0x1f2937, 0.96).setStrokeStyle(2, 0x3b82f6, 0.72).setInteractive({ useHandCursor: true });
      const titleText = this.add
        .text(x, y - (this.isMobileUi ? 18 : count >= 4 ? 40 : 55), choice.title, {
          color: "#f8fafc",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "15px" : count >= 4 ? "19px" : "22px",
          wordWrap: { width: width - 28 },
          align: "center",
        })
        .setOrigin(0.5);
      const descText = this.add
        .text(x, y + (this.isMobileUi ? 13 : count >= 4 ? 14 : 25), choice.description, {
          color: "#cbd5e1",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "11px" : count >= 4 ? "14px" : "18px",
          wordWrap: { width: width - 34 },
          align: "center",
        })
        .setOrigin(0.5);
      bg.on("pointerover", () => bg.setFillStyle(0x334155, 1));
      bg.on("pointerout", () => bg.setFillStyle(0x1f2937, 0.96));
      bg.on("pointerdown", () => this.selectUpgrade(choice.id));
      cards.push(this.add.container(0, 0, [bg, titleText, descText]));
    });

    this.panelContainer = this.add.container(0, 0, [backdrop, title, hint, ...cards]);
    this.panelContainer.setDepth(2000);
    this.panelContainer.setScrollFactor(0);

    if (!this.isMobileUi) {
      if (choices.length >= 1) this.input.keyboard?.once("keydown-ONE", () => this.selectUpgrade(choices[0].id));
      if (choices.length >= 2) this.input.keyboard?.once("keydown-TWO", () => this.selectUpgrade(choices[1].id));
      if (choices.length >= 3) this.input.keyboard?.once("keydown-THREE", () => this.selectUpgrade(choices[2].id));
      if (choices.length >= 4) this.input.keyboard?.once("keydown-FOUR", () => this.selectUpgrade(choices[3].id));
    }
  }

  private openPassivePanel(option: PassiveOption): void {
    this.openSharedPanel({
      title: "Boss掉落：被动选择",
      hint: this.isMobileUi ? "点击领取" : "点击领取，或按 Q 重随一次",
      cards: [{ title: option.title, description: option.description, onSelect: () => this.selectPassive(option.kind) }],
      allowReroll: this.rerollLeft > 0,
      rerollLabel: this.rerollLeft > 0 ? "重随一次" : "重随已用完",
      onReroll: () => gameEvents.emit("passive:reroll"),
    });
  }

  private openSharedPanel(config: {
    title: string;
    hint: string;
    cards: Array<{ title: string; description: string; onSelect: () => void }>;
    allowReroll: boolean;
    rerollLabel: string;
    onReroll: () => void;
  }): void {
    this.panelContainer?.destroy(true);
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;
    const backdrop = this.add.rectangle(centerX, centerY, this.scale.width, this.scale.height, 0x000000, 0.64).setInteractive();
    const title = this.add.text(centerX, centerY - (this.isMobileUi ? 170 : 150), config.title, { color: "#f8fafc", fontFamily: "Segoe UI", fontSize: this.isMobileUi ? "26px" : "32px", fontStyle: "bold" }).setOrigin(0.5);
    const hint = this.add
      .text(centerX, centerY - (this.isMobileUi ? 140 : 112), config.hint, {
        color: "#cbd5e1",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "13px" : "18px",
        align: "center",
        wordWrap: { width: this.isMobileUi ? this.scale.width - 40 : this.scale.width - 200 },
      })
      .setOrigin(0.5);

    let rerollButton: Phaser.GameObjects.Rectangle | undefined;
    let rerollLabel: Phaser.GameObjects.Text | undefined;
    if (config.rerollLabel.length > 0) {
      const isBossTwoChoice = config.title.includes("二选一") && config.cards.length === 2;
      const y = this.isMobileUi ? centerY + 176 : isBossTwoChoice ? centerY + 188 : centerY + 170;
      const x = this.isMobileUi || !isBossTwoChoice ? centerX : centerX + 180;
      rerollButton = this.add
        .rectangle(x, y, this.isMobileUi ? 190 : isBossTwoChoice ? 320 : 250, this.isMobileUi ? 34 : 42, config.allowReroll ? 0x1d4ed8 : 0x374151, 0.92)
        .setStrokeStyle(2, 0x93c5fd)
        .setInteractive({ useHandCursor: config.allowReroll });
      rerollLabel = this.add.text(x, y, config.rerollLabel, { color: "#f8fafc", fontFamily: "Segoe UI", fontSize: this.isMobileUi ? "13px" : "18px" }).setOrigin(0.5);
    }

    if (config.allowReroll && rerollButton !== undefined) {
      rerollButton.on("pointerdown", () => this.triggerReroll(config.onReroll));
      this.input.keyboard?.once("keydown-Q", () => this.triggerReroll(config.onReroll));
    }

    const cards: Phaser.GameObjects.Container[] = [];
    config.cards.forEach((card, idx) => {
      const count = config.cards.length;
      const isTwoWide = !this.isMobileUi && count === 2;
      const cardWidth = this.isMobileUi ? Math.min(this.scale.width - 52, 300) : isTwoWide ? 320 : 250;
      const cardHeight = this.isMobileUi ? 94 : isTwoWide ? 280 : 230;
      const x = this.isMobileUi ? centerX : count === 1 ? centerX : isTwoWide ? centerX - 180 + idx * 360 : centerX - 290 + idx * 290;
      const y = this.isMobileUi ? centerY - (count - 1) * 50 + idx * 108 : centerY;
      const bg = this.add.rectangle(x, y, cardWidth, cardHeight, 0x1f2937, 0.95).setStrokeStyle(2, 0x334155).setInteractive({ useHandCursor: true });
      const isEvolutionCard = config.title.includes("二选一") && idx === 0;
      let evolutionAura: Phaser.GameObjects.Rectangle | undefined;
      let evolutionTag: Phaser.GameObjects.Text | undefined;
      if (isEvolutionCard && !this.isMobileUi) {
        bg.setStrokeStyle(2, 0xfbbf24, 0.95);
        evolutionAura = this.add.rectangle(x, y, cardWidth + 16, cardHeight + 16, 0xfbbf24, 0.06).setStrokeStyle(2, 0xf59e0b, 0.5);
        evolutionTag = this.add
          .text(x - cardWidth / 2 + 10, y - cardHeight / 2 + 8, "进化", {
            color: "#fef3c7",
            fontFamily: "Segoe UI",
            fontSize: "12px",
            fontStyle: "bold",
            backgroundColor: "#92400e",
          })
          .setPadding(6, 2, 6, 2)
          .setOrigin(0, 0);
        this.tweens.add({
          targets: [bg, evolutionAura],
          alpha: { from: 0.82, to: 1 },
          duration: 760,
          yoyo: true,
          repeat: -1,
          ease: "Sine.InOut",
        });
      }
      const titleTextY = y - (this.isMobileUi ? 18 : isTwoWide ? 90 : 55);
      const titleText = this.add
        .text(x, titleTextY, card.title, {
          color: "#f8fafc",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "15px" : "22px",
          wordWrap: { width: cardWidth - 28 },
          align: "center",
        })
        .setOrigin(0.5);
      const wrappedDesc = this.wrapUiText(card.description, this.isMobileUi ? 18 : isTwoWide ? 20 : 14);
      const descText = this.add
        .text(x, y + (this.isMobileUi ? 13 : isTwoWide ? -36 : 25), wrappedDesc, {
          color: "#cbd5e1",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "11px" : isTwoWide ? "16px" : "18px",
          wordWrap: { width: cardWidth - 34 },
          align: "center",
          lineSpacing: this.isMobileUi ? 2 : 6,
        })
        .setOrigin(0.5, this.isMobileUi ? 0.5 : 0);
      bg.on("pointerover", () => bg.setFillStyle(0x334155, 1));
      bg.on("pointerout", () => bg.setFillStyle(0x1f2937, 0.95));
      bg.on("pointerdown", card.onSelect);
      const cardNodes: Phaser.GameObjects.GameObject[] = [bg, titleText, descText];
      if (evolutionAura !== undefined) {
        cardNodes.unshift(evolutionAura);
      }
      if (evolutionTag !== undefined) {
        cardNodes.push(evolutionTag);
      }
      cards.push(this.add.container(0, 0, cardNodes));
    });

    const parts: Phaser.GameObjects.GameObject[] = [backdrop, title, hint];
    if (rerollButton !== undefined && rerollLabel !== undefined) {
      parts.push(rerollButton, rerollLabel);
    }
    parts.push(...cards);
    this.panelContainer = this.add.container(0, 0, parts);
    this.panelContainer.setDepth(2000);
    this.panelContainer.setScrollFactor(0);

    if (!this.isMobileUi) {
      if (config.cards.length >= 1) this.input.keyboard?.once("keydown-ONE", () => config.cards[0].onSelect());
      if (config.cards.length >= 2) this.input.keyboard?.once("keydown-TWO", () => config.cards[1].onSelect());
      if (config.cards.length >= 3) this.input.keyboard?.once("keydown-THREE", () => config.cards[2].onSelect());
    }
  }

  private triggerReroll(onReroll: () => void): void {
    if (this.rerollLeft <= 0) {
      return;
    }
    this.panelContainer?.destroy(true);
    this.panelContainer = undefined;
    onReroll();
  }

  private selectUpgrade(choiceId: string): void {
    this.panelContainer?.destroy(true);
    this.panelContainer = undefined;
    gameEvents.emit("upgrade:selected", choiceId);
  }

  private selectPassive(kind: PassiveDropKind): void {
    this.panelContainer?.destroy(true);
    this.panelContainer = undefined;
    gameEvents.emit("passive:selected", kind);
  }

  private wrapUiText(text: string, lineUnits: number): string {
    const rows: string[] = [];
    for (const srcRow of text.split("\n")) {
      let current = "";
      let units = 0;
      for (const ch of srcRow) {
        const weight = /[ -~]/.test(ch) ? 0.56 : 1;
        if (units + weight > lineUnits && current.length > 0) {
          rows.push(current);
          current = ch;
          units = weight;
        } else {
          current += ch;
          units += weight;
        }
      }
      rows.push(current);
    }
    return rows.join("\n");
  }

  private selectBossDrop(choice: "evolution" | "passive"): void {
    this.panelContainer?.destroy(true);
    this.panelContainer = undefined;
    gameEvents.emit("bossdrop:selected", choice);
  }

  private toggleAudioPanel(): void {
    if (this.audioPanel != null) {
      this.audioPanel.destroy(true);
      this.audioPanel = undefined;
      return;
    }
    const panelBg = this.add
      .rectangle(0, 0, this.isMobileUi ? 214 : 248, this.isMobileUi ? 126 : 138, 0x020617, 0.9)
      .setStrokeStyle(1, 0x334155, 0.95);
    const title = this.add
      .text(0, 0, "音量控制", { color: "#e2e8f0", fontFamily: "Segoe UI", fontSize: this.isMobileUi ? "14px" : "15px", fontStyle: "bold" })
      .setOrigin(0.5);
    this.audioBgmText = this.add.text(0, 0, "", { color: "#93c5fd", fontFamily: "Consolas", fontSize: this.isMobileUi ? "12px" : "13px" }).setOrigin(0.5);
    this.audioSfxText = this.add.text(0, 0, "", { color: "#fca5a5", fontFamily: "Consolas", fontSize: this.isMobileUi ? "12px" : "13px" }).setOrigin(0.5);
    const mkBtn = (label: string, onClick: () => void) => {
      const b = this.add
        .rectangle(0, 0, 28, 24, 0x1e293b, 0.95)
        .setStrokeStyle(1, 0x64748b, 0.9)
        .setInteractive({ useHandCursor: true });
      const t = this.add.text(0, 0, label, { color: "#f8fafc", fontFamily: "Consolas", fontSize: "16px", fontStyle: "bold" }).setOrigin(0.5);
      b.on("pointerdown", onClick);
      return [b, t];
    };
    const [bgmMinus, bgmMinusT] = mkBtn("-", () => this.adjustAudio(-0.05, 0));
    const [bgmPlus, bgmPlusT] = mkBtn("+", () => this.adjustAudio(0.05, 0));
    const [sfxMinus, sfxMinusT] = mkBtn("-", () => this.adjustAudio(0, -0.05));
    const [sfxPlus, sfxPlusT] = mkBtn("+", () => this.adjustAudio(0, 0.05));
    this.audioPanel = this.add.container(0, 0, [
      panelBg,
      title,
      this.audioBgmText,
      this.audioSfxText,
      bgmMinus,
      bgmMinusT,
      bgmPlus,
      bgmPlusT,
      sfxMinus,
      sfxMinusT,
      sfxPlus,
      sfxPlusT,
    ]);
    this.audioPanel.setDepth(1300).setScrollFactor(0);
    title.setPosition(0, -44);
    this.audioBgmText.setPosition(0, -14);
    this.audioSfxText.setPosition(0, 20);
    bgmMinus.setPosition(-78, -14);
    bgmMinusT.setPosition(-78, -14);
    bgmPlus.setPosition(78, -14);
    bgmPlusT.setPosition(78, -14);
    sfxMinus.setPosition(-78, 20);
    sfxMinusT.setPosition(-78, 20);
    sfxPlus.setPosition(78, 20);
    sfxPlusT.setPosition(78, 20);
    this.positionAudioPanel();
    this.refreshAudioPanelText();
  }

  private positionAudioPanel(): void {
    if (this.audioPanel == null) {
      return;
    }
    const x = this.scale.width - (this.isMobileUi ? 120 : 138);
    const y = this.isMobileUi ? 130 : 108;
    this.audioPanel.setPosition(x, y);
  }

  private refreshAudioPanelText(): void {
    if (this.audioBgmText != null) {
      this.audioBgmText.setText(`BGM ${Math.round(this.audioBgm * 100)}%`);
    }
    if (this.audioSfxText != null) {
      this.audioSfxText.setText(`SFX ${Math.round(this.audioSfx * 100)}%`);
    }
  }

  private adjustAudio(deltaBgm: number, deltaSfx: number): void {
    this.audioBgm = Phaser.Math.Clamp(this.audioBgm + deltaBgm, 0, 1);
    this.audioSfx = Phaser.Math.Clamp(this.audioSfx + deltaSfx, 0, 1);
    this.refreshAudioPanelText();
    gameEvents.emit("audio:set", { bgm: this.audioBgm, sfx: this.audioSfx });
  }

  private openBossDropPanel(payload: BossDropChoicePayload): void {
    this.openSharedPanel({
      title: "Boss掉落：二选一",
      hint: this.isMobileUi ? "选择进化或被动" : "1 选进化，2 选被动，Q 可重随被动一次",
      cards: [
        {
          title: payload.evolution.title,
          description: payload.evolution.description,
          onSelect: () => this.selectBossDrop("evolution"),
        },
        {
          title: payload.passive.title,
          description: payload.passive.description,
          onSelect: () => this.selectBossDrop("passive"),
        },
      ],
      allowReroll: this.rerollLeft > 0,
      rerollLabel: this.rerollLeft > 0 ? "重随被动一次" : "重随已用完",
      onReroll: () => gameEvents.emit("bossdrop:reroll"),
    });
  }

  private toggleStatsPanel(): void {
    if (this.statsPanel != null) {
      this.statsPanel.destroy(true);
      this.statsPanel = undefined;
      this.statsPanelText = undefined;
      this.syncManualPauseState();
      return;
    }

    const panelBg = this.add
      .rectangle(0, 0, this.isMobileUi ? 266 : 356, this.isMobileUi ? 212 : 274, 0x020617, 0.94)
      .setStrokeStyle(1, 0x475569, 0.95);
    const title = this.add
      .text(0, 0, "玩家属性", {
        color: "#e2e8f0",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "14px" : "16px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.statsPanelText = this.add
      .text(0, 0, "", {
        color: "#cbd5e1",
        fontFamily: "Consolas",
        fontSize: this.isMobileUi ? "12px" : "13px",
        lineSpacing: 4,
        align: "left",
      })
      .setOrigin(0, 0);

    this.statsPanel = this.add.container(0, 0, [panelBg, title, this.statsPanelText]).setDepth(1300).setScrollFactor(0);
    title.setPosition(0, this.isMobileUi ? -84 : -112);
    this.statsPanelText.setPosition(this.isMobileUi ? -116 : -156, this.isMobileUi ? -68 : -92);
    this.positionStatsPanel();
    this.refreshStatsPanel();
    this.syncManualPauseState();
  }

  private positionStatsPanel(): void {
    if (this.statsPanel == null) {
      return;
    }
    const x = Math.round(this.scale.width / 2);
    const y = Math.round(this.scale.height / 2);
    this.statsPanel.setPosition(x, y);
  }

  private togglePausePanel(forceOpen?: boolean): void {
    const wantOpen = forceOpen ?? this.pausePanel == null;
    if (!wantOpen) {
      this.pausePanel?.destroy(true);
      this.pausePanel = undefined;
      this.pauseBtnText.setText("暂停");
      this.syncManualPauseState();
      this.showToast("继续战斗", "#93c5fd");
      return;
    }

    this.pausePanel?.destroy(true);
    const panelBg = this.add
      .rectangle(0, 0, this.isMobileUi ? 250 : 300, this.isMobileUi ? 198 : 230, 0x020617, 0.94)
      .setStrokeStyle(2, 0x334155, 0.95);
    const title = this.add
      .text(0, this.isMobileUi ? -72 : -86, "游戏已暂停", {
        color: "#f8fafc",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "22px" : "28px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const mkBtn = (y: number, label: string, color: number, onClick: () => void) => {
      const b = this.add
        .rectangle(0, y, this.isMobileUi ? 188 : 210, this.isMobileUi ? 40 : 46, color, 0.95)
        .setStrokeStyle(2, 0x93c5fd, 0.95)
        .setInteractive({ useHandCursor: true });
      const t = this.add
        .text(0, y, label, {
          color: "#eff6ff",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "18px" : "22px",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      b.on("pointerdown", onClick);
      return [b, t] as const;
    };

    const [resumeBtn, resumeTxt] = mkBtn(this.isMobileUi ? -8 : -8, "继续游戏", 0x2563eb, () => this.togglePausePanel(false));
    const [restartBtn, restartTxt] = mkBtn(this.isMobileUi ? 48 : 54, "重新开始", 0x7c2d12, () => window.location.reload());

    this.pausePanel = this.add
      .container(0, 0, [panelBg, title, resumeBtn, resumeTxt, restartBtn, restartTxt])
      .setDepth(2400)
      .setScrollFactor(0);
    this.positionPausePanel();
    this.pauseBtnText.setText("继续");
    this.syncManualPauseState();
  }

  private positionPausePanel(): void {
    if (this.pausePanel == null) {
      return;
    }
    this.pausePanel.setPosition(this.scale.width / 2, this.scale.height / 2);
  }

  private syncManualPauseState(): void {
    const paused = this.pausePanel != null || this.statsPanel != null;
    gameEvents.emit("game:manualPause", paused);
  }

  private refreshStatsPanel(): void {
    if (this.statsPanelText == null || this.latestHud == null) {
      return;
    }
    const p = this.latestHud;
    this.statsPanelText.setText(
      [
        `伤害: ${p.effectiveDamage.toFixed(1)}`,
        `子弹伤害倍率: x${p.bulletDamageMul.toFixed(2)}`,
        `射速: ${p.effectiveFireRate.toFixed(2)}/s`,
        `暴击率: ${(p.critChance * 100).toFixed(1)}%`,
        `暴伤倍率: ${p.critMultiplier.toFixed(2)}`,
        `移速: ${p.effectiveMoveSpeed.toFixed(0)}`,
        `子弹数: ${p.projectileCount}`,
        `子弹体积: ${p.projectileSize.toFixed(1)}`,
        `换弹: ${(p.reloadMs / 1000).toFixed(2)}s`,
        `拾取范围: ${p.pickupRadius.toFixed(0)}`,
      ].join("\n"),
    );
  }

  private toggleDevPanel(): void {
    if (!this.devUnlocked) {
      return;
    }
    if (this.devPanel != null) {
      this.devPanel.destroy(true);
      this.devPanel = undefined;
      this.closeDevUpgradePanel(false);
      this.devUpgradePanelMode = "root";
      return;
    }

    const w = this.isMobileUi ? 310 : 760;
    const h = this.isMobileUi ? 420 : 430;
    const panelBg = this.add.rectangle(0, 0, w, h, 0x020617, 0.95).setStrokeStyle(2, 0x334155, 0.95);
    const title = this.add
      .text(0, -h / 2 + 28, "开发者模式", {
        color: "#fef3c7",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "18px" : "24px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const makeBtn = (x: number, y: number, label: string, color: number, onClick: () => void) => {
      const bw = this.isMobileUi ? 132 : 146;
      const bh = this.isMobileUi ? 34 : 38;
      const bg = this.add.rectangle(x, y, bw, bh, color, 0.95).setStrokeStyle(1, 0x93c5fd, 0.9).setInteractive({ useHandCursor: true });
      const text = this.add
        .text(x, y, label, {
          color: "#eff6ff",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "13px" : "14px",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      bg.on("pointerdown", onClick);
      return [bg, text] as const;
    };

    const nodes: Phaser.GameObjects.GameObject[] = [panelBg, title];
    const rowY = this.isMobileUi ? -140 : -138;
    const rowStep = this.isMobileUi ? 44 : 50;
    const colX = this.isMobileUi ? [-76, 76] : [-228, -76, 76, 228];

    const pushBtn = (row: number, col: number, label: string, color: number, onClick: () => void) => {
      const [b, t] = makeBtn(colX[col], rowY + row * rowStep, label, color, onClick);
      nodes.push(b, t);
    };

    pushBtn(0, 0, "召唤100小怪", 0x1d4ed8, () => gameEvents.emit("dev:spawnNormals", 100));
    pushBtn(0, 1, "清除所有怪", 0x475569, () => gameEvents.emit("dev:clearAllEnemies"));
    if (!this.isMobileUi) {
      pushBtn(0, 2, this.devState.autoSpawn ? "自动刷怪:开" : "自动刷怪:关", 0x0369a1, () => {
        gameEvents.emit("dev:setAutoSpawn", !this.devState.autoSpawn);
      });
      pushBtn(0, 3, this.devState.godMode ? "无敌:开" : "无敌:关", 0x7c3aed, () => gameEvents.emit("dev:toggleGodMode"));
    }

    pushBtn(1, 0, "召唤小BossA", 0xbe123c, () => gameEvents.emit("dev:spawnBoss", "miniA"));
    pushBtn(1, 1, "召唤小BossB", 0xbe123c, () => gameEvents.emit("dev:spawnBoss", "miniB"));
    if (!this.isMobileUi) {
      pushBtn(1, 2, "召唤小BossC", 0xbe123c, () => gameEvents.emit("dev:spawnBoss", "miniC"));
      pushBtn(1, 3, "召唤小BossD", 0xbe123c, () => gameEvents.emit("dev:spawnBoss", "miniD"));
    }

    pushBtn(2, 0, "召唤小BossE", 0xdc2626, () => gameEvents.emit("dev:spawnBoss", "miniE"));
    pushBtn(2, 1, "召唤小BossF", 0xdc2626, () => gameEvents.emit("dev:spawnBoss", "miniF"));
    if (!this.isMobileUi) {
      pushBtn(2, 2, "召唤大BossA", 0xea580c, () => gameEvents.emit("dev:spawnBoss", "mainA"));
      pushBtn(2, 3, "召唤大BossB", 0xea580c, () => gameEvents.emit("dev:spawnBoss", "mainB"));
    }

    pushBtn(3, 0, "召唤最终Boss", 0xb91c1c, () => gameEvents.emit("dev:spawnBoss", "final"));
    pushBtn(3, 1, "一键满血", 0x15803d, () => gameEvents.emit("dev:healFull"));
    if (!this.isMobileUi) {
      pushBtn(3, 2, this.devState.oneHitKill ? "一击必杀:开" : "一击必杀:关", 0x9d174d, () => gameEvents.emit("dev:toggleOneHitKill"));
    } else {
      pushBtn(4, 0, this.devState.oneHitKill ? "一击必杀:开" : "一击必杀:关", 0x9d174d, () => gameEvents.emit("dev:toggleOneHitKill"));
    }

    const editBtnY = this.isMobileUi ? 144 : 152;
    const [editBg, editTxt] = makeBtn(0, editBtnY, "设置升级等级", 0x334155, () => this.openDevUpgradePanel());
    nodes.push(editBg, editTxt);
    const closeBtnY = editBtnY + (this.isMobileUi ? 44 : 48);
    const [closeBg, closeTxt] = makeBtn(0, closeBtnY, "关闭面板", 0x7f1d1d, () => this.toggleDevPanel());
    nodes.push(closeBg, closeTxt);

    this.devPanel = this.add.container(this.scale.width / 2, this.scale.height / 2, nodes).setDepth(4600).setScrollFactor(0);
  }

  private refreshDevPanelLabels(): void {
    if (this.devPanel == null) {
      return;
    }
    this.devPanel.destroy(true);
    this.devPanel = undefined;
    this.toggleDevPanel();
  }

  private openDevUpgradePanel(
    mode: "root" | "main_weapon" | "player_attr" | "sub_weapon" = "root",
    requestData = true,
  ): void {
    if (!this.devUnlocked) {
      return;
    }
    this.closeDevUpgradePanel(false);
    if (this.devPanel != null) {
      this.devPanel.setVisible(false);
    }
    this.devUpgradePanelMode = mode;
    if (requestData) {
      gameEvents.emit("dev:requestUpgradeLevels");
      gameEvents.emit("dev:requestSkillState");
    }

    const panelW = this.isMobileUi ? 330 : 460;
    const panelH = this.isMobileUi ? 418 : 438;
    const bg = this.add
      .rectangle(0, 0, panelW, panelH, 0x020617, 0.96)
      .setStrokeStyle(2, 0x475569, 0.95)
      .setInteractive({ useHandCursor: false });
    const titleText =
      mode === "root"
        ? "升级调试分类"
        : mode === "main_weapon"
          ? "主武器升级"
          : mode === "player_attr"
            ? "角色属性"
            : "副武器";
    const title = this.add
      .text(0, -panelH / 2 + 24, titleText, {
        color: "#e2e8f0",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "18px" : "21px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const nodes: Phaser.GameObjects.GameObject[] = [bg, title];
    const mkBtn = (x: number, y: number, label: string, color: number, onClick: () => void, w = 170) => {
      const btn = this.add
        .rectangle(x, y, this.isMobileUi ? Math.min(w, 146) : w, this.isMobileUi ? 36 : 40, color, 0.95)
        .setStrokeStyle(1, 0x64748b, 0.95)
        .setInteractive({ useHandCursor: true });
      const txt = this.add
        .text(x, y, label, {
          color: "#f1f5f9",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "13px" : "14px",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      btn.on("pointerdown", onClick);
      nodes.push(btn, txt);
    };

    const closeX = panelW / 2 - 20;
    const closeY = -panelH / 2 + 20;
    const closeAll = () => {
      this.closeDevUpgradePanel(true);
      this.toggleDevPanel();
    };
    mkBtn(closeX, closeY, "×", 0x7f1d1d, closeAll, 30);
    if (mode !== "root") {
      mkBtn(-panelW / 2 + 42, closeY, "返回", 0x334155, () => this.openDevUpgradePanel("root"), 72);
    }

    if (mode === "root") {
      mkBtn(0, -62, "主武器升级", 0x1d4ed8, () => this.openDevUpgradePanel("main_weapon"), 240);
      mkBtn(0, -8, "角色属性", 0x0369a1, () => this.openDevUpgradePanel("player_attr"), 240);
      mkBtn(0, 46, "副武器（含获取）", 0x7c3aed, () => this.openDevUpgradePanel("sub_weapon"), 240);
      this.devUpgradePanel = this.add.container(this.scale.width / 2, this.scale.height / 2, nodes).setDepth(4700).setScrollFactor(0);
      return;
    }

    if (mode === "main_weapon" || mode === "player_attr") {
      const items: Array<{ id: string; label: string }> =
        mode === "main_weapon"
          ? [
              { id: "damage_up", label: "子弹伤害" },
              { id: "fire_rate", label: "射速" },
              { id: "projectile_count", label: "子弹数量" },
              { id: "projectile_size", label: "子弹体积" },
              { id: "max_ammo", label: "弹夹容量" },
              { id: "reload_speed", label: "换弹速度" },
            ]
          : [
              { id: "move_speed", label: "移速" },
              { id: "pickup_range", label: "拾取范围" },
            ];
      const startY = -panelH / 2 + 72;
      const stepY = this.isMobileUi ? 42 : 44;
      for (let i = 0; i < items.length; i += 1) {
        const rowY = startY + i * stepY;
        const it = items[i];
        const lv = this.devUpgradeLevels[it.id] ?? 0;
        const label = this.add
          .text(-panelW / 2 + 18, rowY, `${it.label}  Lv.${lv}`, {
            color: "#cbd5e1",
            fontFamily: "Segoe UI",
            fontSize: this.isMobileUi ? "13px" : "14px",
            fontStyle: "bold",
          })
          .setOrigin(0, 0.5);
        nodes.push(label);
        mkBtn(panelW / 2 - 96, rowY, "-", 0x1f2937, () => gameEvents.emit("dev:adjustUpgradeLevel", { upgradeId: it.id, delta: -1 }), 30);
        mkBtn(panelW / 2 - 52, rowY, "+", 0x1f2937, () => gameEvents.emit("dev:adjustUpgradeLevel", { upgradeId: it.id, delta: 1 }), 30);
      }
      this.devUpgradePanel = this.add.container(this.scale.width / 2, this.scale.height / 2, nodes).setDepth(4700).setScrollFactor(0);
      return;
    }

    const subRows: Array<{ kind: DevSkillKind; name: string; aLabel: string; bLabel: string }> = [
      { kind: "flamethrower", name: "喷火器", aLabel: "频率", bLabel: "范围" },
      { kind: "lightning_bug", name: "闪电虫", aLabel: "触发", bLabel: "弹射" },
      { kind: "poison_orb", name: "毒囊", aLabel: "毒伤", bLabel: "持续" },
      { kind: "frost_core", name: "寒霜核心", aLabel: "触发", bLabel: "强度" },
    ];
    const startY = -panelH / 2 + 72;
    const stepY = this.isMobileUi ? 78 : 84;
    for (let i = 0; i < subRows.length; i += 1) {
      const rowY = startY + i * stepY;
      const row = subRows[i];
      const unlock = this.devSkillUnlocked[row.kind];
      const lvA = this.devSkillLevels[row.kind].a;
      const lvB = this.devSkillLevels[row.kind].b;
      const head = this.add
        .text(-panelW / 2 + 16, rowY - 18, `${row.name}  ${unlock ? "已获取" : "未获取"}`, {
          color: unlock ? "#93c5fd" : "#94a3b8",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "12px" : "13px",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      nodes.push(head);
      mkBtn(
        panelW / 2 - 74,
        rowY - 18,
        unlock ? "关闭" : "获取",
        unlock ? 0x6b7280 : 0x1d4ed8,
        () => gameEvents.emit("dev:setSkillUnlock", { kind: row.kind, enabled: !unlock }),
        58,
      );
      const info = this.add
        .text(-panelW / 2 + 16, rowY + 10, `${row.aLabel} Lv.${lvA}    ${row.bLabel} Lv.${lvB}`, {
          color: "#cbd5e1",
          fontFamily: "Consolas",
          fontSize: this.isMobileUi ? "12px" : "13px",
        })
        .setOrigin(0, 0.5);
      nodes.push(info);
      mkBtn(panelW / 2 - 130, rowY + 10, `${row.aLabel}-`, 0x1f2937, () => gameEvents.emit("dev:adjustSkillNode", { kind: row.kind, node: "a", delta: -1 }), 54);
      mkBtn(panelW / 2 - 72, rowY + 10, `${row.aLabel}+`, 0x1f2937, () => gameEvents.emit("dev:adjustSkillNode", { kind: row.kind, node: "a", delta: 1 }), 54);
      mkBtn(panelW / 2 - 14, rowY + 10, `${row.bLabel}-`, 0x1f2937, () => gameEvents.emit("dev:adjustSkillNode", { kind: row.kind, node: "b", delta: -1 }), 54);
      mkBtn(panelW / 2 + 44, rowY + 10, `${row.bLabel}+`, 0x1f2937, () => gameEvents.emit("dev:adjustSkillNode", { kind: row.kind, node: "b", delta: 1 }), 54);
    }

    this.devUpgradePanel = this.add.container(this.scale.width / 2, this.scale.height / 2, nodes).setDepth(4700).setScrollFactor(0);
  }

  private refreshDevUpgradePanel(): void {
    if (this.devUpgradePanel == null) {
      return;
    }
    this.openDevUpgradePanel(this.devUpgradePanelMode, false);
  }

  private closeDevUpgradePanel(showMainPanel: boolean): void {
    this.devUpgradePanel?.destroy(true);
    this.devUpgradePanel = undefined;
    this.devUpgradePanelMode = "root";
    if (showMainPanel && this.devPanel != null) {
      this.devPanel.setVisible(true);
    }
  }

  private onDevIconTap(): void {
    const now = this.time.now;
    if (now > this.devTapResetAt) {
      this.devTapCount = 0;
    }
    this.devTapCount += 1;
    this.devTapResetAt = now + 1200;
    if (this.devTapCount < 3) {
      return;
    }
    this.devTapCount = 0;
    const input = window.prompt("请输入开发者关键词：");
    if (input == null) {
      return;
    }
    if (input.trim() !== DEV_UNLOCK_KEYWORD) {
      this.showToast("关键词错误", "#fca5a5");
      return;
    }
    if (!this.devUnlocked) {
      this.devUnlocked = true;
      gameEvents.emit("dev:activate");
      this.modalOverlay?.destroy(true);
      this.modalOverlay = undefined;
      gameEvents.emit("game:start");
      this.showToast("开发者模式已解锁", "#facc15");
      this.layoutUI();
    }
    this.toggleDevPanel();
  }

  private showToast(text: string, color: string): void {
    this.toastText?.destroy();
    this.toastText = this.add.text(this.scale.width / 2, this.isMobileUi ? 52 : 34, text, {
      color,
      fontFamily: "Segoe UI",
      fontSize: this.isMobileUi ? "18px" : "24px",
      fontStyle: "bold",
      stroke: "#020617",
      strokeThickness: 4,
    });
    this.toastText.setOrigin(0.5).setScrollFactor(0).setDepth(3000);
    this.tweens.add({
      targets: this.toastText,
      y: this.toastText.y - 18,
      alpha: 0,
      duration: 1100,
      ease: "Quad.Out",
      onComplete: () => {
        this.toastText?.destroy();
        this.toastText = undefined;
      },
    });
  }

  private showWarning(text: string, color: string): void {
    const warning = this.add.text(this.scale.width / 2, this.scale.height / 2 - 20, text, {
      color,
      fontFamily: "Segoe UI",
      fontSize: this.isMobileUi ? "28px" : "42px",
      fontStyle: "bold",
      stroke: "#020617",
      strokeThickness: 6,
    });
    warning.setOrigin(0.5).setScrollFactor(0).setDepth(3200);
    this.tweens.add({
      targets: warning,
      scale: 1.08,
      alpha: 0,
      duration: 1100,
      ease: "Cubic.Out",
      onComplete: () => warning.destroy(),
    });
  }

  private openStartPanel(): void {
    this.modalOverlay?.destroy(true);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const backdrop = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.72).setInteractive();
    const title = this.add
      .text(cx, cy - 90, "弹幕生存", {
        color: "#f8fafc",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "36px" : "48px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const desc = this.add
      .text(cx, cy - 30, this.isMobileUi ? "拖动摇杆移动，走位躲弹幕并击败Boss" : "WASD 移动，R 换弹，升级后变强并挑战 Boss", {
        color: "#cbd5e1",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "18px" : "22px",
      })
      .setOrigin(0.5);
    const btn = this.add.rectangle(cx, cy + 46, this.isMobileUi ? 220 : 260, 56, 0x2563eb, 0.95).setStrokeStyle(2, 0x93c5fd).setInteractive({ useHandCursor: true });
    const btnText = this.add
      .text(cx, cy + 46, "开始游戏", {
        color: "#eff6ff",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "24px" : "28px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const devIcon = this.add
      .rectangle(this.scale.width - 28, 24, 22, 22, 0x0f172a, 0.8)
      .setStrokeStyle(1, 0x64748b, 0.9)
      .setInteractive({ useHandCursor: true });
    const devIconText = this.add
      .text(this.scale.width - 28, 24, "⚙", {
        color: "#94a3b8",
        fontFamily: "Segoe UI Emoji",
        fontSize: "14px",
      })
      .setOrigin(0.5);
    devIcon.on("pointerdown", () => this.onDevIconTap());
    btn.on("pointerdown", () => {
      this.modalOverlay?.destroy(true);
      this.modalOverlay = undefined;
      gameEvents.emit("game:start");
    });
    this.modalOverlay = this.add
      .container(0, 0, [backdrop, title, desc, btn, btnText, devIcon, devIconText])
      .setDepth(5000)
      .setScrollFactor(0);
  }

  private openResultPanel(win: boolean): void {
    this.modalOverlay?.destroy(true);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const backdrop = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.74).setInteractive();
    const title = this.add
      .text(cx, cy - 76, win ? "通关成功" : "挑战失败", {
        color: win ? "#86efac" : "#fca5a5",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "34px" : "46px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const btn = this.add.rectangle(cx, cy + 34, this.isMobileUi ? 220 : 260, 56, 0x2563eb, 0.95).setStrokeStyle(2, 0x93c5fd).setInteractive({ useHandCursor: true });
    const btnText = this.add
      .text(cx, cy + 34, "重新开始", {
        color: "#eff6ff",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "24px" : "28px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    btn.on("pointerdown", () => {
      window.location.reload();
    });
    this.modalOverlay = this.add.container(0, 0, [backdrop, title, btn, btnText]).setDepth(5000).setScrollFactor(0);
  }

  private openResultPanelV2(win: boolean, elapsedSec: number, canRevive: boolean): void {
    this.modalOverlay?.destroy(true);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const backdrop = this.add.rectangle(cx, cy, this.scale.width, this.scale.height, 0x000000, 0.74).setInteractive();
    const title = this.add
      .text(cx, cy - 76, win ? "通关成功" : "挑战失败", {
        color: win ? "#86efac" : "#fca5a5",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "34px" : "46px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const surviveText = this.add
      .text(cx, cy - 18, `生存时间：${this.formatRunTime(elapsedSec)}`, {
        color: "#e2e8f0",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "20px" : "26px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const restartY = win || !canRevive ? cy + 52 : cy + 116;
    const restartBtn = this.add
      .rectangle(cx, restartY, this.isMobileUi ? 220 : 260, 56, 0x2563eb, 0.95)
      .setStrokeStyle(2, 0x93c5fd)
      .setInteractive({ useHandCursor: true });
    const restartText = this.add
      .text(cx, restartY, "重新开始", {
        color: "#eff6ff",
        fontFamily: "Segoe UI",
        fontSize: this.isMobileUi ? "24px" : "28px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    restartBtn.on("pointerdown", () => {
      window.location.reload();
    });

    const parts: Phaser.GameObjects.GameObject[] = [backdrop, title, surviveText, restartBtn, restartText];
    if (!win && canRevive) {
      const reviveBtn = this.add
        .rectangle(cx, cy + 48, this.isMobileUi ? 260 : 320, 52, 0x7c3aed, 0.92)
        .setStrokeStyle(2, 0xc4b5fd)
        .setInteractive({ useHandCursor: true });
      const reviveText = this.add
        .text(cx, cy + 40, "输入神秘代码复活", {
          color: "#f5f3ff",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "18px" : "22px",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      const reviveHint = this.add
        .text(cx, cy + 68, "", {
          color: "#ddd6fe",
          fontFamily: "Segoe UI",
          fontSize: this.isMobileUi ? "13px" : "15px",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setVisible(false);
      reviveBtn.on("pointerdown", () => {
        const code = window.prompt("请输入神秘代码（提示：作者是大帅哥）：");
        if (code == null) {
          return;
        }
        if (code.trim() === "作者是大帅哥") {
          this.modalOverlay?.destroy(true);
          this.modalOverlay = undefined;
          gameEvents.emit("game:reviveByCode");
          return;
        }
        this.showToast("神秘代码错误", "#fca5a5");
      });
      parts.push(reviveBtn, reviveText, reviveHint);
    }
    this.modalOverlay = this.add.container(0, 0, parts).setDepth(5000).setScrollFactor(0);
  }

  private syncMobileHudAnchors(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = Math.round(w / 2);
    const by = Math.round(h - 58);

    const bgWidth = Math.max(150, Math.min(220, w - 130));
    this.bottomBg.setVisible(true);
    this.bottomBg.setOrigin(0.5, 0.5);
    this.bottomBg.setSize(bgWidth, 36);
    this.bottomBg.setPosition(cx, by);

    this.ammoText.setPosition(cx, by - 8).setFontSize("12px");

    this.hudBarWidth = Math.max(120, Math.min(160, bgWidth - 18));
    const lineX = cx - Math.round(this.hudBarWidth / 2) + 2;
    this.expBarFill.setPosition(lineX, by + 2);
    this.ammoBarFill.setPosition(lineX, by + 8);
    this.reloadBarFill.setPosition(lineX, by + 14);
  }
}
