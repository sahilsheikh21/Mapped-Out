/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear interpolation between a and b */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth damp (spring-like interpolation) */
export function smoothDamp(
  current: number,
  target: number,
  velocity: { value: number },
  smoothTime: number,
  deltaTime: number,
  maxSpeed = Infinity
): number {
  smoothTime = Math.max(0.0001, smoothTime);
  const omega = 2.0 / smoothTime;
  const x = omega * deltaTime;
  const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);
  let change = current - target;
  const maxChange = maxSpeed * smoothTime;
  change = clamp(change, -maxChange, maxChange);
  const temp = (velocity.value + omega * change) * deltaTime;
  velocity.value = (velocity.value - omega * temp) * exp;
  let output = (current - change) + (change + temp) * exp;
  if ((target - current > 0) === (output > target)) {
    output = target;
    velocity.value = (output - target) / deltaTime;
  }
  return output;
}

/** Get a seeded pseudo-random number from a string (for consistent building selection) */
export function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Normalize to 0-1
  return Math.abs(hash % 10000) / 10000;
}

/** Pick a random item from an array using a seed */
export function seededPick<T>(arr: T[], seed: string): T {
  const idx = Math.floor(seededRandom(seed) * arr.length);
  return arr[idx];
}

/** Convert m/s to km/h */
export function msToKmh(ms: number): number {
  return ms * 3.6;
}

/** Normalize an angle to [-PI, PI] */
export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}
