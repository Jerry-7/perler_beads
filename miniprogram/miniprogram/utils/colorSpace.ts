/**
 * Color space conversion and perceptual distance utilities.
 * Ported from server/app/color_matching.py — exact same math, just in TypeScript.
 */
import type { Rgb } from "./types";

/** CIELAB color triple: [L*, a*, b*] */
export type Lab = [number, number, number];

// ─── RGB Euclidean distance ───────────────────────────────────────────

/** Euclidean distance in RGB space (matches Python `rgb_distance`). */
export function rgbDistance(left: Rgb, right: Rgb): number {
  return Math.sqrt(
    (left[0] - right[0]) ** 2 +
    (left[1] - right[1]) ** 2 +
    (left[2] - right[2]) ** 2,
  );
}

// ─── sRGB → Linear → XYZ → CIELAB ────────────────────────────────────

/**
 * Convert sRGB [0..255] integer triple to CIELAB.
 * Uses LRU-style cache (Map with eviction) matching Python's @lru_cache(maxsize=8192).
 */
const LAB_CACHE = new Map<string, Lab>();
const LAB_CACHE_MAX = 8192;

// Eviction queue for FIFO-style LRU approximation
const LAB_CACHE_KEYS: string[] = [];

export function rgbToLab(rgb: Rgb): Lab {
  const cacheKey = `${rgb[0]},${rgb[1]},${rgb[2]}`;
  const cached = LAB_CACHE.get(cacheKey);
  if (cached) return cached;

  // Step 1: sRGB → linear RGB (gamma inverse correction)
  const linearR = srgbChannelToLinear(rgb[0] / 255);
  const linearG = srgbChannelToLinear(rgb[1] / 255);
  const linearB = srgbChannelToLinear(rgb[2] / 255);

  // Step 2: Linear RGB → XYZ (D65 2° observer, scaled to 0-100)
  const x = (linearR * 0.4124564 + linearG * 0.3575761 + linearB * 0.1804375) * 100;
  const y = (linearR * 0.2126729 + linearG * 0.7151522 + linearB * 0.0721750) * 100;
  const z = (linearR * 0.0193339 + linearG * 0.1191920 + linearB * 0.9503041) * 100;

  // Step 3: XYZ → CIELAB (D65 reference white)
  const xRef = 95.047;
  const yRef = 100.0;
  const zRef = 108.883;

  const fx = xyzToLabComponent(x / xRef);
  const fy = xyzToLabComponent(y / yRef);
  const fz = xyzToLabComponent(z / zRef);

  const lab: Lab = [
    116 * fy - 16,
    500 * (fx - fy),
    200 * (fy - fz),
  ];

  // Cache with eviction
  if (LAB_CACHE.size >= LAB_CACHE_MAX) {
    const oldest = LAB_CACHE_KEYS.shift()!;
    LAB_CACHE.delete(oldest);
  }
  LAB_CACHE.set(cacheKey, lab);
  LAB_CACHE_KEYS.push(cacheKey);

  return lab;
}

function srgbChannelToLinear(channel: number): number {
  if (channel <= 0.04045) {
    return channel / 12.92;
  }
  return ((channel + 0.055) / 1.055) ** 2.4;
}

function xyzToLabComponent(value: number): number {
  const delta = 6 / 29;
  if (value > delta ** 3) {
    return value ** (1 / 3); // cbrt
  }
  return value / (3 * delta ** 2) + 4 / 29;
}

// ─── CIEDE2000 ────────────────────────────────────────────────────────

/**
 * Full CIEDE2000 perceptual color distance between two CIELAB triples.
 * Matches Python `ciede2000_distance()` exactly.
 * kL, kC, kH are all 1.0 (default reference conditions).
 */
export function ciede2000Distance(left: Lab, right: Lab): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const leftL = left[0];
  const leftA = left[1];
  const leftB = left[2];
  const rightL = right[0];
  const rightA = right[1];
  const rightB = right[2];

  const averageL = (leftL + rightL) / 2;
  const leftC = Math.sqrt(leftA ** 2 + leftB ** 2);
  const rightC = Math.sqrt(rightA ** 2 + rightB ** 2);
  const averageC = (leftC + rightC) / 2;

  // G factor: adjusts a* to a' for chroma interaction
  const g = 0.5 * (1 - Math.sqrt(averageC ** 7 / (averageC ** 7 + 25 ** 7)));
  const leftAPrime = (1 + g) * leftA;
  const rightAPrime = (1 + g) * rightA;
  const leftCPrime = Math.sqrt(leftAPrime ** 2 + leftB ** 2);
  const rightCPrime = Math.sqrt(rightAPrime ** 2 + rightB ** 2);
  const averageCPrime = (leftCPrime + rightCPrime) / 2;

  // Hue angles
  const leftHPrime = labHueDegrees(leftB, leftAPrime, leftCPrime);
  const rightHPrime = labHueDegrees(rightB, rightAPrime, rightCPrime);

  // Delta values
  const deltaLPrime = rightL - leftL;
  const deltaCPrime = rightCPrime - leftCPrime;
  const deltaHPrime = deltaHuePrime(leftHPrime, rightHPrime, leftCPrime, rightCPrime);
  const deltaHBigPrime =
    2 * Math.sqrt(leftCPrime * rightCPrime) *
    Math.sin((deltaHPrime * Math.PI) / 360);

  const averageHPrime = averageHuePrime(leftHPrime, rightHPrime, leftCPrime, rightCPrime);

  // T weighting factor
  const t =
    1 -
    0.17 * Math.cos(((averageHPrime - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * averageHPrime * Math.PI) / 180) +
    0.32 * Math.cos(((3 * averageHPrime + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * averageHPrime - 63) * Math.PI) / 180);

  const deltaTheta = 30 * Math.exp(-(((averageHPrime - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(averageCPrime ** 7 / (averageCPrime ** 7 + 25 ** 7));

  // Weighting functions
  const sL =
    1 + (0.015 * (averageL - 50) ** 2) / Math.sqrt(20 + (averageL - 50) ** 2);
  const sC = 1 + 0.045 * averageCPrime;
  const sH = 1 + 0.015 * averageCPrime * t;

  // Rotation term
  const rT = -Math.sin(((2 * deltaTheta) * Math.PI) / 180) * rC;

  return Math.sqrt(
    (deltaLPrime / (kL * sL)) ** 2 +
    (deltaCPrime / (kC * sC)) ** 2 +
    (deltaHBigPrime / (kH * sH)) ** 2 +
    rT * (deltaCPrime / (kC * sC)) * (deltaHBigPrime / (kH * sH)),
  );
}

/** Compute hue angle in degrees (0..360) from b and a' values. */
function labHueDegrees(b: number, aPrime: number, cPrime: number): number {
  if (cPrime === 0) return 0;
  const hue = (Math.atan2(b, aPrime) * 180) / Math.PI;
  return ((hue % 360) + 360) % 360;
}

/** Compute delta hue, handling wrap-around at 360°. */
function deltaHuePrime(
  leftH: number,
  rightH: number,
  leftC: number,
  rightC: number,
): number {
  if (leftC * rightC === 0) return 0;
  const hueDelta = rightH - leftH;
  if (Math.abs(hueDelta) <= 180) return hueDelta;
  if (hueDelta > 180) return hueDelta - 360;
  return hueDelta + 360;
}

/** Compute average hue, handling the 360° boundary. */
function averageHuePrime(
  leftH: number,
  rightH: number,
  leftC: number,
  rightC: number,
): number {
  if (leftC * rightC === 0) return leftH + rightH;
  if (Math.abs(leftH - rightH) <= 180) return (leftH + rightH) / 2;
  if (leftH + rightH < 360) return (leftH + rightH + 360) / 2;
  return (leftH + rightH - 360) / 2;
}

// ─── Convenience ──────────────────────────────────────────────────────

/**
 * Perceptual distance via CIEDE2000 on CIELAB-converted RGB values.
 * Convenience wrapper matching Python `perceptual_distance()`.
 */
export function perceptualDistance(left: Rgb, right: Rgb): number {
  return ciede2000Distance(rgbToLab(left), rgbToLab(right));
}
