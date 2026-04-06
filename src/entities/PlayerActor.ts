import Phaser from "phaser";
import type { PlayerStats } from "../core/types";

export class PlayerActor {
  public readonly sprite: Phaser.Physics.Arcade.Image;
  public readonly visual: Phaser.GameObjects.Image;
  public readonly hitRadius = 16;
  public readonly stats: PlayerStats;
  public level = 1;
  public exp = 0;
  public expToNext = 30;
  public isDead = false;

  public constructor(scene: Phaser.Scene, x: number, y: number, _color: number) {
    const textureKey = "player-emoji-icon";
    if (!scene.textures.exists(textureKey)) {
      const canvas = scene.textures.createCanvas(textureKey, 64, 64);
      if (canvas != null) {
        const ctx = canvas.getContext();
        ctx.clearRect(0, 0, 64, 64);
        ctx.font = `54px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("\u{1F9B8}", 32, 35);
        canvas.refresh();
      }
    }

    const mobileScale = scene.sys.game.device.input.touch ? 1.28 : 1;
    const rawSize = Math.round(52 * mobileScale);
    const size = rawSize % 2 === 0 ? rawSize : rawSize + 1;
    this.sprite = scene.physics.add.image(x, y, textureKey).setDisplaySize(size, size).setDepth(18);
    this.visual = scene.add.image(x, y, textureKey).setDisplaySize(size, size).setDepth(20);
    this.sprite.setCollideWorldBounds(true);
    this.sprite.setBounce(0, 0);
    this.sprite.setDrag(0, 0);
    this.sprite.setAlpha(0);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(this.hitRadius, this.sprite.displayWidth / 2 - this.hitRadius, this.sprite.displayHeight / 2 - this.hitRadius);

    this.stats = {
      maxHealth: 100,
      health: 100,
      moveSpeed: 190,
      damage: 16,
      critChance: 0.08,
      critMultiplier: 1.75,
      fireRate: 2.1,
      projectileCount: 1,
      projectileSpeed: 420,
      projectilePenetration: 1,
      projectileSize: 5,
      maxAmmo: 8,
      reloadMs: 2000,
      expGainMultiplier: 1,
      pickupRadius: 56,
    };
  }

  public setVelocity(vx: number, vy: number): void {
    this.sprite.setVelocity(vx, vy);
  }

  public syncVisual(): void {
    this.visual.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y));
  }

  public damage(amount: number): number {
    if (this.isDead) {
      return 0;
    }
    const nextHealth = this.stats.health - amount;
    const applied = this.stats.health - Math.max(0, nextHealth);
    this.stats.health = Math.max(0, nextHealth);
    if (this.stats.health <= 0) {
      this.stats.health = 0;
      this.isDead = true;
      this.sprite.setVisible(false);
      this.visual.setVisible(false);
      this.setVelocity(0, 0);
    }
    return applied;
  }
}
