import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
// MakeHuman graphical assets are CC0; pin source files for repeatable exports.
const revision = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482'
const source = `https://raw.githubusercontent.com/makehumancommunity/makehuman/${revision}/makehuman/data/`
mkdirSync('.cache', { recursive: true })
for (const [remote, local] of [
  ['3dobjs/base.obj', 'human-base.obj'],
  ['rigs/default.mhskel', 'human-rig.json'],
  ['rigs/default_weights.mhw', 'human-weights.json'],
]) {
  const response = await fetch(source + remote)
  if (!response.ok) throw Error(`Human asset failed to download: ${remote}`)
  writeFileSync('.cache/' + local, await response.text())
}
const vertices = [],
  groups = {}
let group = ''
for (const line of readFileSync('.cache/human-base.obj', 'utf8').split('\n')) {
  const parts = line.trim().split(/\s+/)
  if (parts[0] === 'v') vertices.push(parts.slice(1).map(Number))
  if (parts[0] === 'g') {
    group = parts[1]
    groups[group] ??= []
  }
  if (parts[0] === 'f') groups[group].push(parts.slice(1).map((p) => Number(p.split('/')[0]) - 1))
}
const rig = JSON.parse(readFileSync('.cache/human-rig.json')),
  weights = JSON.parse(readFileSync('.cache/human-weights.json')).weights
const scale = 1.75 / 16.7119,
  floor = -8.2206
const point = (indices) =>
  indices
    .reduce((a, i) => a.map((x, k) => x + vertices[i][k] / indices.length), [0, 0, 0])
    .map((x, k) => (x - (k === 1 ? floor : 0)) * scale)
const names = Object.keys(rig.bones)
const bones = names.map((name) => ({
  name,
  parent: names.indexOf(rig.bones[name].parent),
  head: point(rig.joints[rig.bones[name].head]),
  tail: point(rig.joints[rig.bones[name].tail]),
}))
const vertexWeights = {}
for (const [name, values] of Object.entries(weights))
  for (const [i, w] of values) (vertexWeights[i] ??= []).push([names.indexOf(name), w])
function mesh(faces) {
  const used = [...new Set(faces.flat())],
    remap = new Map(used.map((v, i) => [v, i]))
  const indices = []
  for (const f of faces)
    for (let j = 1; j < f.length - 1; j++)
      indices.push(remap.get(f[0]), remap.get(f[j]), remap.get(f[j + 1]))
  const skinIndex = [],
    skinWeight = []
  for (const i of used) {
    const values = (vertexWeights[i] ?? [[names.indexOf('root'), 1]])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
    const sum = values.reduce((s, v) => s + v[1], 0)
    for (let j = 0; j < 4; j++) {
      skinIndex.push(values[j]?.[0] ?? 0)
      skinWeight.push(+(values[j] ? values[j][1] / sum : 0).toFixed(6))
    }
  }
  return {
    positions: used.flatMap((i) => point([i]).map((x) => +x.toFixed(6))),
    indices,
    skinIndex,
    skinWeight,
  }
}
const exposed = groups.body.filter(
  (face) =>
    face.every((i) => vertices[i][1] > 5.5) || face.every((i) => Math.abs(vertices[i][0]) > 3.0),
)
const output = {
  source: 'MakeHuman hm08 basemesh, default skeleton and weights',
  license: 'CC0',
  revision,
  bones,
  meshes: [
    { name: 'Operator suit', ...mesh(groups['helper-tights']) },
    { name: 'Operator face and hands', ...mesh(exposed) },
  ],
}
writeFileSync('public/models/operator-human.json', JSON.stringify(output))
console.log(output.meshes.map((m) => [m.name, m.positions.length / 3, m.indices.length / 3]))
