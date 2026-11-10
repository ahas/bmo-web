import * as THREE from "three/webgpu";

import { BUILDING_COLORS, FLOOR, GLOW_COLORS } from "./world";

import type { Fixture, Sign, World } from "./world";

// The city made into meshes (docs/web.md, 「Live status screen」, the space): every block and fixture an instance of
// one box, the windows instances by their light, the signs planes with their words drawn on them, the wires lines.
// Nothing is loaded: every texture is drawn on a canvas here.

export interface City {
  group: THREE.Group;
  // The racks' lamps, by district name, which blink quicker while work goes on that machine.
  lamps: Map<string, THREE.Mesh>;
  // Everything that glows, with the glow it has at night; by day the scene turns it down.
  glowing: { material: THREE.MeshStandardMaterial; night: number }[];
  dispose: () => void;
}

const FIXTURE_COLORS = ["#3a3f47", "#f2ede4", "#b8453f", "#8a6a4a", "#6b7078", "#4a5a6a", "#2e7d5b", "#c8ccd1", "#f7f3ea", "#9aa3ad"];

const up = new THREE.Object3D();

function instance(mesh: THREE.InstancedMesh, at: number, x: number, y: number, z: number, w: number, h: number, d: number, yaw: number, color: THREE.Color): void {
  up.position.set(x, y + h / 2, z);
  up.rotation.set(0, yaw, 0);
  up.scale.set(w, h, d);
  up.updateMatrix();
  mesh.setMatrixAt(at, up.matrix);
  mesh.setColorAt(at, color);
}

/** A plaster wall drawn on a canvas: fine grain and a little weathering, tiled over every block. */
function wallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");

  canvas.width = 256;
  canvas.height = 256;

  const pen = canvas.getContext("2d");

  if (pen !== null) {
    pen.fillStyle = "#f4f1ea";
    pen.fillRect(0, 0, 256, 256);

    let seed = 7;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;

      return seed / 0x7fffffff;
    };

    for (let at = 0; at < 7000; at += 1) {
      const shade = 200 + Math.floor(next() * 50);

      pen.fillStyle = `rgba(${shade},${shade - 3},${shade - 8},${0.2 + next() * 0.35})`;
      pen.fillRect(Math.floor(next() * 256), Math.floor(next() * 256), 1 + Math.floor(next() * 3), 1 + Math.floor(next() * 3));
    }

    for (let at = 0; at < 14; at += 1) {
      const x = Math.floor(next() * 256);

      pen.fillStyle = `rgba(120,110,100,${0.04 + next() * 0.08})`;
      pen.fillRect(x, 0, 1 + Math.floor(next() * 3), 80 + Math.floor(next() * 176));
    }
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

/** A sign's words drawn on a canvas, lit in its glow colour. */
function signTexture(sign: Sign): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const vertical = sign.hanging && sign.h > sign.w;

  canvas.width = vertical ? 96 : 256;
  canvas.height = vertical ? 256 : 96;

  const pen = canvas.getContext("2d");

  if (pen !== null) {
    pen.fillStyle = "#15161b";
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.strokeStyle = GLOW_COLORS[sign.glow]!;
    pen.lineWidth = 6;
    pen.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
    pen.fillStyle = GLOW_COLORS[sign.glow]!;
    pen.textAlign = "center";
    pen.textBaseline = "middle";

    const text = sign.text.trim() === "" ? "▪▪▪" : sign.text;

    if (vertical) {
      const size = Math.min(56, Math.floor(220 / Math.max(1, text.length)));

      pen.font = `bold ${size}px "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
      [...text].forEach((glyph, at) => pen.fillText(glyph, canvas.width / 2, 24 + (at + 0.5) * size * 1.05));
    } else {
      let size = 52;

      pen.font = `bold ${size}px "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

      while (pen.measureText(text).width > canvas.width - 24 && size > 14) {
        size -= 4;
        pen.font = `bold ${size}px "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
      }

      pen.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return texture;
}

/** The city's meshes for a world. */
export function makeCity(world: World): City {
  const group = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const glowing: City["glowing"] = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);

  disposables.push(boxGeometry);

  // The ground: dark, wet.
  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#6f7a6a", roughness: 0.9, metalness: 0.0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(world.width + 40, world.depth + 40), groundMaterial);

  ground.rotation.x = -Math.PI / 2;
  ground.position.set(world.width / 2, 0, world.depth / 2);
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(groundMaterial, ground.geometry);

  // The street: a lighter, wetter band.
  const streetMaterial = new THREE.MeshStandardMaterial({ color: "#5a5e66", roughness: 0.85, metalness: 0.0 });
  const street = new THREE.Mesh(new THREE.PlaneGeometry(world.width, world.street[1] - world.street[0]), streetMaterial);

  street.rotation.x = -Math.PI / 2;
  street.position.set(world.width / 2, 0.004, (world.street[0] + world.street[1]) / 2);
  street.receiveShadow = true;
  group.add(street);
  disposables.push(streetMaterial, street.geometry);

  // Puddles: a few glossy patches.
  const puddleMaterial = new THREE.MeshStandardMaterial({ color: "#4f5e78", roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.55 });

  disposables.push(puddleMaterial);

  for (let at = 0; at < 24; at += 1) {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.6 + ((at * 37) % 11) / 10, 14), puddleMaterial);

    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(((at * 131) % Math.max(1, Math.floor(world.width))) + 0.5, 0.005, ((at * 71) % Math.max(1, Math.floor(world.depth))) + 0.5);
    puddle.scale.x = 1.6;
    group.add(puddle);
    disposables.push(puddle.geometry);
  }

  // Blocks, in plaster.
  const wall = wallTexture();
  const blockMaterial = new THREE.MeshStandardMaterial({ map: wall, roughness: 0.95, metalness: 0.0 });

  disposables.push(wall);
  const blocks = new THREE.InstancedMesh(boxGeometry, blockMaterial, Math.max(1, world.blocks.length));

  world.blocks.forEach((block, at) => instance(blocks, at, block.x + block.w / 2, block.y, block.z + block.d / 2, block.w, block.h, block.d, 0, new THREE.Color(BUILDING_COLORS[block.color]!)));
  blocks.castShadow = true;
  blocks.receiveShadow = true;
  group.add(blocks);
  disposables.push(blockMaterial);

  // Fixtures: the dull ones in one instanced mesh, the glowing ones in one a glow colour.
  const dull = world.fixtures.filter((fixture) => fixture.glow === null && fixture.kind !== "stair" && fixture.kind !== "cage");
  const dullMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.2 });
  const dullMesh = new THREE.InstancedMesh(boxGeometry, dullMaterial, Math.max(1, dull.length));

  dull.forEach((fixture, at) => instance(dullMesh, at, fixture.x, fixture.y, fixture.z, fixture.w, fixture.h, fixture.d, fixture.yaw, new THREE.Color(FIXTURE_COLORS[fixture.color]!)));
  dullMesh.castShadow = true;
  group.add(dullMesh);
  disposables.push(dullMaterial);

  const lamps = new Map<string, THREE.Mesh>();

  for (let glow = 0; glow < GLOW_COLORS.length; glow += 1) {
    const lit = world.fixtures.filter((fixture) => fixture.glow === glow);

    if (lit.length === 0) continue;

    const material = new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: new THREE.Color(GLOW_COLORS[glow]!), emissiveIntensity: 0.5 });
    const mesh = new THREE.InstancedMesh(boxGeometry, material, lit.length);

    glowing.push({ material, night: 0.5 });

    lit.forEach((fixture, at) => instance(mesh, at, fixture.x, fixture.y, fixture.z, fixture.w, fixture.h, fixture.d, fixture.yaw, new THREE.Color(FIXTURE_COLORS[fixture.color]!)));
    group.add(mesh);
    disposables.push(material);
  }

  // Cages: bars, so one sees through them.
  const cages = world.fixtures.filter((fixture) => fixture.kind === "cage");
  const barMaterial = new THREE.MeshStandardMaterial({ color: "#6b7078", roughness: 0.6, metalness: 0.5 });
  const bars = new THREE.InstancedMesh(boxGeometry, barMaterial, Math.max(1, cages.length * 7));
  const barColor = new THREE.Color("#6b7078");

  cages.forEach((cage, index) => {
    const cos = Math.cos(cage.yaw);
    const sin = Math.sin(cage.yaw);
    const outward = (along: number, out: number): [number, number] => [cage.x + cos * along + sin * out, cage.z - sin * along + cos * out];
    let at = index * 7;

    for (const along of [-cage.w / 2, -cage.w / 6, cage.w / 6, cage.w / 2]) {
      const [x, z] = outward(along, cage.d / 2);

      instance(bars, at, x, cage.y, z, 0.05, cage.h, 0.05, cage.yaw, barColor);
      at += 1;
    }

    for (const y of [cage.y, cage.y + cage.h / 2, cage.y + cage.h - 0.05]) {
      const [x, z] = outward(0, cage.d / 2);

      instance(bars, at, x, y, z, cage.w, 0.05, 0.05, cage.yaw, barColor);
      at += 1;
    }
  });
  group.add(bars);
  disposables.push(barMaterial);

  // Stairs: steps.
  const stairs = world.fixtures.filter((fixture) => fixture.kind === "stair");
  const stepMaterial = new THREE.MeshStandardMaterial({ color: "#3a3f47", roughness: 0.8, metalness: 0.3 });
  const steps = new THREE.InstancedMesh(boxGeometry, stepMaterial, Math.max(1, stairs.length * 10));
  const stepColor = new THREE.Color("#3a3f47");

  stairs.forEach((stair, index) => {
    const cos = Math.cos(stair.yaw);
    const sin = Math.sin(stair.yaw);

    for (let step = 0; step < 10; step += 1) {
      const along = (step / 9 - 0.5) * stair.w;

      instance(steps, index * 10 + step, stair.x + cos * along, (step / 10) * stair.h, stair.z - sin * along, stair.w / 10 + 0.05, 0.12, stair.d, stair.yaw, stepColor);
    }
  });
  group.add(steps);
  disposables.push(stepMaterial);

  // Windows: dark ones and lit ones by colour.
  const windowGeometry = new THREE.PlaneGeometry(0.8, 1.0);

  disposables.push(windowGeometry);

  const dark = world.windows.filter((window) => window.glow === null);
  const darkMaterial = new THREE.MeshStandardMaterial({ color: "#3a4a60", roughness: 0.2, metalness: 0.4 });
  const darkMesh = new THREE.InstancedMesh(windowGeometry, darkMaterial, Math.max(1, dark.length));

  dark.forEach((window, at) => {
    up.position.set(window.x, window.y, window.z);
    up.rotation.set(0, window.yaw, 0);
    up.scale.set(1, 1, 1);
    up.updateMatrix();
    darkMesh.setMatrixAt(at, up.matrix);
  });
  group.add(darkMesh);
  disposables.push(darkMaterial);

  for (let glow = 0; glow < GLOW_COLORS.length; glow += 1) {
    const lit = world.windows.filter((window) => window.glow === glow);

    if (lit.length === 0) continue;

    const material = new THREE.MeshStandardMaterial({ color: "#3a4a60", emissive: new THREE.Color(GLOW_COLORS[glow]!), emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.3 });
    const mesh = new THREE.InstancedMesh(windowGeometry, material, lit.length);

    glowing.push({ material, night: 0.45 });

    lit.forEach((window, at) => {
      up.position.set(window.x, window.y, window.z);
      up.rotation.set(0, window.yaw, 0);
      up.scale.set(1, 1, 1);
      up.updateMatrix();
      mesh.setMatrixAt(at, up.matrix);
    });
    group.add(mesh);
    disposables.push(material);
  }

  // Signs.
  for (const sign of [...world.signs, ...world.districts.map((district) => district.sign)]) {
    if (sign.w === 0) continue;

    const texture = signTexture(sign);
    const material = new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.7, roughness: 0.5 });

    glowing.push({ material, night: 0.7 });

    // A sign reads the right way round from either side: two faces back to back, with a thin box between.
    const geometry = new THREE.PlaneGeometry(sign.w, sign.h);
    const y = sign.at.y + (sign.hanging ? 0 : sign.h / 2);
    const yaw = sign.hanging ? sign.yaw + Math.PI / 2 : sign.yaw;

    for (const side of [1, -1]) {
      const face = new THREE.Mesh(geometry, material);

      face.position.set(sign.at.x + Math.sin(yaw) * 0.03 * side, y, sign.at.z + Math.cos(yaw) * 0.03 * side);
      face.rotation.y = yaw + (side === 1 ? 0 : Math.PI);
      group.add(face);
    }

    const slab = new THREE.Mesh(boxGeometry, barMaterial);

    slab.position.set(sign.at.x, y, sign.at.z);
    slab.rotation.y = yaw;
    slab.scale.set(sign.w, sign.h, 0.05);
    group.add(slab);
    disposables.push(texture, material, geometry);

    if (sign.hanging) {
      // The bracket.
      const bracket = new THREE.Mesh(boxGeometry, barMaterial);

      bracket.position.set(sign.at.x - Math.sin(sign.yaw) * sign.w / 4, sign.at.y + sign.h / 2 + 0.05, sign.at.z - Math.cos(sign.yaw) * sign.w / 4);
      bracket.rotation.y = sign.yaw;
      bracket.scale.set(0.06, 0.06, sign.w / 2 + 0.3);
      group.add(bracket);
    }
  }

  // The racks' lamps, kept by district so the scene can blink them.
  for (const district of world.districts) {
    const rack = district.rack;

    if (rack.w === 1 && rack.x === 0) continue;

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: "#7cff6b", emissive: new THREE.Color("#7cff6b"), emissiveIntensity: 1.0 }));

    lamp.position.set(rack.x + Math.sin(rack.yaw) * (rack.d / 2 + 0.04), rack.y + rack.h * 0.8, rack.z + Math.cos(rack.yaw) * (rack.d / 2 + 0.04));
    lamp.rotation.y = rack.yaw;
    group.add(lamp);
    lamps.set(district.name, lamp);
    disposables.push(lamp.geometry, lamp.material as THREE.Material);
  }

  // Wires and laundry.
  const wirePoints: number[] = [];

  for (const wire of world.wires) {
    const segments = 8;

    for (let at = 0; at < segments; at += 1) {
      for (const t of [at / segments, (at + 1) / segments]) {
        const sag = Math.sin(t * Math.PI) * (wire.laundry ? 0.5 : 0.9);

        wirePoints.push(wire.from.x + (wire.to.x - wire.from.x) * t, wire.from.y + (wire.to.y - wire.from.y) * t - sag, wire.from.z + (wire.to.z - wire.from.z) * t);
      }
    }
  }

  if (wirePoints.length > 0) {
    const wireGeometry = new THREE.BufferGeometry();

    wireGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wirePoints, 3));

    const wireMaterial = new THREE.LineBasicMaterial({ color: "#2b2f36" });

    group.add(new THREE.LineSegments(wireGeometry, wireMaterial));
    disposables.push(wireGeometry, wireMaterial);
  }

  const laundryMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const laundryColours = ["#d9d2c2", "#7fa7c9", "#c97f8e", "#e3c565", "#9ec98a"];
  const laundry = world.wires.filter((wire) => wire.laundry);
  const sheets = new THREE.InstancedMesh(boxGeometry, laundryMaterial, Math.max(1, laundry.length * 4));

  laundry.forEach((wire, index) => {
    for (let n = 0; n < 4; n += 1) {
      const t = 0.2 + n * 0.2;
      const sag = Math.sin(t * Math.PI) * 0.5;

      instance(sheets, index * 4 + n, wire.from.x + (wire.to.x - wire.from.x) * t, wire.from.y + (wire.to.y - wire.from.y) * t - sag - 0.6, wire.from.z + (wire.to.z - wire.from.z) * t, 0.5, 0.6, 0.04, Math.atan2(wire.to.x - wire.from.x, wire.to.z - wire.from.z) + Math.PI / 2, new THREE.Color(laundryColours[(index + n) % laundryColours.length]!));
    }
  });
  group.add(sheets);
  disposables.push(laundryMaterial);

  return {
    group,
    lamps,
    glowing,
    dispose: () => {
      for (const one of disposables) one.dispose();
    }
  };
}

/** The fixtures a point of the ground is at the foot of, for the renderer's own use. */
export function fixturesNear(world: World, x: number, z: number, within: number): Fixture[] {
  return world.fixtures.filter((fixture) => Math.hypot(fixture.x - x, fixture.z - z) <= within);
}

export { FLOOR };
