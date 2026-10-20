// Three.js renderer: draws the World at a low internal resolution for the chunky retro look.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { World } from '../game/world';
import { WALL_CHARS, ENEMIES } from '../game/world';
import { buildTextures, type TextureSet } from '../art/textures';
import { buildEnemyFrames, buildItems, buildFx, type EnemyKind, type EnemyFrame, type ItemKind, type FxKind } from '../art/sprites';

export const SCREEN_W = 384;
export const SCREEN_H = 240;
export const BAR_H = 40;
export const VIEW_H = SCREEN_H - BAR_H;
export const HFOV = Math.PI / 2; // 90° horizontal like Doom
export const WALL_H = 1.2;
export const EYE = 0.58;

function canvasTex(c: HTMLCanvasElement, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Renderer {
  gl: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  textures: TextureSet;
  private wallMats = new Map<string, THREE.Material>();
  private flatMats = new Map<string, THREE.Material>();
  private enemyTex = new Map<EnemyKind, Record<EnemyFrame, THREE.Texture>>();
  private itemTex = {} as Record<ItemKind, THREE.Texture>;
  private fxTex = {} as Record<FxKind, THREE.Texture>;
  private sprites = new Map<number, THREE.Sprite>();
  private doorMeshes = new Map<string, THREE.Mesh>();
  private levelGroup = new THREE.Group();
  private muzzle: THREE.PointLight;
  private world: World | null = null;
  private exitMeshes: THREE.Mesh[] = [];

  constructor() {
    this.gl = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    this.gl.setPixelRatio(1);
    this.gl.setSize(SCREEN_W, VIEW_H, false);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    const vfov = 2 * Math.atan(Math.tan(HFOV / 2) / (SCREEN_W / VIEW_H));
    this.camera = new THREE.PerspectiveCamera((vfov * 180) / Math.PI, SCREEN_W / VIEW_H, 0.05, 60);
    this.scene.add(this.levelGroup);
    this.scene.fog = new THREE.Fog(0x120a14, 5, 24);
    this.scene.background = new THREE.Color(0x120a14);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.45));
    this.muzzle = new THREE.PointLight(0xffd27a, 0, 7, 1.5);
    this.scene.add(this.muzzle);

    this.textures = buildTextures();
    for (const [k, c] of Object.entries(this.textures.walls)) {
      this.wallMats.set(k, new THREE.MeshLambertMaterial({ map: canvasTex(c) }));
    }
    for (const [k, c] of Object.entries(this.textures.flats)) {
      this.flatMats.set(k, new THREE.MeshLambertMaterial({ map: canvasTex(c) }));
    }
    for (const kind of ['mouse', 'bulldog', 'chihuahua', 'rex'] as EnemyKind[]) {
      const frames = buildEnemyFrames(kind);
      const rec = {} as Record<EnemyFrame, THREE.Texture>;
      for (const [f, c] of Object.entries(frames)) rec[f as EnemyFrame] = canvasTex(c);
      this.enemyTex.set(kind, rec);
    }
    for (const [k, c] of Object.entries(buildItems())) this.itemTex[k as ItemKind] = canvasTex(c);
    for (const [k, c] of Object.entries(buildFx())) this.fxTex[k as FxKind] = canvasTex(c);
  }

  get canvas() {
    return this.gl.domElement;
  }

  /** Build static geometry for a level. */
  load(world: World) {
    this.world = world;
    // dispose previous level
    for (const ch of [...this.levelGroup.children]) {
      this.levelGroup.remove(ch);
      if (ch instanceof THREE.Mesh) ch.geometry.dispose();
    }
    for (const s of this.sprites.values()) this.scene.remove(s);
    this.sprites.clear();
    this.doorMeshes.clear();
    this.exitMeshes = [];

    const wallGeoms = new Map<string, THREE.BufferGeometry[]>();
    const flatGeoms = new Map<string, THREE.BufferGeometry[]>();
    const push = (m: Map<string, THREE.BufferGeometry[]>, k: string, g: THREE.BufferGeometry) => {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    };
    const isOpenTile = (x: number, y: number) => {
      const c = world.tile(x, y);
      return !WALL_CHARS.has(c) || !!world.door(x, y);
    };
    for (let y = 0; y < world.H; y++) {
      for (let x = 0; x < world.W; x++) {
        const c = world.grid[y][x];
        const door = world.door(x, y);
        if (WALL_CHARS.has(c) && !door) {
          // faces towards open neighbours only
          const faces: [number, number, number, number, number][] = [
            [x + 0.5, y + 1, 0, 0, 1], // south face (normal +z)
            [x + 0.5, y, Math.PI, 0, -1], // north
            [x + 1, y + 0.5, Math.PI / 2, 1, 0], // east
            [x, y + 0.5, -Math.PI / 2, -1, 0], // west
          ];
          for (const [fx, fz, rot, nx, nz] of faces) {
            if (!isOpenTile(x + nx, y + nz)) continue;
            const g = new THREE.PlaneGeometry(1, WALL_H);
            g.rotateY(rot);
            g.translate(fx, WALL_H / 2, fz);
            const tex = c === 'E' || c === 'e' ? null : c;
            if (tex) push(wallGeoms, tex, g);
            else {
              const mesh = new THREE.Mesh(g, this.wallMats.get('E'));
              mesh.userData = { x, y };
              this.exitMeshes.push(mesh);
              this.levelGroup.add(mesh);
            }
          }
        } else {
          // floor + ceiling
          const f = new THREE.PlaneGeometry(1, 1);
          f.rotateX(-Math.PI / 2);
          f.translate(x + 0.5, 0, y + 0.5);
          push(flatGeoms, world.floorTex[y][x], f);
          const ce = new THREE.PlaneGeometry(1, 1);
          ce.rotateX(Math.PI / 2);
          ce.translate(x + 0.5, WALL_H, y + 0.5);
          push(flatGeoms, world.ceilTex[y][x], ce);
        }
        if (door) {
          const g = new THREE.BoxGeometry(1, WALL_H, door.secret ? 1 : 1);
          const mat = this.wallMats.get(door.secret ? door.wallTex : door.ch)!;
          const mesh = new THREE.Mesh(g, mat);
          mesh.position.set(x + 0.5, WALL_H / 2, y + 0.5);
          this.levelGroup.add(mesh);
          this.doorMeshes.set(`${x},${y}`, mesh);
          // door frame on the ceiling / floor
          const f = new THREE.PlaneGeometry(1, 1);
          f.rotateX(-Math.PI / 2);
          f.translate(x + 0.5, 0, y + 0.5);
          push(flatGeoms, 'metal', f);
        }
      }
    }
    for (const [k, gs] of wallGeoms) this.levelGroup.add(new THREE.Mesh(mergeGeometries(gs), this.wallMats.get(k)));
    for (const [k, gs] of flatGeoms) this.levelGroup.add(new THREE.Mesh(mergeGeometries(gs), this.flatMats.get(k)));

    // lamp lights (fixed count so shaders are compiled once per level)
    const lamps = world.decor.filter((d) => d.kind === 'lamp').slice(0, 6);
    for (const l of lamps) {
      const pl = new THREE.PointLight(0xffc56b, 2.2, 6, 1.2);
      pl.position.set(l.x, 1.0, l.y);
      this.levelGroup.add(pl);
    }
    // ceiling light panels
    let n = 0;
    for (let y = 1; y < world.H - 1 && n < 4; y += 3)
      for (let x = 1; x < world.W - 1 && n < 4; x += 3)
        if (world.ceilTex[y][x] === 'light' && !WALL_CHARS.has(world.grid[y][x])) {
          const pl = new THREE.PointLight(0xfff4d6, 1.6, 7, 1.2);
          pl.position.set(x + 0.5, WALL_H - 0.1, y + 0.5);
          this.levelGroup.add(pl);
          n++;
        }
    // pad to a constant number of lights
    for (let i = lamps.length + n; i < 10; i++) {
      const pl = new THREE.PointLight(0x000000, 0, 1);
      pl.position.set(-10, -10, -10);
      this.levelGroup.add(pl);
    }
  }

  private sprite(id: number, tex: THREE.Texture, x: number, y: number, z: number, h: number, w?: number) {
    let s = this.sprites.get(id);
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: false, alphaTest: 0.5, fog: true }));
      s.center.set(0.5, 0);
      this.scene.add(s);
      this.sprites.set(id, s);
    }
    const m = s.material as THREE.SpriteMaterial;
    if (m.map !== tex) {
      m.map = tex;
      m.needsUpdate = true;
    }
    const img = tex.image as HTMLCanvasElement;
    const width = w ?? (h * img.width) / img.height;
    s.scale.set(width, h, 1);
    s.position.set(x, z, y);
    s.visible = true;
    return s;
  }

  render() {
    const w = this.world;
    if (!w) return;
    const p = w.player;
    const bob = Math.sin(p.bob * 2) * 0.025 * Math.min(1, p.moving);
    this.camera.position.set(p.x, p.dead ? 0.15 : EYE + bob, p.y);
    this.camera.rotation.set(0, -p.angle - Math.PI / 2, p.dead ? 0.4 : 0, 'YXZ');

    // doors slide up into the ceiling
    for (const [k, m] of this.doorMeshes) {
      const d = w.doors.get(k)!;
      m.position.y = WALL_H / 2 + d.open * (WALL_H - 0.04);
      m.visible = d.open < 0.99;
    }
    for (const m of this.exitMeshes) {
      if (w.grid[m.userData.y][m.userData.x] === 'e') m.material = this.wallMats.get('e')!;
    }

    // muzzle flash light
    const firing = p.fireT < 0.06 && p.weapon !== 'claws';
    this.muzzle.intensity = firing ? 3 : 0;
    this.muzzle.color.set(p.weapon === 'laser' ? 0xff3060 : 0xffd27a);
    this.muzzle.position.set(p.x + Math.cos(p.angle) * 0.5, EYE, p.y + Math.sin(p.angle) * 0.5);

    for (const s of this.sprites.values()) s.visible = false;
    for (const e of w.enemies) {
      const def = ENEMIES[e.kind];
      const tex = this.enemyTex.get(e.kind)![w.enemyFrame(e)];
      const s = this.sprite(e.id, tex, e.x, e.y, 0, def.scale);
      (s.material as THREE.SpriteMaterial).color.setScalar(e.hurtFlash > 0 ? 2 : 1);
    }
    for (const it of w.items) if (!it.taken) {
      const big = it.kind === 'shotgun' || it.kind === 'laser' ? 0.25 : 0.3;
      const hover = it.kind.startsWith('key') ? 0.08 + Math.sin(w.time * 3 + it.id) * 0.04 : 0;
      this.sprite(it.id, this.itemTex[it.kind], it.x, it.y, hover, big);
    }
    for (const d of w.decor) if (!d.dead) {
      const h = { lamp: 1.0, plant: 0.8, bowl: 0.2, barrel: 0.6 }[d.kind];
      this.sprite(d.id, this.itemTex[d.kind], d.x, d.y, 0, h);
    }
    for (const pr of w.projectiles) {
      const h = pr.kind === 'yap' ? 0.3 : pr.kind === 'bone' ? 0.18 : 0.15;
      const s = this.sprite(pr.id, this.fxTex[pr.kind], pr.x, pr.y, 0.4, h);
      (s.material as THREE.SpriteMaterial).color.setScalar(1.4);
    }
    for (const f of w.fx) {
      const k = f.t / f.ttl;
      const kind: FxKind = f.kind === 'boom' ? (k < 0.25 ? 'boom0' : k < 0.6 ? 'boom1' : 'boom2') : f.kind === 'fur' ? (k < 0.5 ? 'fur0' : 'fur1') : k < 0.5 ? 'puff0' : 'puff1';
      const h = f.kind === 'boom' ? 1.4 : 0.18;
      this.sprite(f.id, this.fxTex[kind], f.x, f.y, f.kind === 'boom' ? 0 : f.z - h / 2, h);
    }
    // remove sprites for entities that disappeared
    for (const [id, s] of this.sprites) if (!s.visible) {
      if (!w.enemies.some((e) => e.id === id) && !w.items.some((i) => i.id === id) && !w.decor.some((d) => d.id === id)) {
        this.scene.remove(s);
        (s.material as THREE.SpriteMaterial).dispose();
        this.sprites.delete(id);
      }
    }
    this.gl.render(this.scene, this.camera);
  }

  /** Project a world position to screen x (internal pixels) for HUD overlays. Returns null if behind. */
  project(x: number, y: number, z = 0.4) {
    const v = new THREE.Vector3(x, z, y).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: ((v.x + 1) / 2) * SCREEN_W, y: ((1 - v.y) / 2) * VIEW_H };
  }
}
