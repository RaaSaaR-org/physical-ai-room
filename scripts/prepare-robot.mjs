// Asset utilities reused from EmAI vr-headquarter. All 43 actuated joints retained.
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { parseURDF, makeTransform, mat3ToQuat, bakeInto } from './lib/urdf.mjs'
import { readBinarySTL } from './lib/stl.mjs'
import { decimateToBudget } from './lib/decimate.mjs'
import { writeGLB, validateGLB } from './lib/glb.mjs'
const source = process.argv[2] || '../../robot-management-system/app/public/assets/robots/g1'
const urdf = parseURDF(path.join(source, 'g1_edu.urdf'))
const links = [...urdf.links.keys()]
const meshes = []
const nodes = links.map((name) => {
  const j = urdf.joints.find((j) => j.child === name)
  return {
    name,
    parent: j ? links.indexOf(j.parent) : null,
    translation: j?.xyz || [0, 0, 0],
    rotation: j ? mat3ToQuat(makeTransform(j.xyz, j.rpy).r) : [0, 0, 0, 1],
    mesh: null,
  }
})
for (const [name, link] of urdf.links) {
  for (const visual of link.visuals) {
    const raw = readBinarySTL(path.join(source, visual.mesh))
    bakeInto(raw.positions, makeTransform(visual.origin.xyz, visual.origin.rpy))
    const mesh = decimateToBudget(raw.positions, name.includes('hand') ? 1400 : 2400)
    nodes.push({ name: `${name}_visual`, parent: links.indexOf(name), mesh: meshes.length })
    meshes.push({ name, ...mesh })
  }
}
mkdirSync('public/models', { recursive: true })
const glb = writeGLB({
  nodes,
  meshes,
  generator: 'EmAI Physical AI Room / G1 EDU',
  extras: { source: 'Unitree G1 EDU via robot-management-system', frame: 'urdf-z-up' },
})
validateGLB(glb)
writeFileSync('public/models/g1-dex3.glb', glb)
writeFileSync(
  'public/models/g1-rig.json',
  JSON.stringify({ robot: urdf.name, frame: 'urdf-z-up', joints: urdf.joints }),
)
console.log(
  `${meshes.length} meshes, ${meshes.reduce((n, m) => n + m.indices.length / 3, 0)} triangles, ${(glb.length / 1e6).toFixed(2)} MB; 43 articulated joints`,
)
