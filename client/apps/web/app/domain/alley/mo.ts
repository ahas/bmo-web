import * as THREE from "three/webgpu";

import { hashOf } from "./world";

import type { Mood, Pose } from "./life";

// A MO, one of Moe's robots (docs/web.md, 「Live status screen」, the space): a box body with a screen for a face,
// buttons under it, thin arms and legs. A supervisor is BMO; an agent of a role wears the role's colour and the
// role's letter on its side. The face says the state. Everything is boxes made here, with no model file.

const ROLE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6", "#6366f1", "#eab308"];
const BMO_BODY = "#7fd6c2";
const BMO_SCREEN = "#d9f3c9";
const DARK = "#1b1f26";

/** The colour every agent of a role wears. */
export function roleColor(role: string): string {
  return ROLE_COLORS[hashOf(role) % ROLE_COLORS.length]!;
}

/** The letter a role's MO carries on its side. */
export function roleLetter(role: string): string {
  return role.slice(0, 1).toUpperCase();
}

/** What the face shows. */
export type Face = "work" | "smile" | "doze" | "off" | "talk";

export interface MoBody {
  group: THREE.Group;
  body: THREE.Mesh;
  screen: THREE.Mesh;
  armLeft: THREE.Group;
  armRight: THREE.Group;
  legLeft: THREE.Group;
  legRight: THREE.Group;
  dots: THREE.Mesh;
  hit: THREE.Mesh;
  face: Face;
  faceTexture: THREE.CanvasTexture;
  faceCanvas: HTMLCanvasElement;
  screenMaterial: THREE.MeshStandardMaterial;
  supervisor: boolean;
}

// Body proportions, in metres: a MO stands about one metre tall.
const BODY_W = 0.6;
const BODY_H = 0.72;
const BODY_D = 0.38;
const LEG_H = 0.26;
const ARM_L = 0.4;

function box(w: number, h: number, d: number, color: string, emissive?: string): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });

  if (emissive !== undefined) {
    material.emissive = new THREE.Color(emissive);
    material.emissiveIntensity = 0.8;
  }

  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

/** The face drawn on the screen for a state. */
export function drawFace(canvas: HTMLCanvasElement, face: Face, supervisor: boolean, phase: number): void {
  const pen = canvas.getContext("2d");

  if (pen === null) return;

  const w = canvas.width;
  const h = canvas.height;

  pen.fillStyle = face === "off" ? "#0e1216" : supervisor ? BMO_SCREEN : "#cfe8ff";
  pen.fillRect(0, 0, w, h);

  if (face === "off") return;

  pen.strokeStyle = "#1b2a2a";
  pen.fillStyle = "#1b2a2a";
  pen.lineWidth = Math.max(3, w * 0.045);
  pen.lineCap = "round";

  const eyeY = h * 0.42;
  const eyeL = w * 0.34;
  const eyeR = w * 0.66;
  const r = w * 0.055;

  if (face === "doze") {
    for (const x of [eyeL, eyeR]) {
      pen.beginPath();
      pen.moveTo(x - r * 1.4, eyeY);
      pen.lineTo(x + r * 1.4, eyeY);
      pen.stroke();
    }

    // Zzz.
    pen.font = `bold ${Math.round(h * 0.22)}px sans-serif`;
    pen.fillText("z", w * 0.72, h * 0.3 + Math.sin(phase * 2) * h * 0.03);
  } else if (face === "work") {
    for (const x of [eyeL, eyeR]) {
      pen.beginPath();
      pen.ellipse(x, eyeY, r * 1.1, r * 1.4, 0, 0, Math.PI * 2);
      pen.fill();
    }

    pen.beginPath();
    pen.moveTo(w * 0.42, h * 0.7);
    pen.lineTo(w * 0.58, h * 0.7);
    pen.stroke();
  } else {
    for (const x of [eyeL, eyeR]) {
      pen.beginPath();
      pen.arc(x, eyeY, r, 0, Math.PI * 2);
      pen.fill();
    }

    pen.beginPath();
    pen.arc(w * 0.5, h * 0.58, w * 0.14, face === "talk" ? Math.PI * 0.15 : Math.PI * 0.1, face === "talk" ? Math.PI * 0.85 : Math.PI * 0.9);
    pen.stroke();
  }
}

/** A MO built for an agent: BMO for a supervisor, a role's MO otherwise. */
export function makeMo(name: string, role: string | null): MoBody {
  const supervisor = role === null;
  const color = supervisor ? BMO_BODY : roleColor(role);
  const group = new THREE.Group();

  // Legs, each hanging from a hip pivot.
  const legLeft = new THREE.Group();
  const legRight = new THREE.Group();

  for (const [leg, side] of [[legLeft, -1], [legRight, 1]] as const) {
    const thigh = box(0.11, LEG_H, 0.12, DARK);
    const foot = box(0.16, 0.07, 0.2, DARK);

    thigh.position.y = -LEG_H / 2;
    foot.position.set(0, -LEG_H - 0.03, 0.03);
    leg.add(thigh, foot);
    leg.position.set(side * 0.16, LEG_H + 0.04, 0);
    group.add(leg);
  }

  // The body, with the screen on its front.
  const body = box(BODY_W, BODY_H, BODY_D, color);

  body.position.y = LEG_H + 0.04 + BODY_H / 2;
  group.add(body);

  const faceCanvas = document.createElement("canvas");

  faceCanvas.width = 128;
  faceCanvas.height = 96;
  drawFace(faceCanvas, "smile", supervisor, 0);

  const faceTexture = new THREE.CanvasTexture(faceCanvas);

  faceTexture.colorSpace = THREE.SRGBColorSpace;

  const screenMaterial = new THREE.MeshStandardMaterial({ map: faceTexture, emissiveMap: faceTexture, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.55, roughness: 0.3 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(BODY_W * 0.74, BODY_H * 0.46), screenMaterial);

  screen.position.set(0, body.position.y + BODY_H * 0.16, BODY_D / 2 + 0.006);
  group.add(screen);

  // The buttons: a cross and two round ones, like a console, under the screen.
  const buttonY = body.position.y - BODY_H * 0.3;
  const cross = box(0.14, 0.04, 0.02, supervisor ? "#f3d35a" : "#e6e6e6");
  const crossUp = box(0.04, 0.14, 0.02, supervisor ? "#f3d35a" : "#e6e6e6");

  cross.position.set(-0.16, buttonY, BODY_D / 2 + 0.01);
  crossUp.position.set(-0.16, buttonY, BODY_D / 2 + 0.01);

  const buttonA = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), new THREE.MeshStandardMaterial({ color: supervisor ? "#e5484d" : "#1b1f26" }));
  const buttonB = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12), new THREE.MeshStandardMaterial({ color: supervisor ? "#3f8cff" : "#1b1f26" }));

  buttonA.rotation.x = Math.PI / 2;
  buttonB.rotation.x = Math.PI / 2;
  buttonA.position.set(0.1, buttonY + 0.03, BODY_D / 2 + 0.01);
  buttonB.position.set(0.19, buttonY - 0.03, BODY_D / 2 + 0.01);
  group.add(cross, crossUp, buttonA, buttonB);

  // The role's letter on both sides of a role's MO.
  if (role !== null) {
    const letterCanvas = document.createElement("canvas");

    letterCanvas.width = 64;
    letterCanvas.height = 64;

    const pen = letterCanvas.getContext("2d");

    if (pen !== null) {
      pen.fillStyle = color;
      pen.fillRect(0, 0, 64, 64);
      pen.fillStyle = "rgba(10,12,16,0.85)";
      pen.font = "bold 44px sans-serif";
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillText(roleLetter(role), 32, 34);
    }

    const letterTexture = new THREE.CanvasTexture(letterCanvas);

    letterTexture.colorSpace = THREE.SRGBColorSpace;

    for (const side of [-1, 1]) {
      const letter = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), new THREE.MeshStandardMaterial({ map: letterTexture, roughness: 0.6 }));

      letter.position.set(side * (BODY_W / 2 + 0.004), body.position.y + 0.05, 0);
      letter.rotation.y = side * Math.PI / 2;
      group.add(letter);
    }
  }

  // Arms, each hanging from a shoulder pivot.
  const armLeft = new THREE.Group();
  const armRight = new THREE.Group();

  for (const [arm, side] of [[armLeft, -1], [armRight, 1]] as const) {
    const upper = box(0.07, ARM_L, 0.07, DARK);
    const hand = box(0.1, 0.09, 0.1, DARK);

    upper.position.y = -ARM_L / 2;
    hand.position.y = -ARM_L - 0.02;
    arm.add(upper, hand);
    arm.position.set(side * (BODY_W / 2 + 0.05), body.position.y + BODY_H * 0.32, 0);
    group.add(arm);
  }

  // Three dots over the head while it works.
  const dots = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: new THREE.Color("#ffffff"), emissiveIntensity: 1.2 }));

  dots.position.y = LEG_H + BODY_H + 0.35;
  dots.visible = false;
  group.add(dots);

  // What a pointer hits: one box around the whole MO, unseen.
  const hit = new THREE.Mesh(new THREE.BoxGeometry(BODY_W + 0.2, LEG_H + BODY_H + 0.2, BODY_D + 0.2), new THREE.MeshBasicMaterial({ visible: false }));

  hit.position.y = (LEG_H + BODY_H + 0.2) / 2;
  hit.name = name;
  group.add(hit);
  group.name = name;

  return { group, body, screen, armLeft, armRight, legLeft, legRight, dots, hit, face: "smile", faceTexture, faceCanvas, screenMaterial, supervisor };
}

/** The face a mood and a pose call for. */
export function faceOf(mood: Mood, pose: Pose): Face {
  if (mood === "off") return "off";
  if (pose === "doze") return "doze";
  if (pose === "type") return "work";

  return "smile";
}

/** The MO posed: its limbs and body set for the pose at `beat` seconds into it. */
export function poseMo(mo: MoBody, pose: Pose, beat: number, mood: Mood): void {
  const swing = Math.sin(beat * 9);
  const face = faceOf(mood, pose);

  if (face !== mo.face || face === "doze") {
    mo.face = face;
    drawFace(mo.faceCanvas, face, mo.supervisor, beat);
    mo.faceTexture.needsUpdate = true;
    mo.screenMaterial.emissiveIntensity = face === "off" ? 0 : face === "work" ? 0.9 : 0.55;
  }

  mo.dots.visible = pose === "type";
  mo.dots.position.x = Math.sin(beat * 6) * 0.03;

  // Everything hangs from the body's height: legs under it, the body lowered when seated.
  const seated = pose === "sit" || pose === "type";
  const lift = seated ? -0.18 : pose === "walk" ? Math.abs(Math.sin(beat * 9)) * 0.03 : 0;

  mo.body.position.y = LEG_H + 0.04 + BODY_H / 2 + lift;
  mo.screen.position.y = mo.body.position.y + BODY_H * 0.16;
  mo.armLeft.position.y = mo.body.position.y + BODY_H * 0.32;
  mo.armRight.position.y = mo.body.position.y + BODY_H * 0.32;

  for (const child of mo.group.children) {
    if (child !== mo.body && child !== mo.screen && child !== mo.armLeft && child !== mo.armRight && child !== mo.legLeft && child !== mo.legRight && child !== mo.dots && child !== mo.hit) {
      // Buttons and letters ride with the body.
      child.position.y = child.userData.baseY === undefined ? (child.userData.baseY = child.position.y) : child.userData.baseY + lift;
    }
  }

  switch (pose) {
    case "walk":
      mo.legLeft.rotation.x = swing * 0.7;
      mo.legRight.rotation.x = -swing * 0.7;
      mo.armLeft.rotation.x = -swing * 0.5;
      mo.armRight.rotation.x = swing * 0.5;
      mo.group.rotation.z = 0;
      break;
    case "sit":
      mo.legLeft.rotation.x = -Math.PI / 2 + 0.1;
      mo.legRight.rotation.x = -Math.PI / 2 + 0.1;
      mo.armLeft.rotation.x = -0.3;
      mo.armRight.rotation.x = -0.3;
      mo.group.rotation.z = 0;
      break;
    case "type":
      mo.legLeft.rotation.x = -Math.PI / 2 + 0.1;
      mo.legRight.rotation.x = -Math.PI / 2 + 0.1;
      mo.armLeft.rotation.x = -1.2 + Math.sin(beat * 14) * 0.12;
      mo.armRight.rotation.x = -1.2 + Math.cos(beat * 14) * 0.12;
      mo.group.rotation.z = 0;
      break;
    case "lean":
      mo.legLeft.rotation.x = 0;
      mo.legRight.rotation.x = 0;
      mo.armLeft.rotation.x = -1.1;
      mo.armRight.rotation.x = -1.1;
      mo.group.rotation.z = 0;
      break;
    case "doze":
      mo.legLeft.rotation.x = -Math.PI / 2 + 0.3;
      mo.legRight.rotation.x = -Math.PI / 2 + 0.2;
      mo.armLeft.rotation.x = 0.1;
      mo.armRight.rotation.x = 0.1;
      mo.group.rotation.z = 0.12;
      break;
    default:
      mo.legLeft.rotation.x = 0;
      mo.legRight.rotation.x = 0;
      mo.armLeft.rotation.x = Math.sin(beat * 1.3) * 0.08;
      mo.armRight.rotation.x = -Math.sin(beat * 1.3) * 0.08;
      mo.group.rotation.z = 0;
  }
}
