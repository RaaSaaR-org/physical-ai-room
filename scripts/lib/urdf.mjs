/**
 * The smallest URDF reader that can be correct for this one file.
 *
 * A real XML parser is a dependency, and a dependency that parses attacker-shaped
 * XML for a build step that reads one vendor file we ship ourselves is a bad
 * trade. What follows is regex-driven and deliberately *loud*: anything it does
 * not understand (a mesh `scale`, a `<geometry>` that is not a mesh inside a
 * `<visual>`, a joint with no parent) throws rather than being skipped, because
 * a silently skipped link is a robot missing a shin and nobody notices until the
 * booth.
 *
 * Frame convention, which everything downstream inherits: URDF is **Z-up,
 * X-forward, Y-left**, metres. We do not convert. See the note in prep-g1.mjs.
 */
import { readFileSync } from 'node:fs'

// ── Rigid transforms ────────────────────────────────────────────────────────
//
// Every transform in this file is rigid — rotation plus translation, no scale —
// stored as { r: 9 numbers row-major, t: 3 }. That is not a simplification of
// glTF's 4x4: URDF joint origins are rigid by definition, and keeping the type
// narrow means the mesh-baking path cannot accidentally introduce a scale that
// would then need normal matrices to undo.

export const IDENTITY = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }

/** URDF fixed-axis rpy: R = Rz(yaw) * Ry(pitch) * Rx(roll). */
export function rpyToMat3([roll, pitch, yaw]) {
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr,
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr,
    -sp,     cp * sr,                cp * cr,
  ]
}

export function makeTransform(xyz, rpy) {
  return { r: rpyToMat3(rpy), t: [...xyz] }
}

/** a then b applied to a point == compose(b, a). Standard 4x4 order: b * a. */
export function compose(b, a) {
  const r = new Array(9)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = b.r[i * 3] * a.r[j] + b.r[i * 3 + 1] * a.r[3 + j] + b.r[i * 3 + 2] * a.r[6 + j]
    }
  }
  const t = [
    b.r[0] * a.t[0] + b.r[1] * a.t[1] + b.r[2] * a.t[2] + b.t[0],
    b.r[3] * a.t[0] + b.r[4] * a.t[1] + b.r[5] * a.t[2] + b.t[1],
    b.r[6] * a.t[0] + b.r[7] * a.t[1] + b.r[8] * a.t[2] + b.t[2],
  ]
  return { r, t }
}

/** Rotation part as a glTF-order quaternion [x, y, z, w]. */
export function mat3ToQuat(r) {
  const trace = r[0] + r[4] + r[8]
  let x, y, z, w
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2
    w = 0.25 * s
    x = (r[7] - r[5]) / s
    y = (r[2] - r[6]) / s
    z = (r[3] - r[1]) / s
  } else if (r[0] > r[4] && r[0] > r[8]) {
    const s = Math.sqrt(1 + r[0] - r[4] - r[8]) * 2
    w = (r[7] - r[5]) / s
    x = 0.25 * s
    y = (r[1] + r[3]) / s
    z = (r[2] + r[6]) / s
  } else if (r[4] > r[8]) {
    const s = Math.sqrt(1 + r[4] - r[0] - r[8]) * 2
    w = (r[2] - r[6]) / s
    x = (r[1] + r[3]) / s
    y = 0.25 * s
    z = (r[5] + r[7]) / s
  } else {
    const s = Math.sqrt(1 + r[8] - r[0] - r[4]) * 2
    w = (r[3] - r[1]) / s
    x = (r[2] + r[6]) / s
    y = (r[5] + r[7]) / s
    z = 0.25 * s
  }
  const n = Math.hypot(x, y, z, w)
  return [x / n, y / n, z / n, w / n]
}

/** Apply a rigid transform to an unindexed position array, in place. */
export function bakeInto(positions, m) {
  if (m === IDENTITY) return positions
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]
    const y = positions[i + 1]
    const z = positions[i + 2]
    positions[i] = m.r[0] * x + m.r[1] * y + m.r[2] * z + m.t[0]
    positions[i + 1] = m.r[3] * x + m.r[4] * y + m.r[5] * z + m.t[1]
    positions[i + 2] = m.r[6] * x + m.r[7] * y + m.r[8] * z + m.t[2]
  }
  return positions
}

// ── Parsing ─────────────────────────────────────────────────────────────────

const nums = (s) => s.trim().split(/\s+/).map(Number)

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`))
  return m ? m[1] : null
}

function originOf(body) {
  const m = body.match(/<origin([^>]*)\/>/)
  if (!m) return { xyz: [0, 0, 0], rpy: [0, 0, 0] }
  const xyz = attr(m[1], 'xyz')
  const rpy = attr(m[1], 'rpy')
  return { xyz: xyz ? nums(xyz) : [0, 0, 0], rpy: rpy ? nums(rpy) : [0, 0, 0] }
}

/**
 * @returns {{ name: string, links: Map<string, {name: string, visuals: {mesh: string, origin: {xyz:number[],rpy:number[]}}[]}>, joints: object[] }}
 */
export function parseURDF(file, { skipSensorMarkers = false } = {}) {
  // Strip comments first. g1.urdf keeps a commented-out `world` link and a
  // `floating_base_joint` in a block comment as a note for MuJoCo conversion;
  // parsing those would give us a phantom root and a cyclic-looking tree.
  const src = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '')

  const robot = attr(src.match(/<robot[^>]*>/)?.[0] ?? '', 'name') ?? 'robot'

  const links = new Map()
  for (const m of src.matchAll(/<link\s+name="([^"]+)"\s*(?:\/>|>([\s\S]*?)<\/link>)/g)) {
    const [, name, body = ''] = m
    const visuals = []
    for (const v of body.matchAll(/<visual\s*>([\s\S]*?)<\/visual>/g)) {
      const geom = v[1].match(/<geometry\s*>([\s\S]*?)<\/geometry>/)
      if (!geom) throw new Error(`link ${name}: <visual> with no <geometry>`)
      const mesh = geom[1].match(/<mesh([^>]*)\/>/)
      if (!mesh) {
        // H1 marks optical frames with 1 mm spheres, invisible at display scale.
        const sphere = geom[1].match(/<sphere\s+radius="([^"]+)"\s*\/>/)
        if (skipSensorMarkers && sphere && Number(sphere[1]) > 0 && Number(sphere[1]) <= 0.002) continue
        // The G1's visuals are all meshes. A primitive here would silently drop
        // a whole limb, so refuse rather than skip.
        throw new Error(`link ${name}: <visual> geometry is not a <mesh>: ${geom[1].trim()}`)
      }
      if (attr(mesh[1], 'scale')) throw new Error(`link ${name}: mesh scale is not supported`)
      visuals.push({ mesh: attr(mesh[1], 'filename'), origin: originOf(v[1]) })
    }
    if (links.has(name)) throw new Error(`duplicate link ${name}`)
    links.set(name, { name, visuals })
  }

  const joints = []
  for (const m of src.matchAll(/<joint\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/joint>/g)) {
    const [, name, attrs, body] = m
    const type = attr(attrs, 'type')
    const parent = attr(body.match(/<parent[^>]*\/>/)?.[0] ?? '', 'link')
    const child = attr(body.match(/<child[^>]*\/>/)?.[0] ?? '', 'link')
    if (!parent || !child) throw new Error(`joint ${name}: missing parent or child`)
    const axisTag = body.match(/<axis[^>]*\/>/)
    const limitTag = body.match(/<limit[^>]*\/>/)
    const { xyz, rpy } = originOf(body)
    joints.push({
      name,
      type,
      parent,
      child,
      xyz,
      rpy,
      axis: axisTag ? nums(attr(axisTag[0], 'xyz')) : null,
      lower: limitTag && attr(limitTag[0], 'lower') !== null ? Number(attr(limitTag[0], 'lower')) : null,
      upper: limitTag && attr(limitTag[0], 'upper') !== null ? Number(attr(limitTag[0], 'upper')) : null,
    })
  }

  for (const j of joints) {
    if (!links.has(j.parent)) throw new Error(`joint ${j.name}: unknown parent ${j.parent}`)
    if (!links.has(j.child)) throw new Error(`joint ${j.name}: unknown child ${j.child}`)
  }
  return { name: robot, links, joints }
}

/** The one link that is nobody's child. Throws unless there is exactly one. */
export function findRoot(urdf) {
  const children = new Set(urdf.joints.map((j) => j.child))
  const roots = [...urdf.links.keys()].filter((n) => !children.has(n))
  if (roots.length !== 1) throw new Error(`expected exactly one root link, found ${roots.join(', ') || 'none'}`)
  return roots[0]
}
