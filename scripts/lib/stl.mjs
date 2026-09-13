/**
 * Binary STL reader.
 *
 * Unitree's G1 meshes open with the ASCII word "solid", which makes every
 * naive `startsWith('solid')` sniffer — including three.js's STLLoader before
 * r128 and most one-liner parsers on the internet — try to parse them as ASCII
 * and return an empty geometry. They are binary. The header is 80 free-form
 * bytes and Unitree happened to write a tool banner into it.
 *
 * The only reliable test is arithmetic, and it is exact, so we use it as an
 * assertion rather than a guess: a binary STL is 84 + 50 * triangleCount bytes,
 * full stop. pelvis.STL is 21216 triangles and exactly 1_060_884 bytes.
 * If that identity does not hold we throw instead of silently emitting a
 * headless robot.
 */
import { readFileSync } from 'node:fs'

/**
 * @typedef {object} RawMesh
 * @property {Float64Array} positions  3 floats per vertex, 9 per triangle (unindexed)
 * @property {number} triangles
 */

/**
 * @param {string} file
 * @returns {RawMesh}
 */
export function readBinarySTL(file) {
  const buf = readFileSync(file)
  if (buf.length < 84) throw new Error(`${file}: ${buf.length} bytes is too short to be an STL`)

  const count = buf.readUInt32LE(80)
  const expected = 84 + count * 50
  if (buf.length !== expected) {
    throw new Error(
      `${file}: header claims ${count} triangles (${expected} bytes) but the file is ` +
        `${buf.length} bytes. Not a binary STL, or truncated.`,
    )
  }

  // Read into f64 rather than f32. The STL payload is f32, but every downstream
  // step (fixed-transform baking, clustering, area weighting) accumulates, and
  // accumulating in f32 visibly shears the long bone chains — the wrist ends up
  // ~0.4 mm off the URDF frame by the time three fixed transforms have been
  // composed. Precision is recovered to f32 once, at GLB write time.
  const positions = new Float64Array(count * 9)
  let o = 84
  let w = 0
  for (let i = 0; i < count; i++) {
    // Skip the per-facet normal: STL normals are frequently zero or wrong, and
    // we recompute them after decimation anyway.
    o += 12
    for (let k = 0; k < 9; k++) {
      positions[w++] = buf.readFloatLE(o)
      o += 4
    }
    o += 2 // uint16 "attribute byte count", unused by every writer in practice
  }
  return { positions, triangles: count }
}

/** Axis-aligned bounds of an unindexed position array. */
export function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = positions[i + k]
      if (v < min[k]) min[k] = v
      if (v > max[k]) max[k] = v
    }
  }
  if (!isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
}

/** Summed triangle area. Used to size a link's share of the triangle budget. */
export function surfaceArea(positions) {
  let sum = 0
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i]
    const ay = positions[i + 4] - positions[i + 1]
    const az = positions[i + 5] - positions[i + 2]
    const bx = positions[i + 6] - positions[i]
    const by = positions[i + 7] - positions[i + 1]
    const bz = positions[i + 8] - positions[i + 2]
    const cx = ay * bz - az * by
    const cy = az * bx - ax * bz
    const cz = ax * by - ay * bx
    sum += Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5
  }
  return sum
}
