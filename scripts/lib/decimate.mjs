/**
 * Vertex-cluster decimation, in plain Node.
 *
 * Why not a library: the two real options are meshoptimizer (WASM, simplifies by
 * quadric edge collapse) and gltf-transform. Both are excellent and both would
 * be the right answer if this step ran often or needed to preserve UVs. It runs
 * once per vendor URDF drop, there are no UVs, and the G1 is looked at from 2 m
 * in the dive and as a 4 cm puck on the table — a regime where *silhouette* is
 * the entire signal and surface fidelity is worth nothing. Vertex clustering is
 * the algorithm whose error is bounded by the grid cell rather than by a
 * heuristic, which is exactly the property you want when the acceptance test is
 * "does the outline still read as a G1".
 *
 * Grid clustering also has a property edge-collapse does not: it is topology
 * agnostic. Unitree's STLs are triangle soup with duplicated and T-junctioned
 * vertices, and a quadric simplifier has to weld them first anyway.
 *
 * Three steps: quantise onto a grid and weld, drop the triangles that collapsed,
 * then rebuild normals area-weighted with a crease split.
 */

/**
 * Faces whose normals differ by more than this get a hard edge; below it they
 * share a smoothed vertex normal.
 *
 * 50 deg is chosen against what decimation *produces*, not against the source
 * CAD. A cylinder that survives clustering as an 8-gon has 45 deg between
 * adjacent faces, so 50 smooths it back into a cylinder; a machined plate corner
 * is 90 deg and stays a crisp edge. At 40 deg the shins turned into visibly
 * faceted tubes, at 70 deg the ankle brackets lost their corners and read as
 * melted. The G1's whole visual character is flat plates meeting round tubes and
 * this threshold is the line between them.
 */
const CREASE_RAD = (50 * Math.PI) / 180

/**
 * Cluster to a grid whose longest axis is divided into `n` cells.
 *
 * @param {Float64Array} src unindexed positions, 9 per triangle
 * @param {number} n cells along the longest bounding-box axis
 * @returns {{positions: Float64Array, indices: Uint32Array, triangles: number, vertices: number}}
 */
export function clusterAt(src, n) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < src.length; i += 3) {
    if (src[i] < minX) minX = src[i]
    if (src[i] > maxX) maxX = src[i]
    if (src[i + 1] < minY) minY = src[i + 1]
    if (src[i + 1] > maxY) maxY = src[i + 1]
    if (src[i + 2] < minZ) minZ = src[i + 2]
    if (src[i + 2] > maxZ) maxZ = src[i + 2]
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
  // A cell of exactly span/n would put the far face's vertices in cell n, one
  // past the end; nudging the cell up by an epsilon keeps the index in [0, n].
  const cell = (span / n) * (1 + 1e-9) || 1
  const nx = Math.floor((maxX - minX) / cell) + 1
  const ny = Math.floor((maxY - minY) / cell) + 1

  // Area-weighted accumulation. A tessellated fillet contributes hundreds of
  // tiny triangles to one cell and a structural plate contributes one big one;
  // weighting by area stops the fillet from dragging the cluster representative
  // off the plate and rounding the silhouette's corner away.
  const acc = new Map()
  const tri = src.length / 9
  const faceArea = new Float64Array(tri)
  for (let t = 0; t < tri; t++) {
    const i = t * 9
    const ax = src[i + 3] - src[i], ay = src[i + 4] - src[i + 1], az = src[i + 5] - src[i + 2]
    const bx = src[i + 6] - src[i], by = src[i + 7] - src[i + 1], bz = src[i + 8] - src[i + 2]
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
    // The +1e-12 keeps a degenerate source triangle (Unitree's STLs have a few)
    // from contributing a zero weight and being lost from the cluster entirely.
    faceArea[t] = Math.sqrt(cx * cx + cy * cy + cz * cz) * 0.5 + 1e-12
  }

  const cellOf = new Int32Array(tri * 3)
  for (let t = 0; t < tri; t++) {
    const w = faceArea[t]
    for (let c = 0; c < 3; c++) {
      const i = t * 9 + c * 3
      const ix = Math.floor((src[i] - minX) / cell)
      const iy = Math.floor((src[i + 1] - minY) / cell)
      const iz = Math.floor((src[i + 2] - minZ) / cell)
      const key = ix + iy * (nx + 1) + iz * (nx + 1) * (ny + 1)
      let a = acc.get(key)
      if (a === undefined) {
        a = { id: acc.size, x: 0, y: 0, z: 0, w: 0 }
        acc.set(key, a)
      }
      a.x += src[i] * w
      a.y += src[i + 1] * w
      a.z += src[i + 2] * w
      a.w += w
      cellOf[t * 3 + c] = a.id
    }
  }

  const positions = new Float64Array(acc.size * 3)
  for (const a of acc.values()) {
    positions[a.id * 3] = a.x / a.w
    positions[a.id * 3 + 1] = a.y / a.w
    positions[a.id * 3 + 2] = a.z / a.w
  }

  // Drop the collapsed ones (two or three corners in the same cell) and the
  // duplicates that clustering creates when two source triangles land on the
  // same three cells — those would be coincident faces, i.e. pure overdraw.
  // Keyed as a Map of Sets rather than one composite number: a single packed key
  // would need cluster ids to fit in a third of a float's 53 mantissa bits, and
  // the torso's 154 k source vertices sit close enough to that edge to be a
  // future silent collision.
  const seen = new Map()
  const out = []
  for (let t = 0; t < tri; t++) {
    const a = cellOf[t * 3], b = cellOf[t * 3 + 1], c = cellOf[t * 3 + 2]
    if (a === b || b === c || a === c) continue
    const lo3 = Math.min(a, b, c)
    const hi3 = Math.max(a, b, c)
    const mid3 = a + b + c - lo3 - hi3
    let bucket = seen.get(lo3)
    if (bucket === undefined) seen.set(lo3, (bucket = new Set()))
    const sub = mid3 * acc.size + hi3
    if (bucket.has(sub)) continue
    bucket.add(sub)
    out.push(a, b, c)
  }

  return {
    positions,
    indices: Uint32Array.from(out),
    triangles: out.length / 3,
    vertices: acc.size,
  }
}

/**
 * Rebuild normals on a clustered mesh, splitting vertices across creases.
 *
 * Clustering leaves one vertex per cell shared by every face that touched it,
 * which if left smooth-shaded rounds every machined corner into a blob. This
 * re-splits a corner into as many vertices as it has distinct smoothing groups
 * and no more.
 */
export function rebuildNormals(mesh) {
  const { positions, indices } = mesh
  const triCount = indices.length / 3
  const fn = new Float64Array(triCount * 3)
  const smooth = new Float64Array(positions.length)

  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3
    const ax = positions[ib] - positions[ia], ay = positions[ib + 1] - positions[ia + 1], az = positions[ib + 2] - positions[ia + 2]
    const bx = positions[ic] - positions[ia], by = positions[ic + 1] - positions[ia + 1], bz = positions[ic + 2] - positions[ia + 2]
    let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx
    const len = Math.hypot(cx, cy, cz)
    // The cross product's length is twice the area, so accumulating it unnormalised
    // *is* the area weighting — big faces should dominate a shared vertex.
    smooth[ia] += cx; smooth[ia + 1] += cy; smooth[ia + 2] += cz
    smooth[ib] += cx; smooth[ib + 1] += cy; smooth[ib + 2] += cz
    smooth[ic] += cx; smooth[ic + 1] += cy; smooth[ic + 2] += cz
    if (len > 0) { cx /= len; cy /= len; cz /= len }
    fn[t * 3] = cx; fn[t * 3 + 1] = cy; fn[t * 3 + 2] = cz
  }

  for (let v = 0; v < positions.length; v += 3) {
    const len = Math.hypot(smooth[v], smooth[v + 1], smooth[v + 2])
    if (len > 0) { smooth[v] /= len; smooth[v + 1] /= len; smooth[v + 2] /= len }
  }

  const cosCrease = Math.cos(CREASE_RAD)
  const outPos = []
  const outNrm = []
  const outIdx = new Uint32Array(indices.length)
  const remap = new Map()

  for (let t = 0; t < triCount; t++) {
    for (let c = 0; c < 3; c++) {
      const v = indices[t * 3 + c]
      const sx = smooth[v * 3], sy = smooth[v * 3 + 1], sz = smooth[v * 3 + 2]
      const dot = fn[t * 3] * sx + fn[t * 3 + 1] * sy + fn[t * 3 + 2] * sz
      const creased = dot < cosCrease
      const nx = creased ? fn[t * 3] : sx
      const ny = creased ? fn[t * 3 + 1] : sy
      const nz = creased ? fn[t * 3 + 2] : sz
      // Two creased corners of the same cell that face nearly the same way are
      // one vertex, not two: quantising the normal into the key is what keeps
      // the split count proportional to real hard edges instead of to faces.
      const key = creased
        ? `${v}|${Math.round(nx * 32)},${Math.round(ny * 32)},${Math.round(nz * 32)}`
        : `${v}`
      let idx = remap.get(key)
      if (idx === undefined) {
        idx = outPos.length / 3
        remap.set(key, idx)
        outPos.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2])
        outNrm.push(nx, ny, nz)
      }
      outIdx[t * 3 + c] = idx
    }
  }

  return {
    positions: Float32Array.from(outPos),
    normals: Float32Array.from(outNrm),
    indices: outIdx,
    triangles: triCount,
    vertices: outPos.length / 3,
  }
}

/**
 * Decimate to a triangle budget by bisecting on grid resolution.
 *
 * Triangle count is monotone in `n` in every practical case but not provably so
 * (a finer grid can un-weld a fold and *add* a triangle), so this bisects for
 * the finest grid that fits and keeps the best fitting result it actually saw
 * rather than trusting the final probe.
 */
export function decimateToBudget(src, budget, { minN = 2, maxN = 400 } = {}) {
  let lo = minN
  let hi = maxN
  let best = null
  // If even the coarsest grid overshoots, that result is still the answer — a
  // 2-cell grid on one link cannot be beaten, and reporting it lets the caller
  // fail loudly on the total rather than emit a mystery.
  for (let iter = 0; iter < 12 && lo <= hi; iter++) {
    const mid = (lo + hi) >> 1
    const m = clusterAt(src, mid)
    if (m.triangles <= budget) {
      if (!best || m.triangles > best.triangles) best = { ...m, n: mid }
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  if (!best) {
    const m = clusterAt(src, minN)
    best = { ...m, n: minN }
  }
  return { ...rebuildNormals(best), n: best.n }
}
