/** Clockwise from twelve o'clock; coordinates are relative to the dial centre. */
export function dialValueAtPoint(x: number, y: number, count: number, step: number) {
  const degrees = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360
  return Math.round(degrees / 360 * count / step) * step % count
}

/** Keep consecutive turns continuous across the zero-degree seam. */
export function nearestDialRotation(previous: number, angle: number) {
  return previous + ((angle - previous % 360 + 540) % 360 - 180)
}
