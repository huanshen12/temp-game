import Phaser from "phaser";

export type PassiveDropKind =
  | "last_stand"
  | "blast_core"
  | "blood_trigger"
  | "pain_rush"
  | "grim_resolve"
  | "threat_sensor";

export class PassiveDrop {
  public readonly kind: PassiveDropKind;
  public readonly title: string;
  public readonly description: string;
  public readonly sprite: Phaser.GameObjects.Arc;

  public constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: PassiveDropKind,
    title: string,
    description: string,
  ) {
    this.kind = kind;
    this.title = title;
    this.description = description;
    const colorByKind: Record<PassiveDropKind, number> = {
      last_stand: 0xf97316,
      blast_core: 0xfb7185,
      blood_trigger: 0xef4444,
      pain_rush: 0x60a5fa,
      grim_resolve: 0xfbbf24,
      threat_sensor: 0x67e8f9,
    };
    const color = colorByKind[kind];
    this.sprite = scene.add.circle(x, y, 11, color, 0.95);
    scene.physics.add.existing(this.sprite);
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
  }
}
