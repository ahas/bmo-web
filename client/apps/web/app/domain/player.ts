import { appUrl } from "./urls";

import type { ExactMessageId } from "#shared/types";

// Playing what a room's message carried: a sound in the console's own player and a video in the
// browser's, each where it stands, asked for by the message it belongs to.

// Where a kept file is asked for. The kind is part of the road rather than the file's name, so a
// video kept the same way is served by the same route under its own kind.
/** A voice briefing's sound, as the console serves it from the voice engine. */
export function briefingSoundUrl(id: number): string {
  return appUrl(`/api/briefings/${id}/sound`);
}

export function mediaUrl(kind: string, chatId: number, messageId: ExactMessageId): string {
  return appUrl(`/api/media/${kind}/${chatId}/${messageId}`);
}

// What of a player the rule below touches.
export interface Playing {
  paused: boolean;
  pause: () => void;
}

// One thing plays at a time. The player that has just started takes the sound from every other
// one on the screen, and each stops where it stands, so pressing it again carries on from there.
export function playAlone(started: Playing, players: Iterable<Playing>): void {
  for (const player of players) {
    if (player !== started && !player.paused) {
      player.pause();
    }
  }
}

// Where a sound stands, as a player reads it: minutes and seconds, each in two places, and hours in
// front once it runs past one.
export function playClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");

  return minutes < 60
    ? `${String(minutes).padStart(2, "0")}:${rest}`
    : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}`;
}

// The length a player can seek across, or none where the file has not said it or says it is
// unbounded, as a stream does.
export function knownLength(duration: number): number | null {
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

// How loud a tapped stretch of samples is, from nought to one: its root mean square against what a
// voice reads at its loudest, curved so a quiet syllable still shows. The spectrum is not read for
// it: it is in decibels and smoothed, so it moves little between a word and a pause.
const LOUD_RMS = 0.2;
const LOUDNESS_CURVE = 0.7;

export function loudnessOf(samples: Uint8Array): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;

  for (const sample of samples) {
    const level = (sample - 128) / 128;

    sum += level * level;
  }

  return Math.min(1, Math.sqrt(sum / samples.length) / LOUD_RMS) ** LOUDNESS_CURVE;
}

// The aura's loudness one frame on: it rises quickly toward a louder sound and falls back slowly,
// so it swells with each syllable and ebbs between them rather than flickering frame by frame.
const AURA_RISE = 0.35;
const AURA_FALL = 0.15;

export function easedLoudness(previous: number, heard: number): number {
  const target = Math.min(1, Math.max(0, heard));

  return previous + (target - previous) * (target > previous ? AURA_RISE : AURA_FALL);
}

// How the aura stands at a loudness: how far it reaches past the button, as a scale of the button's
// own size, and how bright it is. Even at silence it shows a thin ring while the sound plays, and the
// still ring a reader who asked for less movement is given stands at a middle loudness.
const AURA_REST_SCALE = 1.06;
const AURA_REACH = 0.26;
const AURA_REST_GLOW = 0.45;
export const AURA_STILL = 0.5;

export function auraOf(loudness: number): { scale: number; glow: number } {
  const level = Math.min(1, Math.max(0, loudness));

  return { scale: AURA_REST_SCALE + AURA_REACH * level, glow: AURA_REST_GLOW + (1 - AURA_REST_GLOW) * level };
}

// What a player's round button shows: the play mark at rest, a spinner from the press until the
// sound is first heard, and the pause mark from then until it stops. A stall for bytes while it
// plays changes nothing, since a spinning button takes no press and the one press that must always
// work there is the one that stops it.
export type PlayerButton = "play" | "starting" | "pause";

// What the button hears of its element: a press, the press refused, the element's own events, and
// "moved" for its clock running on past where the press found it. A clock running on is the sound
// heard, so a "playing" the browser leaves out never holds the spinner up.
export type PlayerSignal = "pressed" | "refused" | "play" | "playing" | "moved" | "waiting" | "pause" | "ended" | "error";

export function buttonAfter(now: PlayerButton, signal: PlayerSignal): PlayerButton {
  switch (signal) {
    case "pressed":
    case "play":
      return now === "play" ? "starting" : now;
    case "playing":
      return "pause";
    case "moved":
      return now === "starting" ? "pause" : now;
    case "waiting":
      return now;
    case "refused":
    case "pause":
    case "ended":
    case "error":
      return "play";
  }
}
