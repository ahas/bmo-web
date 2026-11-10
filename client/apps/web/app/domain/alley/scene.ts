import * as THREE from "three/webgpu";
import { emissive, mrt, output, pass, uniform, vec4 } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

import { makeCity } from "./city";
import { makeMo, poseMo } from "./mo";

import type { City } from "./city";
import type { Cast } from "./life";
import type { MoBody } from "./mo";
import type { World } from "./world";
import type { SpaceNode } from "#shared/space";

// The space on screen (docs/web.md, 「Live status screen」, the space): one renderer on one canvas, the city of a
// world, a MO for every agent, rain and fog, the glow of the signs and the shallow focus of a miniature, and the
// camera the reader turns, moves and zooms.

export interface Scene {
  /** The city rebuilt for a world; the MOs stay. */
  setWorld: (world: World) => void;
  /** Everyone drawn where the cast says. */
  setCast: (cast: Cast, roles: Map<string, string | null>) => void;
  /** The machines' lamps blink quicker where work goes on. */
  setNodes: (nodes: readonly SpaceNode[]) => void;
  /** The whole city fitted to the box. */
  fit: () => void;
  /** A zoom by one step, in or out. */
  zoom: (by: number) => void;
  /** The city moved by a screen's worth of pixels. */
  pan: (dx: number, dy: number) => void;
  /** The agent under a point of the canvas, by name. */
  pick: (x: number, y: number) => string | null;
  /** Where an agent's head stands on the canvas, in CSS pixels, or null while it is off screen. */
  headOf: (name: string) => [number, number] | null;
  /** Whether the reader has turned, moved or zoomed the city since it was last fitted. */
  roamed: () => boolean;
  /** The box resized. */
  resize: () => void;
  /** One frame; `seconds` since the last. */
  frame: (seconds: number, still: boolean) => void;
  dispose: () => void;
}

const FOV = 28;

/** The scene stood up on a canvas inside its holder. Resolves once the renderer is ready. */
export async function makeScene(canvas: HTMLCanvasElement, holder: HTMLElement): Promise<Scene> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  await renderer.init();

  const scene = new THREE.Scene();

  scene.background = new THREE.Color("#07090d");
  scene.fog = new THREE.FogExp2("#0a0d14", 0.0055);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);

  camera.position.set(30, 32, 44);

  const controls = new OrbitControls(camera, canvas);

  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = Math.PI * 0.1;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.minDistance = 8;
  controls.maxDistance = 160;
  controls.screenSpacePanning = true;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  let roamed = false;

  controls.addEventListener("start", () => {
    roamed = true;
  });

  // Light: a cold sky, a faint moon that casts the shadows, and the glow of everything that glows.
  scene.add(new THREE.HemisphereLight("#5b71a3", "#1a1c24", 2.4));

  const moon = new THREE.DirectionalLight("#9fb0dc", 2.2);

  moon.position.set(-20, 40, 10);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 160;
  moon.shadow.bias = -0.0005;
  scene.add(moon);
  scene.add(moon.target);

  // Post-processing: only what emits light blooms, and the picture focuses on the city's middle like a miniature.
  const scenePass = pass(scene, camera);
  const mrtNode = mrt({ output, emissive: vec4(emissive, output.a) });

  mrtNode.setBlendMode("emissive", new THREE.BlendMode(THREE.NormalBlending));
  scenePass.setMRT(mrtNode);
  scenePass.getTexture("emissive").type = THREE.UnsignedByteType;

  const bloomPass = bloom(scenePass.getTextureNode("emissive"), 1.1, 0.45);
  const focusDistance = uniform(50);
  const focalLength = uniform(4);
  const bokehScale = uniform(2.2);
  const dofPass = dof(scenePass.getTextureNode().add(bloomPass), scenePass.getViewZNode(), focusDistance, focalLength, bokehScale);
  const pipeline = new THREE.RenderPipeline(renderer);

  pipeline.outputNode = dofPass;

  // Rain: streaks that fall and start over.
  const RAIN = 2200;
  const rainPositions = new Float32Array(RAIN * 3);
  const rainGeometry = new THREE.BufferGeometry();
  const rainMaterial = new THREE.PointsMaterial({ color: "#9fb4d6", size: 0.08, transparent: true, opacity: 0.55, sizeAttenuation: true });
  const rain = new THREE.Points(rainGeometry, rainMaterial);
  let rainSpan = { width: 60, depth: 60, height: 36 };

  rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  scene.add(rain);

  const seedRain = (): void => {
    for (let at = 0; at < RAIN; at += 1) {
      rainPositions[at * 3] = Math.random() * rainSpan.width;
      rainPositions[at * 3 + 1] = Math.random() * rainSpan.height;
      rainPositions[at * 3 + 2] = Math.random() * rainSpan.depth;
    }

    rainGeometry.attributes.position!.needsUpdate = true;
  };

  seedRain();

  let city: City | null = null;
  let world: World | null = null;
  const mos = new Map<string, MoBody>();
  const hits: THREE.Object3D[] = [];
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let nodes: readonly SpaceNode[] = [];
  let clock = 0;

  const centre = (): THREE.Vector3 => (world === null ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(world.width / 2, 2, world.depth / 2));

  const fit = (): void => {
    if (world === null) return;

    const target = centre();
    const radius = Math.hypot(world.width, world.depth) / 2 + 4;
    const vertical = (FOV * Math.PI) / 180 / 2;
    const horizontal = Math.atan(Math.tan(vertical) * camera.aspect);
    const distance = radius / Math.sin(Math.min(vertical, horizontal)) * 0.78;

    controls.target.copy(target);
    camera.position.set(target.x + distance * 0.2, target.y + distance * 0.7, target.z + distance * 0.7);
    camera.lookAt(target);
    controls.update();
    roamed = false;
  };

  const resize = (): void => {
    const width = Math.max(1, holder.clientWidth);
    const height = Math.max(1, holder.clientHeight);

    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    if (!roamed) fit();
  };

  const setWorld = (next: World): void => {
    if (city !== null) {
      scene.remove(city.group);
      city.dispose();
    }

    world = next;
    city = makeCity(next);
    scene.add(city.group);
    rainSpan = { width: next.width + 20, depth: next.depth + 20, height: 36 };
    rain.position.set(-10, 0, -10);
    seedRain();
    moon.target.position.set(next.width / 2, 0, next.depth / 2);
    moon.position.set(next.width / 2 - 25, 45, next.depth / 2 + 15);
    moon.shadow.camera.left = -Math.max(next.width, next.depth) * 0.7;
    moon.shadow.camera.right = Math.max(next.width, next.depth) * 0.7;
    moon.shadow.camera.top = Math.max(next.width, next.depth) * 0.7;
    moon.shadow.camera.bottom = -Math.max(next.width, next.depth) * 0.7;
    moon.shadow.camera.updateProjectionMatrix();
    fit();
  };

  const setCast = (cast: Cast, roles: Map<string, string | null>): void => {
    for (const [name, mo] of mos) {
      if (!cast.has(name)) {
        scene.remove(mo.group);
        mos.delete(name);
        hits.splice(hits.indexOf(mo.hit), 1);
      }
    }

    for (const [name, one] of cast) {
      let mo = mos.get(name);

      if (mo === undefined) {
        mo = makeMo(name, roles.get(name) ?? null);
        mo.group.traverse((child) => {
          child.castShadow = true;
        });
        scene.add(mo.group);
        mos.set(name, mo);
        hits.push(mo.hit);
      }

      // Seated poses sit on what is there: a stool, a desk's chair, a stair.
      const seated = one.pose === "sit" || one.pose === "type" || one.pose === "doze";

      mo.group.position.set(one.at.x, one.at.y + (seated ? 0.22 : 0), one.at.z);
      mo.group.rotation.y = one.yaw;
      poseMo(mo, one.pose, one.beat, one.mood);
    }
  };

  const setNodes = (next: readonly SpaceNode[]): void => {
    nodes = next;
  };

  const zoom = (by: number): void => {
    const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
    const length = direction.length();
    const next = Math.max(controls.minDistance, Math.min(controls.maxDistance, length * (by > 0 ? 0.8 : 1.25)));

    camera.position.copy(controls.target).add(direction.setLength(next));
    controls.update();
    roamed = true;
  };

  const pan = (dx: number, dy: number): void => {
    // Moved along the ground, in the camera's facing.
    const forward = new THREE.Vector3().subVectors(controls.target, camera.position);

    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    const scale = camera.position.distanceTo(controls.target) * 0.0015;
    const move = right.multiplyScalar(dx * scale).add(forward.multiplyScalar(-dy * scale));

    controls.target.add(move);
    camera.position.add(move);
    controls.update();
    roamed = true;
  };

  const pick = (x: number, y: number): string | null => {
    const frame = canvas.getBoundingClientRect();

    pointer.set(((x - frame.left) / frame.width) * 2 - 1, -((y - frame.top) / frame.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObjects(hits, false)[0];

    return hit === undefined ? null : hit.object.name;
  };

  const headOf = (name: string): [number, number] | null => {
    const mo = mos.get(name);

    if (mo === undefined) return null;

    const head = new THREE.Vector3(0, 1.25, 0).applyMatrix4(mo.group.matrixWorld).project(camera);

    if (head.z > 1) return null;

    const frame = canvas.getBoundingClientRect();

    return [((head.x + 1) / 2) * frame.width, ((1 - head.y) / 2) * frame.height];
  };

  const frame = (seconds: number, still: boolean): void => {
    clock += seconds;
    controls.update();

    // The focus follows the camera's distance to the city's middle, so the far end softens.
    // The focus is the city's middle; what stands as far again from it softens fully, a miniature's shallow depth.
    focusDistance.value = camera.position.distanceTo(controls.target);
    focalLength.value = Math.max(12, focusDistance.value * 0.7);
    bokehScale.value = still ? 1 : 1.6;

    if (!still) {
      for (let at = 0; at < RAIN; at += 1) {
        rainPositions[at * 3 + 1]! -= seconds * 22;
        rainPositions[at * 3]! -= seconds * 1.5;

        if (rainPositions[at * 3 + 1]! < 0) {
          rainPositions[at * 3 + 1] = rainSpan.height;
          rainPositions[at * 3] = Math.random() * rainSpan.width;
          rainPositions[at * 3 + 2] = Math.random() * rainSpan.depth;
        }
      }

      rainGeometry.attributes.position!.needsUpdate = true;
    }

    rain.visible = !still;

    if (city !== null) {
      for (const [name, lamp] of city.lamps) {
        const busy = nodes.find((node) => node.name === name)?.busy ?? false;
        const on = Math.sin(clock * (busy ? 14 : 2.5)) > (busy ? -0.2 : 0.6);

        (lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.6 : 0.1;
      }
    }

    pipeline.render();
  };

  resize();

  return {
    setWorld,
    setCast,
    setNodes,
    fit,
    zoom,
    pan,
    pick,
    headOf,
    roamed: () => roamed,
    resize,
    frame,
    dispose: () => {
      controls.dispose();
      city?.dispose();
      rainGeometry.dispose();
      rainMaterial.dispose();
      renderer.dispose();
    }
  };
}
