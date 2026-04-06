import Phaser from "phaser";
import { getEliteAffixConfig, type EliteAffixId } from "../data/eliteAffixes";

let enemyId = 0;

export type EnemyKind = "normal" | "miniBoss" | "mainBoss" | "finalBoss";
export type EnemyVariant =
  | "grunt"
  | "runner"
  | "tank"
  | "spitter"
  | "miniA"
  | "miniB"
  | "miniC"
  | "miniD"
  | "miniE"
  | "miniF"
  | "mainA"
  | "mainB"
  | "final";

export class Enemy {
  public readonly id: number;
  public readonly sprite: Phaser.GameObjects.Arc;
  public readonly kind: EnemyKind;
  public readonly variant: EnemyVariant;
  public readonly visual: Phaser.GameObjects.Image;
  public readonly displayName: string;
  public readonly eliteAffixId?: EliteAffixId;
  public readonly isElite: boolean;
  public readonly eliteTintColor?: number;
  public maxHealth: number;
  public health: number;
  public moveSpeed: number;
  public contactDamage: number;
  public expReward: number;
  public projectileDamage = 0;
  public isDead = false;

  public constructor(scene: Phaser.Scene, x: number, y: number, kind: EnemyKind, variant?: EnemyVariant, eliteAffixId?: EliteAffixId) {
    this.id = enemyId++;
    this.kind = kind;
    this.variant = variant ?? this.pickVariantByKind(kind);
    const profile = this.getProfile(this.variant);
    this.eliteAffixId = eliteAffixId;
    this.isElite = eliteAffixId !== undefined;
    const affix = eliteAffixId === undefined ? undefined : getEliteAffixConfig(eliteAffixId);
    this.eliteTintColor = affix?.tintColor;
    this.displayName = affix === undefined ? profile.name : `${affix.name}·${profile.name}`;

    this.sprite = scene.add.circle(x, y, profile.hitboxRadius, 0x000000, 0);
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(profile.hitboxRadius);
    body.setCollideWorldBounds(true);

    const textureKey = `enemy-emoji-${this.variant}`;
    this.ensureEmojiTexture(scene, textureKey, profile.emoji, profile.auraColor);
    const mobileScale = scene.sys.game.device.input.touch ? (kind === "normal" ? 1.34 : 1.2) : 1;
    const rawSize = Math.round(profile.emojiSize * mobileScale);
    const size = rawSize % 2 === 0 ? rawSize : rawSize + 1;
    this.visual = scene.add.image(x, y, textureKey).setDisplaySize(size, size).setDepth(12);
    if (affix !== undefined) {
      this.visual.setTint(affix.tintColor);
    }

    this.maxHealth = profile.maxHealth;
    this.health = this.maxHealth;
    this.moveSpeed = profile.moveSpeed;
    this.contactDamage = profile.contactDamage;
    this.expReward = profile.expReward;
    this.projectileDamage = profile.projectileDamage;
    if (affix !== undefined) {
      this.maxHealth = Math.floor(this.maxHealth * affix.hpMul);
      this.health = this.maxHealth;
      this.moveSpeed *= affix.speedMul;
      this.contactDamage *= affix.damageMul;
      this.projectileDamage *= affix.damageMul;
      this.expReward = Math.floor(this.expReward * affix.expMul);
    }
  }

  public syncVisual(): void {
    this.visual.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y));
  }

  public destroy(): void {
    this.sprite.destroy();
    this.visual.destroy();
  }

  public damage(amount: number): number {
    if (this.isDead) {
      return 0;
    }
    const nextHealth = this.health - amount;
    const applied = this.health - Math.max(0, nextHealth);
    this.health = Math.max(0, nextHealth);
    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
    }
    return applied;
  }

  private pickVariantByKind(kind: EnemyKind): EnemyVariant {
    if (kind === "normal") {
      return Phaser.Utils.Array.GetRandom(["grunt", "runner", "tank", "spitter"] as const);
    }
    if (kind === "miniBoss") {
      return Phaser.Utils.Array.GetRandom(["miniA", "miniB", "miniC", "miniD", "miniE", "miniF"] as const);
    }
    if (kind === "mainBoss") {
      return Phaser.Utils.Array.GetRandom(["mainA", "mainB"] as const);
    }
    return "final";
  }

  private ensureEmojiTexture(scene: Phaser.Scene, textureKey: string, emoji: string, auraColor: string): void {
    if (scene.textures.exists(textureKey)) {
      return;
    }
    const size = 72;
    const canvas = scene.textures.createCanvas(textureKey, size, size);
    if (canvas == null) {
      return;
    }
    const ctx = canvas.getContext();
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = auraColor;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 27, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = `54px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, size / 2, size / 2 + 2);
    canvas.refresh();
  }

  private getProfile(variant: EnemyVariant): {
    name: string;
    emoji: string;
    auraColor: string;
    emojiSize: number;
    hitboxRadius: number;
    maxHealth: number;
    moveSpeed: number;
    contactDamage: number;
    expReward: number;
    projectileDamage: number;
  } {
    switch (variant) {
      case "runner":
        return {
          name: "Runner",
          emoji: "\u{1F43A}",
          auraColor: "#f59e0b",
          emojiSize: 40,
          hitboxRadius: 13,
          maxHealth: 24,
          moveSpeed: 105,
          contactDamage: 15,
          expReward: 9,
          projectileDamage: 0,
        };
      case "tank":
        return {
          name: "Tank",
          emoji: "\u{1F9F1}",
          auraColor: "#94a3b8",
          emojiSize: 44,
          hitboxRadius: 16,
          maxHealth: 52,
          moveSpeed: 56,
          contactDamage: 15,
          expReward: 14,
          projectileDamage: 0,
        };
      case "spitter":
        return {
          name: "Spitter",
          emoji: "\u{1F40D}",
          auraColor: "#22c55e",
          emojiSize: 40,
          hitboxRadius: 14,
          maxHealth: 33,
          moveSpeed: 72,
          contactDamage: 15,
          expReward: 11,
          projectileDamage: 8,
        };
      case "miniA":
        return {
          name: "Mini Boss A",
          emoji: "\u{1F479}",
          auraColor: "#a78bfa",
          emojiSize: 50,
          hitboxRadius: 24,
          maxHealth: 3600,
          moveSpeed: 88,
          contactDamage: 21,
          expReward: 240,
          projectileDamage: 0,
        };
      case "miniB":
        return {
          name: "Mini Boss B",
          emoji: "\u{1F982}",
          auraColor: "#fb7185",
          emojiSize: 50,
          hitboxRadius: 25,
          maxHealth: 5600,
          moveSpeed: 80,
          contactDamage: 23,
          expReward: 260,
          projectileDamage: 9,
        };
      case "miniC":
        return {
          name: "Mini Boss C",
          emoji: "\u{1F9DF}",
          auraColor: "#06b6d4",
          emojiSize: 50,
          hitboxRadius: 26,
          maxHealth: 8600,
          moveSpeed: 75,
          contactDamage: 24,
          expReward: 300,
          projectileDamage: 11,
        };
      case "miniD":
        return {
          name: "Mini Boss D",
          emoji: "\u{1F47A}",
          auraColor: "#f97316",
          emojiSize: 50,
          hitboxRadius: 26,
          maxHealth: 9800,
          moveSpeed: 78,
          contactDamage: 26,
          expReward: 340,
          projectileDamage: 10,
        };
      case "miniE":
        return {
          name: "Mini Boss E",
          emoji: "\u{1F9D0}",
          auraColor: "#f59e0b",
          emojiSize: 50,
          hitboxRadius: 27,
          maxHealth: 10800,
          moveSpeed: 72,
          contactDamage: 27,
          expReward: 360,
          projectileDamage: 12,
        };
      case "miniF":
        return {
          name: "Mini Boss F",
          emoji: "\u{1F480}",
          auraColor: "#ef4444",
          emojiSize: 50,
          hitboxRadius: 28,
          maxHealth: 12200,
          moveSpeed: 74,
          contactDamage: 29,
          expReward: 390,
          projectileDamage: 13,
        };
      case "mainA":
        return {
          name: "Main Boss A",
          emoji: "\u{1F608}",
          auraColor: "#f97316",
          emojiSize: 66,
          hitboxRadius: 38,
          maxHealth: 15600,
          moveSpeed: 62,
          contactDamage: 34,
          expReward: 1080,
          projectileDamage: 18,
        };
      case "mainB":
        return {
          name: "Main Boss B",
          emoji: "\u{1F47B}",
          auraColor: "#22d3ee",
          emojiSize: 66,
          hitboxRadius: 39,
          maxHealth: 19200,
          moveSpeed: 64,
          contactDamage: 36,
          expReward: 1320,
          projectileDamage: 20,
        };
      case "final":
        return {
          name: "Final Boss",
          emoji: "\u{1F47A}",
          auraColor: "#ef4444",
          emojiSize: 72,
          hitboxRadius: 48,
          maxHealth: 9600,
          moveSpeed: 67,
          contactDamage: 41,
          expReward: 2400,
          projectileDamage: 23,
        };
      case "grunt":
      default:
        return {
          name: "Grunt",
          emoji: "\u{1F47E}",
          auraColor: "#38bdf8",
          emojiSize: 42,
          hitboxRadius: 14,
          maxHealth: 32,
          moveSpeed: 78,
          contactDamage: 15,
          expReward: 10,
          projectileDamage: 0,
        };
    }
  }
}
