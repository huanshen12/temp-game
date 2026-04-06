import Phaser from "phaser";

export type ItemDropKind = "magnet" | "heal_potion";

export class ItemDrop {
  public readonly kind: ItemDropKind;
  public readonly sprite: Phaser.GameObjects.Image;

  public constructor(scene: Phaser.Scene, x: number, y: number, kind: ItemDropKind) {
    this.kind = kind;
    const textureKey = kind === "magnet" ? "item-drop-magnet" : "item-drop-heal";
    this.ensureTexture(scene, kind, textureKey);
    this.sprite = scene.add.image(x, y, textureKey).setDepth(12).setDisplaySize(26, 26);
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setCircle(10, 3, 3);
    scene.tweens.add({
      targets: this.sprite,
      scaleX: 1.08,
      scaleY: 1.08,
      yoyo: true,
      repeat: -1,
      duration: kind === "magnet" ? 520 : 700,
      ease: "Sine.InOut",
    });
  }

  private ensureTexture(scene: Phaser.Scene, kind: ItemDropKind, key: string): void {
    if (scene.textures.exists(key)) {
      return;
    }
    const canvas = scene.textures.createCanvas(key, 40, 40);
    if (canvas == null) {
      return;
    }
    const ctx = canvas.getContext();
    ctx.clearRect(0, 0, 40, 40);

    // Badge ring
    ctx.beginPath();
    ctx.arc(20, 20, 18, 0, Math.PI * 2);
    ctx.fillStyle = kind === "magnet" ? "#1e293b" : "#1f2937";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = kind === "magnet" ? "#f59e0b" : "#ef4444";
    ctx.stroke();

    if (kind === "magnet") {
      // U-shape magnet
      ctx.lineWidth = 6;
      ctx.strokeStyle = "#f59e0b";
      ctx.beginPath();
      ctx.moveTo(11, 13);
      ctx.lineTo(11, 23);
      ctx.arc(20, 23, 9, Math.PI, 0, false);
      ctx.lineTo(29, 13);
      ctx.stroke();

      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(8, 10, 6, 5);
      ctx.fillRect(26, 10, 6, 5);
    } else {
      // Potion bottle + white plus
      ctx.fillStyle = "#f43f5e";
      ctx.fillRect(16, 9, 8, 4);
      ctx.beginPath();
      ctx.moveTo(13, 14);
      ctx.lineTo(27, 14);
      ctx.lineTo(24, 30);
      ctx.lineTo(16, 30);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(18, 19, 4, 8);
      ctx.fillRect(16, 21, 8, 4);
    }
    canvas.refresh();
  }
}
