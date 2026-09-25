// Words over the HD-2D land, drawn crisp on a 2D canvas above the lens (a blurred label is
// unreadable): names over story gates and a compass at the screen edge toward the next gate.

import type * as THREE from "three";
import { Vector3 } from "three";
import { HD2D_PALETTE } from "../engine/palette";
import type { Foe } from "../engine2d/useLandCombat";

export interface OverlayLabel {
  x: number;
  z: number;
  text: string;
  color: string;
}

const SERIF = "'Iowan Old Style', 'Palatino', 'Hiragino Mincho ProN', 'Songti TC', Georgia, serif";
const point = new Vector3();

function project(camera: THREE.Camera, x: number, y: number, z: number) {
  point.set(x, y, z).project(camera);
  return { x: (point.x + 1) / 2, y: (1 - point.y) / 2, behind: point.z > 1 };
}

export function drawOverlay(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  size: { width: number; height: number; ratio: number },
  labels: readonly OverlayLabel[],
  compass: { x: number; z: number; label: string } | null,
  foes: readonly Foe[] = [],
): void {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return;
  const { width, height, ratio } = size;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const label of labels) {
    const at = project(camera, label.x, 2.3, label.z);
    if (at.behind || at.x < -0.1 || at.x > 1.1 || at.y < -0.1 || at.y > 1.1) continue;
    ctx.font = `600 15px ${SERIF}`;
    ctx.shadowColor = HD2D_PALETTE.labelShadow;
    ctx.shadowBlur = 6;
    ctx.fillStyle = HD2D_PALETTE.label;
    ctx.fillText(label.text, at.x * width, at.y * height);
    ctx.shadowBlur = 0;
  }

  // A foe's level, and its health once it has been hurt.
  for (const foe of foes) {
    const at = project(camera, foe.x, 1.9, foe.z);
    if (at.behind || at.x < -0.05 || at.x > 1.05 || at.y < -0.05 || at.y > 1.05) continue;
    const x = at.x * width;
    const y = at.y * height;
    ctx.font = `600 12px ${SERIF}`;
    ctx.shadowColor = HD2D_PALETTE.labelShadow;
    ctx.shadowBlur = 4;
    ctx.fillStyle = HD2D_PALETTE.label;
    ctx.fillText(`Lv ${foe.level}`, x, y - 10);
    ctx.shadowBlur = 0;
    if (foe.hp < foe.maxHp) {
      ctx.fillStyle = HD2D_PALETTE.foeHealthBack;
      ctx.fillRect(x - 20, y - 2, 40, 5);
      ctx.fillStyle = HD2D_PALETTE.foeHealth;
      ctx.fillRect(x - 19, y - 1, 38 * (foe.hp / Math.max(1, foe.maxHp)), 3);
    }
  }

  if (compass === null) return;
  const gate = project(camera, compass.x, 1, compass.z);
  const margin = 0.06;
  const onScreen =
    !gate.behind &&
    gate.x > margin &&
    gate.x < 1 - margin &&
    gate.y > margin &&
    gate.y < 1 - margin;
  if (onScreen) return;
  const angle = Math.atan2((gate.y - 0.5) * height, (gate.x - 0.5) * width);
  const rx = width / 2 - 64;
  const ry = height / 2 - 64;
  const reach = Math.min(
    rx / Math.abs(Math.cos(angle) || 1e-6),
    ry / Math.abs(Math.sin(angle) || 1e-6),
  );
  const cx = width / 2 + Math.cos(angle) * reach;
  const cy = height / 2 + Math.sin(angle) * reach;
  ctx.font = `600 14px ${SERIF}`;
  const textWidth = ctx.measureText(compass.label).width;
  ctx.fillStyle = HD2D_PALETTE.compassSurface;
  ctx.strokeStyle = HD2D_PALETTE.compassEdge;
  ctx.lineWidth = 1;
  ctx.fillRect(cx - textWidth / 2 - 12, cy + 16, textWidth + 24, 24);
  ctx.strokeRect(cx - textWidth / 2 - 12, cy + 16, textWidth + 24, 24);
  ctx.fillStyle = HD2D_PALETTE.label;
  ctx.fillText(compass.label, cx, cy + 28);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-8, -10);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fillStyle = HD2D_PALETTE.gateBeam;
  ctx.shadowColor = HD2D_PALETTE.gateBeam;
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.restore();
}
