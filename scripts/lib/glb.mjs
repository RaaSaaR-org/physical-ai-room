/**
 * A glTF 2.0 binary container, written by hand.
 *
 * A GLB is a 12-byte header, a JSON chunk and a BIN chunk. We need nodes,
 * meshes, accessors, bufferViews, one buffer and one material — perhaps 300
 * lines including the validator below. Pulling in gltf-transform (plus its
 * property-graph runtime, plus @gltf-transform/extensions) to emit 40 kB of
 * JSON would add a dependency tree larger than the file it writes, for a build
 * step that runs when Unitree ships a new URDF, i.e. approximately never.
 *
 * The validator at the bottom is the actual reason this is safe. Hand-written
 * binary formats fail in ways that are invisible until a specific runtime
 * refuses them, so `validateGLB` re-parses our own output and checks the things
 * that bite: chunk padding, accessor byte alignment, min/max agreeing with the
 * data, index range, and an acyclic node tree.
 */

const MAGIC = 0x46546c67 // 'glTF'
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const FLOAT = 5126
const USHORT = 5123
const UINT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963

const align4 = (n) => (n + 3) & ~3

/**
 * @param {object} spec
 * @param {{name: string, parent: number|null, translation: number[]|null, rotation: number[]|null, mesh: number|null}[]} spec.nodes
 * @param {{name: string, positions: Float32Array, normals: Float32Array, indices: Uint32Array}[]} spec.meshes
 * @param {object} [spec.extras] copied onto asset.extras — provenance, budgets
 * @param {string} spec.generator
 * @returns {Buffer}
 */
export function writeGLB({ nodes, meshes, extras, generator }) {
  const bufferViews = []
  const accessors = []
  const chunks = []
  let byteLength = 0

  const push = (typedArray, target) => {
    // Every view starts 4-aligned. The spec only demands alignment to the
    // component size, but 4 satisfies every component type we emit and means
    // the accessor offsets (always 0 here) are trivially legal too.
    const pad = align4(byteLength) - byteLength
    if (pad) {
      chunks.push(Buffer.alloc(pad))
      byteLength += pad
    }
    const buf = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
    const view = { buffer: 0, byteOffset: byteLength, byteLength: buf.length }
    if (target) view.target = target
    bufferViews.push(view)
    chunks.push(buf)
    byteLength += buf.length
    return bufferViews.length - 1
  }

  const minMax = (data, stride) => {
    const min = new Array(stride).fill(Infinity)
    const max = new Array(stride).fill(-Infinity)
    for (let i = 0; i < data.length; i += stride) {
      for (let k = 0; k < stride; k++) {
        const v = data[i + k]
        if (v < min[k]) min[k] = v
        if (v > max[k]) max[k] = v
      }
    }
    return { min, max }
  }

  const gltfMeshes = meshes.map((m) => {
    const vertexCount = m.positions.length / 3
    if (m.normals.length !== m.positions.length) {
      throw new Error(`${m.name}: ${m.normals.length / 3} normals for ${vertexCount} positions`)
    }
    const posView = push(m.positions, ARRAY_BUFFER)
    const pmm = minMax(m.positions, 3)
    accessors.push({ bufferView: posView, componentType: FLOAT, count: vertexCount, type: 'VEC3', min: pmm.min, max: pmm.max })
    const posAcc = accessors.length - 1

    const nrmView = push(m.normals, ARRAY_BUFFER)
    const nmm = minMax(m.normals, 3)
    accessors.push({ bufferView: nrmView, componentType: FLOAT, count: vertexCount, type: 'VEC3', min: nmm.min, max: nmm.max })
    const nrmAcc = accessors.length - 1

    // uint16 indices whenever they fit, which after decimation they always do.
    // It halves the index block — the single biggest lever on file size here —
    // and Quest's driver takes a fast path for 16-bit element arrays.
    const narrow = vertexCount <= 65535
    const idx = narrow ? Uint16Array.from(m.indices) : m.indices
    const idxView = push(idx, ELEMENT_ARRAY_BUFFER)
    const imm = minMax(idx, 1)
    accessors.push({
      bufferView: idxView,
      componentType: narrow ? USHORT : UINT,
      count: idx.length,
      type: 'SCALAR',
      min: imm.min,
      max: imm.max,
    })
    const idxAcc = accessors.length - 1

    return {
      name: m.name,
      primitives: [{ attributes: { POSITION: posAcc, NORMAL: nrmAcc }, indices: idxAcc, material: 0 }],
    }
  })

  const gltfNodes = nodes.map((n) => {
    const out = { name: n.name }
    if (n.translation && n.translation.some((v) => v !== 0)) out.translation = n.translation
    if (n.rotation && (n.rotation[0] || n.rotation[1] || n.rotation[2] || n.rotation[3] !== 1)) {
      out.rotation = n.rotation
    }
    if (n.mesh !== null && n.mesh !== undefined) out.mesh = n.mesh
    return out
  })
  nodes.forEach((n, i) => {
    if (n.parent === null || n.parent === undefined) return
    const p = gltfNodes[n.parent]
    ;(p.children ??= []).push(i)
  })
  const roots = nodes.map((n, i) => (n.parent === null || n.parent === undefined ? i : -1)).filter((i) => i >= 0)

  const json = {
    asset: { version: '2.0', generator, ...(extras ? { extras } : {}) },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    materials: [
      {
        // Placeholder, and honestly labelled as one. The room replaces it with
        // the hologram shader (PRD 7.3) the moment the GLB is loaded; it exists
        // so the file is valid glTF and opens in any viewer for eyeballing.
        name: 'g1_placeholder',
        pbrMetallicRoughness: { baseColorFactor: [0.16, 0.16, 0.17, 1], metallicFactor: 0.6, roughnessFactor: 0.45 },
        doubleSided: false,
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: align4(byteLength) }],
  }

  const tailPad = align4(byteLength) - byteLength
  if (tailPad) chunks.push(Buffer.alloc(tailPad))
  const bin = Buffer.concat(chunks)

  // JSON pads with spaces, BIN pads with zeros. Not interchangeable: a decoder
  // is entitled to hand the JSON chunk straight to a parser, and a NUL there is
  // a syntax error in several of them.
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPad = align4(jsonBuf.length) - jsonBuf.length
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)])

  const total = 12 + 8 + jsonBuf.length + 8 + bin.length
  const out = Buffer.alloc(total)
  out.writeUInt32LE(MAGIC, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(total, 8)
  out.writeUInt32LE(jsonBuf.length, 12)
  out.writeUInt32LE(JSON_CHUNK, 16)
  jsonBuf.copy(out, 20)
  let o = 20 + jsonBuf.length
  out.writeUInt32LE(bin.length, o)
  out.writeUInt32LE(BIN_CHUNK, o + 4)
  bin.copy(out, o + 8)
  return out
}

const COMPONENT_BYTES = { [FLOAT]: 4, [USHORT]: 2, [UINT]: 4 }
const TYPE_COMPONENTS = { SCALAR: 1, VEC3: 3 }

/**
 * Re-parse a GLB we just wrote and assert it is actually well formed.
 *
 * Everything here has burned somebody: a JSON chunk padded with NULs that Babylon
 * accepts and three.js rejects, an accessor whose min/max was computed before a
 * transform was baked (models load, then get frustum-culled at the wrong moment
 * and flicker), an index that overruns its vertex array (a GPU hang on Adreno,
 * not an exception).
 */
export function validateGLB(buf, { expectedNodeNames, maxMeshNodes, maxTriangles } = {}) {
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error('bad magic')
  if (buf.readUInt32LE(4) !== 2) throw new Error('not glTF 2.0')
  if (buf.readUInt32LE(8) !== buf.length) throw new Error('header length disagrees with the file')

  const jsonLen = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== JSON_CHUNK) throw new Error('first chunk is not JSON')
  if (jsonLen % 4) throw new Error('JSON chunk is not 4-byte aligned')
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

  const binOff = 20 + jsonLen
  const binLen = buf.readUInt32LE(binOff)
  if (buf.readUInt32LE(binOff + 4) !== BIN_CHUNK) throw new Error('second chunk is not BIN')
  if (binLen % 4) throw new Error('BIN chunk is not 4-byte aligned')
  const bin = buf.subarray(binOff + 8, binOff + 8 + binLen)
  if (bin.length !== binLen) throw new Error('BIN chunk is truncated')
  if (json.buffers[0].byteLength !== binLen) throw new Error('buffer.byteLength disagrees with the BIN chunk')

  for (const [i, a] of json.accessors.entries()) {
    const view = json.bufferViews[a.bufferView]
    const cb = COMPONENT_BYTES[a.componentType]
    const comps = TYPE_COMPONENTS[a.type]
    const off = (a.byteOffset ?? 0) + view.byteOffset
    if (off % cb) throw new Error(`accessor ${i}: offset ${off} is not a multiple of ${cb}`)
    if (a.count * comps * cb > view.byteLength) throw new Error(`accessor ${i} overruns its bufferView`)
    // Copied out rather than viewed in place: node's Buffer.alloc can hand back a
    // slice of a shared pool whose byteOffset is not 4-aligned, and a typed-array
    // view onto that throws for reasons that have nothing to do with our file.
    const bytes = Uint8Array.prototype.slice.call(bin, off, off + a.count * comps * cb)
    const read =
      a.componentType === FLOAT
        ? new Float32Array(bytes.buffer)
        : a.componentType === USHORT
          ? new Uint16Array(bytes.buffer)
          : new Uint32Array(bytes.buffer)
    for (let k = 0; k < comps; k++) {
      let min = Infinity
      let max = -Infinity
      for (let e = k; e < read.length; e += comps) {
        if (read[e] < min) min = read[e]
        if (read[e] > max) max = read[e]
      }
      if (min !== a.min[k] || max !== a.max[k]) {
        throw new Error(`accessor ${i} component ${k}: stored min/max ${a.min[k]}/${a.max[k]} but data is ${min}/${max}`)
      }
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error(`accessor ${i}: NaN or Inf in the data`)
    }
  }

  let triangles = 0
  let meshNodes = 0
  for (const m of json.meshes) {
    for (const p of m.primitives) {
      const idx = json.accessors[p.indices]
      const pos = json.accessors[p.attributes.POSITION]
      if (idx.count % 3) throw new Error(`${m.name}: index count ${idx.count} is not a multiple of 3`)
      if (idx.max >= pos.count) throw new Error(`${m.name}: index ${idx.max} exceeds ${pos.count} vertices`)
      triangles += idx.count / 3
    }
  }

  // Acyclic, single-parent, and every node reachable from the scene.
  const seen = new Uint8Array(json.nodes.length)
  const parentOf = new Int32Array(json.nodes.length).fill(-1)
  json.nodes.forEach((n, i) => {
    for (const c of n.children ?? []) {
      if (parentOf[c] !== -1) throw new Error(`node ${c} has two parents`)
      parentOf[c] = i
    }
  })
  const walk = (i, depth) => {
    if (depth > 64) throw new Error('node tree deeper than 64 — probably a cycle')
    if (seen[i]) throw new Error(`node ${i} reached twice — the tree has a cycle`)
    seen[i] = 1
    if (json.nodes[i].mesh !== undefined) meshNodes++
    for (const c of json.nodes[i].children ?? []) walk(c, depth + 1)
  }
  for (const r of json.scenes[0].nodes) walk(r, 0)
  const orphan = [...seen].findIndex((v) => !v)
  if (orphan >= 0) throw new Error(`node ${orphan} (${json.nodes[orphan].name}) is not in the scene graph`)

  if (expectedNodeNames) {
    const got = new Set(json.nodes.map((n) => n.name))
    const missing = expectedNodeNames.filter((n) => !got.has(n))
    const extra = [...got].filter((n) => !expectedNodeNames.includes(n))
    if (missing.length || extra.length) {
      throw new Error(`node names differ from the URDF: missing ${missing.join(',') || 'none'}; extra ${extra.join(',') || 'none'}`)
    }
  }
  if (maxMeshNodes !== undefined && meshNodes > maxMeshNodes) {
    throw new Error(`${meshNodes} mesh nodes exceeds the ${maxMeshNodes} draw-call budget`)
  }
  if (maxTriangles !== undefined && triangles > maxTriangles) {
    throw new Error(`${triangles} triangles exceeds the ${maxTriangles} budget`)
  }

  return { triangles, meshNodes, nodes: json.nodes.length, bytes: buf.length, json }
}
