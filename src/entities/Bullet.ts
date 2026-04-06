import Phaser from "phaser";

let bulletId = 0;

export class Bullet {
  public readonly id: number;
  public readonly sprite: Phaser.GameObjects.Arc;
  public readonly damage: number;
  public readonly isCrit: boolean;
  public readonly hitEnemyIds = new Set<number>();
  public penetrationLeft: number;
  public spawnAt: number;

  public constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    radius: number,
    color: number,
    damage: number,
    penetration: number,
    spawnAt: number,
    isCrit = false,
  ) {
    this.id = bulletId++;
    this.damage = damage;
    this.isCrit = isCrit;
    this.penetrationLeft = penetration;
    this.spawnAt = spawnAt;
    this.sprite = scene.add.circle(x, y, radius, color);
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setCollideWorldBounds(false);
  }
}
