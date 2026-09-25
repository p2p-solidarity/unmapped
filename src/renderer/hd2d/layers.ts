// The things standing on HD-2D ground: pixel sprites upright on their feet (instanced per sprite,
// casting real shadows through their alpha), carved blocks for props the sheets have no sprite
// for, wall blocks, and glowing crests for the land's markers (door, notes, story gates).

import * as THREE from "three";
import { HD2D_PALETTE } from "../engine/palette";
import type { AtlasId } from "../engine2d/assetCatalog";
import type { Billboard, SheetRect } from "./assets";

export type AtlasTextures = Record<AtlasId, THREE.Texture>;

export interface BoardInstance {
  board: Billboard;
  x: number;
  /** Height of the ground it stands on. */
  y: number;
  z: number;
  scale: number;
}

/** UVs of a sheet rect, inset half a texel so neighbouring sprites never bleed in. */
export function rectUv(rect: SheetRect, image: { width: number; height: number }): number[] {
  const u0 = (rect.sx + 0.02) / image.width;
  const u1 = (rect.sx + rect.sw - 0.02) / image.width;
  const v0 = 1 - (rect.sy + rect.sh - 0.02) / image.height;
  const v1 = 1 - (rect.sy + 0.02) / image.height;
  // PlaneGeometry order: top-left, top-right, bottom-left, bottom-right.
  return [u0, v1, u1, v1, u0, v0, u1, v0];
}

/** A 1 × 1 upright quad standing on its bottom edge, mapped to one sheet rect. */
export function boardGeometry(rect: SheetRect, image: { width: number; height: number }) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(rectUv(rect, image), 2));
  return geometry;
}

export function spriteMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  });
}

interface Batch {
  mesh: THREE.InstancedMesh;
  capacity: number;
}

/** Every upright sprite on screen, one instanced batch per sprite id. */
export class BoardLayer {
  private readonly batches = new Map<string, Batch>();
  private readonly materials = new Map<AtlasId, THREE.MeshStandardMaterial>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly matrix = new THREE.Matrix4();

  constructor(
    private readonly root: THREE.Object3D,
    private readonly textures: AtlasTextures,
  ) {}

  set(instances: readonly BoardInstance[]): void {
    const grouped = new Map<string, BoardInstance[]>();
    for (const instance of instances) {
      const list = grouped.get(instance.board.id);
      if (list === undefined) grouped.set(instance.board.id, [instance]);
      else list.push(instance);
    }
    for (const [id, batch] of this.batches) {
      if (!grouped.has(id)) batch.mesh.count = 0;
    }
    for (const list of grouped.values()) {
      const first = list[0];
      if (first === undefined) continue;
      const batch = this.batch(first.board, list.length);
      list.forEach((instance, index) => {
        const width = instance.board.widthTiles * instance.scale;
        const height = width * (instance.board.sh / instance.board.sw);
        this.matrix.makeScale(width, height, 1);
        this.matrix.setPosition(instance.x, instance.y, instance.z);
        batch.mesh.setMatrixAt(index, this.matrix);
      });
      batch.mesh.count = list.length;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.computeBoundingSphere();
    }
  }

  private batch(board: Billboard, needed: number): Batch {
    const existing = this.batches.get(board.id);
    if (existing !== undefined && existing.capacity >= needed) return existing;
    if (existing !== undefined) {
      this.root.remove(existing.mesh);
      existing.mesh.dispose();
    }
    const capacity = Math.max(16, 2 ** Math.ceil(Math.log2(needed)));
    const mesh = new THREE.InstancedMesh(
      this.geometry(board),
      this.material(board.atlas),
      capacity,
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.root.add(mesh);
    const batch = { mesh, capacity };
    this.batches.set(board.id, batch);
    return batch;
  }

  private geometry(board: Billboard): THREE.BufferGeometry {
    const hit = this.geometries.get(board.id);
    if (hit !== undefined) return hit;
    const image = this.textures[board.atlas].image as { width: number; height: number };
    const geometry = boardGeometry(board, image);
    this.geometries.set(board.id, geometry);
    return geometry;
  }

  private material(atlas: AtlasId): THREE.MeshStandardMaterial {
    const hit = this.materials.get(atlas);
    if (hit !== undefined) return hit;
    const material = spriteMaterial(this.textures[atlas]);
    this.materials.set(atlas, material);
    return material;
  }

  dispose(): void {
    for (const batch of this.batches.values()) {
      this.root.remove(batch.mesh);
      batch.mesh.dispose();
    }
    for (const geometry of this.geometries.values()) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.batches.clear();
  }
}

export interface BlockInstance {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
}

/** Plain instanced boxes (walls, props without a sprite), resized per instance. */
export class BlockLayer {
  private mesh: THREE.InstancedMesh | null = null;
  private capacity = 0;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly matrix = new THREE.Matrix4();

  constructor(
    private readonly root: THREE.Object3D,
    private readonly material: THREE.Material,
  ) {
    this.geometry.translate(0, 0.5, 0);
  }

  set(blocks: readonly BlockInstance[]): void {
    if (this.mesh === null || blocks.length > this.capacity) {
      if (this.mesh !== null) {
        this.root.remove(this.mesh);
        this.mesh.dispose();
      }
      this.capacity = Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, blocks.length))));
      this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.mesh.frustumCulled = false;
      this.root.add(this.mesh);
    }
    blocks.forEach((block, index) => {
      this.matrix.makeScale(block.width, block.height, block.width);
      this.matrix.setPosition(block.x, block.y, block.z);
      this.mesh?.setMatrixAt(index, this.matrix);
    });
    this.mesh.count = blocks.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.mesh !== null) {
      this.root.remove(this.mesh);
      this.mesh.dispose();
    }
    this.geometry.dispose();
  }
}

export interface MarkerInstance {
  key: string;
  x: number;
  y: number;
  z: number;
  color: string;
  glyph: string;
  label: string;
  /** Draw a light beam over it (an open story gate). */
  beam: boolean;
}

const BEAM_VERTEX = /* glsl */ `
varying float vHeight;
void main() {
  vHeight = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float time;
varying float vHeight;
void main() {
  float pulse = 0.75 + 0.25 * sin(time * 2.2 - vHeight * 6.0);
  float alpha = pow(1.0 - vHeight, 1.6) * 0.55 * pulse;
  gl_FragColor = vec4(color * 2.2, alpha);
}`;

/** Glowing crests over markers, plus a light beam over each open gate. */
export class MarkerLayer {
  private readonly sprites = new Map<string, THREE.Sprite>();
  private readonly beams = new Map<string, THREE.Mesh>();
  private readonly textures = new Map<string, THREE.CanvasTexture>();
  private readonly beamGeometry = new THREE.CylinderGeometry(0.28, 0.55, 7, 20, 1, true);
  private readonly beamMaterial = new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(HD2D_PALETTE.gateBeam) },
      time: { value: 0 },
    },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

  constructor(private readonly root: THREE.Object3D) {
    this.beamGeometry.translate(0, 3.5, 0);
  }

  set(markers: readonly MarkerInstance[]): void {
    const seen = new Set<string>();
    for (const marker of markers) {
      seen.add(marker.key);
      let sprite = this.sprites.get(marker.key);
      const look = `${marker.glyph}|${marker.color}`;
      if (sprite === undefined || sprite.userData.look !== look) {
        if (sprite !== undefined) this.root.remove(sprite);
        sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.crest(marker.glyph, marker.color),
            depthWrite: false,
            toneMapped: false,
          }),
        );
        sprite.userData.look = look;
        sprite.scale.set(0.9, 0.9, 1);
        this.sprites.set(marker.key, sprite);
        this.root.add(sprite);
      }
      sprite.position.set(marker.x, marker.y + 1.25, marker.z);
      sprite.userData.baseY = marker.y + 1.25;
      const beam = this.beams.get(marker.key);
      if (marker.beam && beam === undefined) {
        const mesh = new THREE.Mesh(this.beamGeometry, this.beamMaterial);
        mesh.position.set(marker.x, marker.y, marker.z);
        this.beams.set(marker.key, mesh);
        this.root.add(mesh);
      } else if (!marker.beam && beam !== undefined) {
        this.root.remove(beam);
        this.beams.delete(marker.key);
      } else if (beam !== undefined) {
        beam.position.set(marker.x, marker.y, marker.z);
      }
    }
    for (const [key, sprite] of this.sprites) {
      if (seen.has(key)) continue;
      this.root.remove(sprite);
      sprite.material.dispose();
      this.sprites.delete(key);
      const beam = this.beams.get(key);
      if (beam !== undefined) this.root.remove(beam);
      this.beams.delete(key);
    }
  }

  /** Crests bob gently; beams pulse. */
  animate(seconds: number): void {
    const time = this.beamMaterial.uniforms.time;
    if (time !== undefined) time.value = seconds;
    let index = 0;
    for (const sprite of this.sprites.values()) {
      const base = (sprite.userData.baseY as number | undefined) ?? 1.25;
      sprite.position.y = base + Math.sin(seconds * 1.8 + index * 1.3) * 0.08;
      index += 1;
    }
  }

  private crest(glyph: string, color: string): THREE.CanvasTexture {
    const key = `${glyph}|${color}`;
    const hit = this.textures.get(key);
    if (hit !== undefined) return hit;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx !== null) {
      const middle = size / 2;
      ctx.translate(middle, middle);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = HD2D_PALETTE.compassSurface;
      ctx.fillRect(-34, -34, 68, 68);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.strokeRect(-34, -34, 68, 68);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = color;
      ctx.font = "bold 46px 'Hiragino Mincho ProN', 'Songti TC', Georgia, serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(glyph, 0, 3);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, texture);
    return texture;
  }

  dispose(): void {
    for (const sprite of this.sprites.values()) {
      this.root.remove(sprite);
      sprite.material.dispose();
    }
    for (const beam of this.beams.values()) this.root.remove(beam);
    for (const texture of this.textures.values()) texture.dispose();
    this.beamGeometry.dispose();
    this.beamMaterial.dispose();
    this.sprites.clear();
    this.beams.clear();
  }
}
