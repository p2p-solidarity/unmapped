// HD-2D open land (plan.md §4 in the look of a lit diorama): the same land, chunks and markers the
// 16-bit view draws, but the ground is a pixel texture under a low warm sun, sprites stand upright
// and cast shadows, liquids sit in basins, and a tilt-shift lens with bloom turns it into a
// miniature. Imperative three.js driven by the caller's frame loop — no React, no stores.

import { chunkKey } from "@shared/chunks";
import * as THREE from "three";
import { HD2D_PALETTE, LAND_2D_PALETTE } from "../engine/palette";
import type { RemotePlayer } from "../engine/remoteRoster";
import { type Player2D, SHOT_TRACE_MS, type SpriteAtlases } from "../engine2d/canvasRenderer";
import type { DayLight, Rgb } from "../engine2d/dayClock";
import type { ShotTrace } from "../engine2d/useLandCombat";
import { ACTOR_COLUMN, ACTOR_FRAME, WALK_FRAMES } from "./assets";
import { createCloudShade } from "./clouds";
import {
  chunksAround,
  collectContent,
  compassTarget,
  type LandSource,
  standHeight,
  tileAtFor,
} from "./content";
import { createFarLayer } from "./farLayer";
import { buildGroundChunk, type GroundChunk, type GroundMaterials } from "./groundChunk";
import { type AtlasTextures, BlockLayer, BoardLayer, MarkerLayer } from "./layers";
import { drawOverlay, type OverlayLabel } from "./overlay";
import { createLens } from "./postfx";

export interface Hd2dFrame extends LandSource {
  /** CSS pixels of the drawing area. */
  width: number;
  height: number;
  /** What the camera looks at; the player when there is one. */
  focus: { x: number; z: number };
  player: Player2D | null;
  /** The last shot, drawn as a brief streak of light. */
  shot?: ShotTrace | null;
  /** Where a click sent the walker, or null. */
  goal?: { x: number; z: number } | null;
  /** Other players on the continent, in this world's tiles. */
  others?: readonly RemotePlayer[];
  now: number;
  light?: DayLight;
}

export interface Hd2dView {
  /** Pitch below the horizon (degrees), vertical field of view and distance to the focus. */
  pitch: number;
  fov: number;
  distance: number;
  /** Tilt-shift blur radius in CSS pixels at the far edges. */
  blur: number;
}

export const PLAY_VIEW: Hd2dView = { pitch: 37, fov: 30, distance: 27, blur: 7 };

export interface Hd2dRenderer {
  render(frame: Hd2dFrame): void;
  /** The point under canvas position (x, y) in CSS pixels, `height` tiles up, as last rendered. */
  pick(x: number, y: number, height?: number): { x: number; z: number } | null;
  dispose(): void;
}

const REACH = { side: 34, north: 34, south: 16 };
const BUILDS_PER_FRAME = 2;
const MOTES = 140;

export function createHd2dRenderer(
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement | null,
  atlases: SpriteAtlases,
  view: Hd2dView = PLAY_VIEW,
): Hd2dRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const haze = new THREE.Color(HD2D_PALETTE.haze);
  scene.background = haze;
  const fog = new THREE.Fog(haze, view.distance + 4, view.distance + 40);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(view.fov, 1, 0.5, 200);
  const lens = createLens(renderer, scene, camera);

  const sun = new THREE.DirectionalLight(HD2D_PALETTE.sun, 3.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  const shadowCam = sun.shadow.camera;
  shadowCam.left = -30;
  shadowCam.right = 30;
  shadowCam.top = 30;
  shadowCam.bottom = -30;
  shadowCam.near = 1;
  shadowCam.far = 90;
  scene.add(sun, sun.target);
  const fill = new THREE.HemisphereLight(HD2D_PALETTE.skyFill, HD2D_PALETTE.groundFill, 0.85);
  scene.add(fill);

  const textures = atlasTextures(atlases);
  const clouds = createCloudShade();
  const materials = groundMaterials(textures, clouds.apply);
  const standing = new THREE.Group();
  scene.add(standing);
  const far = createFarLayer(scene);
  const boards = new BoardLayer(standing, textures);
  const blocks = new BlockLayer(
    standing,
    new THREE.MeshStandardMaterial({ color: HD2D_PALETTE.fallbackBlock, roughness: 0.9 }),
  );
  const walls = new BlockLayer(standing, wallMaterial(textures.floor));
  const markers = new MarkerLayer(standing);
  const player = playerMesh(textures.ninja);
  scene.add(player.mesh, player.shadow);
  // Other players on a continent: the same walker, one mesh each, grown as people arrive.
  const crowd: PlayerMesh[] = [];
  const motes = moteField();
  scene.add(motes.points);
  const streak = shotStreak();
  scene.add(streak.mesh);

  const ground = new Map<string, GroundChunk>();
  let groundSeed: string | null = null;
  let contentKey = "";
  let contentRefs: unknown[] = [];
  let labels: OverlayLabel[] = [];
  const target = new THREE.Vector3();
  let lastNow: number | null = null;
  let size = { width: 0, height: 0, ratio: 0 };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  const resize = (width: number, height: number): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === size.width && height === size.height && ratio === size.ratio) return;
    size = { width, height, ratio };
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    lens.setSize(width, height, ratio);
    lens.setFocus(0.46, view.blur * ratio);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    if (overlay !== null) {
      overlay.width = Math.round(width * ratio);
      overlay.height = Math.round(height * ratio);
    }
  };

  const syncGround = (frame: Hd2dFrame, coords: ReturnType<typeof chunksAround>): void => {
    const identity = `${frame.seed}:${frame.origin?.name ?? "open"}:${frame.origin?.floor.tile ?? ""}:${frame.land?.key ?? ""}`;
    if (identity !== groundSeed) {
      for (const chunk of ground.values()) {
        scene.remove(chunk.group);
        chunk.dispose();
      }
      ground.clear();
      groundSeed = identity;
    }
    const wanted = new Set(coords.map(chunkKey));
    let built = 0;
    const tileAt = tileAtFor(frame);
    for (const coord of coords) {
      const key = chunkKey(coord);
      if (ground.has(key) || built >= BUILDS_PER_FRAME) continue;
      const chunk = buildGroundChunk(coord, tileAt, atlases, materials);
      ground.set(key, chunk);
      scene.add(chunk.group);
      built += 1;
    }
    for (const [key, chunk] of ground) {
      if (wanted.has(key)) continue;
      scene.remove(chunk.group);
      chunk.dispose();
      ground.delete(key);
    }
  };

  const syncContent = (frame: Hd2dFrame, coords: ReturnType<typeof chunksAround>): void => {
    // Foes move nowhere between frames; only who is still standing changes what is drawn.
    const foes =
      frame.foes === null || frame.foes === undefined
        ? "off"
        : frame.foes.map((foe) => foe.id).join(",");
    const key = `${coords.map(chunkKey).join("|")}#${foes}`;
    const refs = [
      frame.origin,
      frame.chunks,
      frame.progress,
      frame.notes,
      frame.story,
      frame.seed,
      frame.places,
      frame.chapter,
      frame.land,
      frame.continent,
    ];
    if (key === contentKey && refs.every((ref, index) => ref === contentRefs[index])) return;
    contentKey = key;
    contentRefs = refs;
    const content = collectContent(frame, coords);
    boards.set(content.boards);
    blocks.set(content.blocks);
    walls.set(content.walls);
    markers.set(content.markers);
    labels = content.markers
      .filter((marker) => marker.label !== "")
      .map((marker) => ({ x: marker.x, z: marker.z, text: marker.label, color: marker.color }));
  };

  return {
    render(frame) {
      resize(frame.width, frame.height);
      if (frame.light !== undefined) {
        const light = frame.light;
        const color = (out: THREE.Color, rgb: Rgb): void => {
          out.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
        };
        color(sun.color, light.sun);
        sun.intensity = light.sunIntensity;
        color(fill.color, light.sky);
        color(fill.groundColor, light.ground);
        fill.intensity = light.fill;
        color(haze, light.haze);
        color(fog.color, light.haze);
      }
      const seconds = frame.now / 1000;
      const delta = lastNow === null ? 0 : Math.min(0.1, (frame.now - lastNow) / 1000);
      lastNow = frame.now;

      const coords = chunksAround(frame.focus.x, frame.focus.z, REACH);
      syncGround(frame, coords);
      syncContent(frame, coords);
      far.sync(frame);

      // The camera eases after the focus so walking reads as a glide, not a locked grid.
      const follow = delta === 0 ? 1 : 1 - Math.exp(-delta * 7);
      target.x += (frame.focus.x - target.x) * follow;
      target.z += (frame.focus.z - target.z) * follow;
      const pitch = THREE.MathUtils.degToRad(view.pitch);
      camera.position.set(
        target.x,
        Math.sin(pitch) * view.distance,
        target.z + Math.cos(pitch) * view.distance,
      );
      camera.lookAt(target.x, 0.5, target.z);
      sun.position.set(
        target.x + (frame.light?.sunDir[0] ?? -0.5) * 28,
        (frame.light?.sunDir[1] ?? 0.85) * 28,
        target.z + (frame.light?.sunDir[2] ?? 0.45) * 28,
      );
      sun.target.position.set(target.x, 0, target.z);

      const tileAt = tileAtFor(frame);
      player.place(
        frame.player,
        frame.now,
        frame.player === null ? 0 : standHeight(tileAt, frame.player.x, frame.player.z),
        delta,
      );
      const others = frame.others ?? [];
      while (crowd.length < others.length) {
        const mesh = playerMesh(textures.ninja);
        scene.add(mesh.mesh, mesh.shadow);
        crowd.push(mesh);
      }
      crowd.forEach((mesh, index) => {
        const other = others[index];
        const standing =
          other === undefined
            ? null
            : { x: other.x, z: other.z, facing: "south" as const, moving: false };
        const ground = standing === null ? 0 : standHeight(tileAt, standing.x, standing.z);
        mesh.place(standing, frame.now, ground, delta);
      });
      const names = others.map((other) => ({
        x: other.x,
        z: other.z,
        text: other.name,
        color: LAND_2D_PALETTE.remote,
      }));
      markers.animate(seconds);
      clouds.time.value = seconds;
      motes.drift(target, seconds);
      streak.show(frame.shot ?? null, frame.now);
      for (const material of Object.values(materials.sunken)) {
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map !== null) map.offset.set(seconds * 0.05, seconds * 0.03);
      }

      lens.composer.render(delta);
      if (overlay !== null) {
        const compass = compassTarget(frame.story);
        const distance =
          compass === null
            ? 0
            : Math.round(Math.hypot(compass.x - frame.focus.x, compass.z - frame.focus.z));
        drawOverlay(
          overlay,
          camera,
          size,
          names.length === 0 ? labels : [...labels, ...names],
          compass === null ? null : { ...compass, label: `${compass.label} · ${distance}` },
          frame.foes ?? [],
          frame.goal ?? null,
          seconds,
        );
      }
    },
    // A ray from the camera through the click, onto the ground plane (plateaus and basins are
    // under a tile high, close enough to pick the tile the player meant).
    pick(x, y, height = 0) {
      if (size.width === 0 || size.height === 0) return null;
      pointer.set((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      groundPlane.constant = -height;
      return raycaster.ray.intersectPlane(groundPlane, hit) === null
        ? null
        : { x: hit.x, z: hit.z };
    },
    dispose() {
      for (const chunk of ground.values()) chunk.dispose();
      ground.clear();
      boards.dispose();
      blocks.dispose();
      walls.dispose();
      far.dispose();
      markers.dispose();
      player.dispose();
      for (const mesh of crowd) mesh.dispose();
      motes.dispose();
      streak.dispose();
      for (const material of Object.values(materials.sunken)) material.dispose();
      materials.bank.dispose();
      clouds.dispose();
      for (const texture of Object.values(textures)) texture.dispose();
      lens.dispose();
      renderer.dispose();
    },
  };
}

function atlasTextures(atlases: SpriteAtlases): AtlasTextures {
  const entries = Object.entries(atlases).map(([id, image]) => {
    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestMipmapLinearFilter;
    texture.needsUpdate = true;
    return [id, texture] as const;
  });
  return Object.fromEntries(entries) as AtlasTextures;
}

/** One floor tile cut out of the sheet as its own repeating texture. */
function tileTexture(sheet: THREE.Texture, sx: number, sy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(sheet.image as CanvasImageSource, sx, sy, 16, 16, 0, 0, 16, 16);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function groundMaterials(
  textures: AtlasTextures,
  decorateFloor: (material: THREE.Material) => void,
): GroundMaterials {
  return {
    decorateFloor,
    sunken: {
      water: new THREE.MeshStandardMaterial({
        map: tileTexture(textures.floor, 16, 352),
        color: HD2D_PALETTE.water,
        roughness: 0.18,
        metalness: 0.05,
        emissive: HD2D_PALETTE.waterDeep,
        emissiveIntensity: 0.35,
      }),
      lava: new THREE.MeshStandardMaterial({
        map: tileTexture(textures.floor, 192, 352),
        color: HD2D_PALETTE.lava,
        emissive: HD2D_PALETTE.lava,
        emissiveIntensity: 1.4,
        roughness: 0.6,
      }),
      void: new THREE.MeshBasicMaterial({ color: HD2D_PALETTE.voidFloor }),
    },
    bank: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  };
}

function wallMaterial(floor: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: tileTexture(floor, 176, 304),
    color: HD2D_PALETTE.wallTint,
    roughness: 0.95,
  });
}

interface PlayerMesh {
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  place(player: Player2D | null, now: number, ground: number, delta: number): void;
  dispose(): void;
}

function playerMesh(sheet: THREE.Texture): PlayerMesh {
  const image = sheet.image as { width: number; height: number };
  const texture = sheet.clone();
  texture.repeat.set(ACTOR_FRAME / image.width, ACTOR_FRAME / image.height);
  texture.needsUpdate = true;
  const geometry = new THREE.PlaneGeometry(1.25, 1.25);
  geometry.translate(0, 0.625, 0);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  const blobGeometry = new THREE.CircleGeometry(0.42, 24);
  blobGeometry.rotateX(-Math.PI / 2);
  const blobMaterial = new THREE.MeshBasicMaterial({
    color: HD2D_PALETTE.bankBottom,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  });
  const shadow = new THREE.Mesh(blobGeometry, blobMaterial);
  // Stepping onto a plateau eases up instead of snapping.
  let lift = 0;
  return {
    mesh,
    shadow,
    place(player, now, ground, delta) {
      mesh.visible = player !== null;
      shadow.visible = player !== null;
      if (player === null) return;
      const column = ACTOR_COLUMN[player.facing];
      const frame = player.moving ? Math.floor(now / 140) % WALK_FRAMES : 0;
      texture.offset.set(
        (column * ACTOR_FRAME) / image.width,
        1 - ((frame + 1) * ACTOR_FRAME) / image.height,
      );
      lift = delta === 0 ? ground : lift + (ground - lift) * (1 - Math.exp(-delta * 14));
      const bob = player.moving ? Math.abs(Math.sin(now / 140)) * 0.05 : 0;
      mesh.position.set(player.x, lift + bob, player.z);
      shadow.position.set(player.x, lift + 0.02, player.z + 0.05);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
      blobGeometry.dispose();
      blobMaterial.dispose();
    },
  };
}

interface Motes {
  points: THREE.Points;
  drift(center: THREE.Vector3, seconds: number): void;
  dispose(): void;
}

/** Dust and pollen hanging in the light around the focus; they catch the bloom. */
function moteField(): Motes {
  const seeds = new Float32Array(MOTES * 4);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  const positions = new Float32Array(MOTES * 3);
  const attribute = new THREE.BufferAttribute(positions, 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", attribute);
  const sprite = document.createElement("canvas");
  sprite.width = 32;
  sprite.height = 32;
  const ctx = sprite.getContext("2d");
  if (ctx !== null) {
    const glow = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    glow.addColorStop(0, HD2D_PALETTE.mote);
    glow.addColorStop(1, HD2D_PALETTE.moteFade);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 32, 32);
  }
  const map = new THREE.CanvasTexture(sprite);
  const material = new THREE.PointsMaterial({
    size: 0.16,
    map,
    color: HD2D_PALETTE.mote,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return {
    points,
    drift(center, seconds) {
      for (let i = 0; i < MOTES; i += 1) {
        const a = seeds[i * 4] ?? 0;
        const b = seeds[i * 4 + 1] ?? 0;
        const c = seeds[i * 4 + 2] ?? 0;
        const d = seeds[i * 4 + 3] ?? 0;
        positions[i * 3] = center.x + (a - 0.5) * 36 + Math.sin(seconds * 0.3 + d * 9) * 0.8;
        positions[i * 3 + 1] = 0.3 + ((b + seconds * 0.02 * (0.5 + d)) % 1) * 3.2;
        positions[i * 3 + 2] = center.z + (c - 0.5) * 26 + Math.cos(seconds * 0.25 + a * 9) * 0.8;
      }
      attribute.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}

interface Streak {
  mesh: THREE.Mesh;
  show(shot: ShotTrace | null, now: number): void;
  dispose(): void;
}

/** A shot as a thin bar of light from the player to where it landed, fading out. */
function shotStreak(): Streak {
  const geometry = new THREE.BoxGeometry(1, 0.06, 0.06);
  geometry.translate(0.5, 0, 0);
  const material = new THREE.MeshBasicMaterial({
    color: HD2D_PALETTE.shotHit,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  return {
    mesh,
    show(shot, now) {
      const age = shot === null ? Number.POSITIVE_INFINITY : now - shot.at;
      mesh.visible = shot !== null && age <= SHOT_TRACE_MS;
      if (shot === null || !mesh.visible) return;
      const dx = shot.x1 - shot.x0;
      const dz = shot.z1 - shot.z0;
      mesh.position.set(shot.x0, 0.75, shot.z0);
      mesh.rotation.set(0, -Math.atan2(dz, dx), 0);
      mesh.scale.set(Math.max(0.1, Math.hypot(dx, dz)), 1, 1);
      material.color.set(shot.hit ? HD2D_PALETTE.shotHit : HD2D_PALETTE.shotMiss);
      material.opacity = 1 - age / SHOT_TRACE_MS;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
