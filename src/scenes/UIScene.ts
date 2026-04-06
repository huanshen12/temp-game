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
}

interface PassiveOption {
  kind: PassiveDropKind;
  title: string;
  description: string;
}

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
  private bossBarBg!: Phaser.GameObjects.Rectangle;
  private bossBarFill!: Phaser.GameObjects.Rectangle;
  private bossNameText!: Phaser.GameObjects.Text;
  private bossHpText!: Phaser.GameObjects.Text;
  private heartPanel!: Phaser.GameObjects.Rectangle;
  private heartTitle!: Phaser.GameObjects.Text;
  private heartValue!: Phaser.GameObjects.Text;
  private mobileTimeText!: Phaser.GameObjects.Text;
  private heartSlots: HeartSlot[] = [];

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

    this.bottomBg = this.add.rectangle(0, 0, 520, 78, 0x020617, 0.78).setScrollFactor(0).setDepth(1000).setStrokeStyle(2, 0x334155, 0.9);
    this.ammoText = this.add.text(0, 0, "", { color: "#f8fafc", fontFamily: "Consolas", fontSize: "26px", fontStyle: "bold" }).setScrollFactor(0).setDepth(1002).setOrigin(0.5);

    this.expBarBg = this.add.rectangle(0, 0, 184, 8, 0x111827, 0.9).setScrollFactor(0).setDepth(1001).setOrigin(0, 0.5);
    this.expBarFill = this.add.rectangle(0, 0, 180, 4, 0x38bdf8, 1).setScrollFactor(0).setDepth(1002).setOrigin(0, 0.5);
    this.ammoBarBg = this.add.rectangle(0, 0, 184, 8, 0x111827, 0.9).setScrollFactor(0).setDepth(1001).setOrigin(0, 0.5);
    this.ammoBarFill = this.add.rectangle(0, 0, 180, 4, 0xf8fafc, 1).setScrollFactor(0).setDepth(1002).setOrigin(0, 0.5);
    this.reloadBarBg = this.add.rectangle(0, 0, 184, 8, 0x111827, 0.9).setScrollFactor(0).setDepth(1001).setOrigin(0, 0.5);
    this.reloadBarFill = this.add.rectangle(0, 0, 0, 4, 0xfbbf24, 1).setScrollFactor(0).setDepth(1002).setOrigin(0, 0.5);

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

    this.layoutUI();
    this.scale.on("resize", () => this.layoutUI());
    this.time.delayedCall(0, () => this.layoutUI());

    gameEvents.on("hud:update", (payload: HudPayload) => this.updateHud(payload));
    gameEvents.on("upgrade:open", ({ choices, rerollLeft }: { choices: UpgradeChoice[]; rerollLeft: number }) => {
      this.rerollLeft = rerollLeft;
      this.openUpgradePanel(choices);
    });
    gameEvents.on("passive:open", ({ option, rerollLeft }: { option: PassiveOption; rerollLeft: number }) => {
      this.rerollLeft = rerollLeft;
      this.openPassivePanel(option);
    });
    gameEvents.on("ui:toast", ({ text, color }: { text: string; color?: string }) => this.showToast(text, color ?? "#f8fafc"));
    gameEvents.on("ui:warning", ({ text, color }: { text: string; color?: string }) => this.showWarning(text, color ?? "#fca5a5"));
    gameEvents.on("ui:showStart", () => this.openStartPanel());
    gameEvents.on("ui:showGameOver", () => this.openResultPanel(false));
    gameEvents.on("ui:showWin", () => this.openResultPanel(true));
    void this.openUpgradePanelLegacy;
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
    this.bottomBg.width = 500;
    this.bottomBg.height = 78;
    this.bottomBg.setPosition(w / 2, this.bottomBarY);
    this.ammoText.setPosition(w / 2, this.bottomBarY - 10).setFontSize("24px");

    this.hudBarWidth = 184;
    const barsX = Math.round(w / 2 - this.bottomBg.width / 2 + 18);
    this.expBarBg.width = this.hudBarWidth;
    this.ammoBarBg.width = this.hudBarWidth;
    this.reloadBarBg.width = this.hudBarWidth;
    this.expBarBg.setPosition(barsX, this.bottomBarY + 8);
    this.expBarFill.setPosition(barsX + 2, this.bottomBarY + 8);
    this.ammoBarBg.setPosition(barsX, this.bottomBarY + 20);
    this.ammoBarFill.setPosition(barsX + 2, this.bottomBarY + 20);
    this.reloadBarBg.setPosition(barsX, this.bottomBarY + 32);
    this.reloadBarFill.setPosition(barsX + 2, this.bottomBarY + 32);
  }

  private updateHud(payload: HudPayload): void {
    if (this.scale.width !== this.lastLayoutW || this.scale.height !== this.lastLayoutH) {
      this.layoutUI();
    }

    const fillMax = this.hudBarWidth - 4;
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
    const passiveText = payload.passiveDetails.length > 0 ? payload.passiveDetails.map((item) => `• ${item}`).join("\n") : "暂无被动效果";
    this.rightText.setText(`被动技能\n${passiveText}`);
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
    const hint = this.add.text(centerX, centerY - (this.isMobileUi ? 140 : 112), config.hint, { color: "#cbd5e1", fontFamily: "Segoe UI", fontSize: this.isMobileUi ? "13px" : "18px" }).setOrigin(0.5);

    let rerollButton: Phaser.GameObjects.Rectangle | undefined;
    let rerollLabel: Phaser.GameObjects.Text | undefined;
    if (config.rerollLabel.length > 0) {
      const y = this.isMobileUi ? centerY + 176 : centerY + 170;
      rerollButton = this.add
        .rectangle(centerX, y, this.isMobileUi ? 190 : 250, this.isMobileUi ? 34 : 42, config.allowReroll ? 0x1d4ed8 : 0x374151, 0.92)
        .setStrokeStyle(2, 0x93c5fd)
        .setInteractive({ useHandCursor: config.allowReroll });
      rerollLabel = this.add.text(centerX, y, config.rerollLabel, { color: "#f8fafc", fontFamily: "Segoe UI", fontSize: this.isMobileUi ? "13px" : "18px" }).setOrigin(0.5);
    }

    if (config.allowReroll && rerollButton !== undefined) {
      rerollButton.on("pointerdown", () => this.triggerReroll(config.onReroll));
      this.input.keyboard?.once("keydown-Q", () => this.triggerReroll(config.onReroll));
    }

    const cards: Phaser.GameObjects.Container[] = [];
    config.cards.forEach((card, idx) => {
      const count = config.cards.length;
      const cardWidth = this.isMobileUi ? Math.min(this.scale.width - 52, 300) : 250;
      const cardHeight = this.isMobileUi ? 94 : 230;
      const x = this.isMobileUi ? centerX : count === 1 ? centerX : centerX - 290 + idx * 290;
      const y = this.isMobileUi ? centerY - (count - 1) * 50 + idx * 108 : centerY;
      const bg = this.add.rectangle(x, y, cardWidth, cardHeight, 0x1f2937, 0.95).setStrokeStyle(2, 0x334155).setInteractive({ useHandCursor: true });
      const titleText = this.add
        .text(x, y - (this.isMobileUi ? 18 : 55), card.title, { color: "#f8fafc", fontFamily: "Segoe UI", fontSize: this.isMobileUi ? "15px" : "22px", wordWrap: { width: cardWidth - 28 }, align: "center" })
        .setOrigin(0.5);
      const descText = this.add
        .text(x, y + (this.isMobileUi ? 13 : 25), card.description, { color: "#cbd5e1", fontFamily: "Segoe UI", fontSize: this.isMobileUi ? "11px" : "18px", wordWrap: { width: cardWidth - 34 }, align: "center" })
        .setOrigin(0.5);
      bg.on("pointerover", () => bg.setFillStyle(0x334155, 1));
      bg.on("pointerout", () => bg.setFillStyle(0x1f2937, 0.95));
      bg.on("pointerdown", card.onSelect);
      cards.push(this.add.container(0, 0, [bg, titleText, descText]));
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
    btn.on("pointerdown", () => {
      this.modalOverlay?.destroy(true);
      this.modalOverlay = undefined;
      gameEvents.emit("game:start");
    });
    this.modalOverlay = this.add.container(0, 0, [backdrop, title, desc, btn, btnText]).setDepth(5000).setScrollFactor(0);
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

  private syncMobileHudAnchors(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = Math.round(w / 2);
    const by = Math.round(h - 58);

    const bgWidth = Math.max(150, Math.min(220, w - 130));
    this.bottomBg.setVisible(true);
    this.bottomBg.setOrigin(0.5, 0.5);
    this.bottomBg.width = bgWidth;
    this.bottomBg.height = 36;
    this.bottomBg.setPosition(cx, by);

    this.ammoText.setPosition(cx, by - 8).setFontSize("12px");

    this.hudBarWidth = Math.max(120, Math.min(160, bgWidth - 18));
    const lineX = cx - Math.round(this.hudBarWidth / 2) + 2;
    this.expBarFill.setPosition(lineX, by + 2);
    this.ammoBarFill.setPosition(lineX, by + 8);
    this.reloadBarFill.setPosition(lineX, by + 14);
  }
}
