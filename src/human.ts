import * as THREE from 'three'
interface HumanData {
  bones: { name: string; parent: number; head: number[]; tail: number[] }[]
  meshes: {
    name: string
    positions: number[]
    indices: number[]
    skinIndex: number[]
    skinWeight: number[]
  }[]
}
export class Human {
  group = new THREE.Group()
  bones: THREE.Bone[]
  private rest = new Map<THREE.Bone, THREE.Quaternion>()
  constructor(data: HumanData) {
    this.bones = data.bones.map((b) => {
      const bone = new THREE.Bone()
      bone.name = b.name
      bone.position.fromArray(b.head)
      if (b.parent >= 0) bone.position.sub(new THREE.Vector3(...data.bones[b.parent].head))
      return bone
    })
    data.bones.forEach((b, i) => {
      ;(b.parent < 0 ? this.group : this.bones[b.parent]).add(this.bones[i])
      this.rest.set(this.bones[i], this.bones[i].quaternion.clone())
    })
    this.group.updateMatrixWorld(true)
    const skeleton = new THREE.Skeleton(this.bones)
    for (const m of data.meshes) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3))
      geometry.setIndex(m.indices)
      geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.skinIndex, 4))
      geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(m.skinWeight, 4))
      geometry.computeVertexNormals()
      const material = new THREE.MeshStandardMaterial({
        color: m.name.includes('suit') ? '#298f91' : '#61cdd5',
        emissive: '#083b3f',
        emissiveIntensity: 0.3,
        roughness: 0.83,
        metalness: 0.05,
      })
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          '#include <dithering_fragment>\n gl_FragColor.rgb *= .94 + .06 * sin(gl_FragCoord.y * 1.5);',
        )
      }
      const mesh = new THREE.SkinnedMesh(geometry, material)
      mesh.name = m.name
      this.group.add(mesh)
      mesh.bind(skeleton)
      mesh.frustumCulled = false
    }
  }
  bone(name: string) {
    return this.bones.find((b) => b.name === name)!
  }
  pose(side: string, wrist: THREE.Vector3, closure: number) {
    const upper = this.bone(`upperarm01.${side}`),
      lower = this.bone(`lowerarm01.${side}`),
      hand = this.bone(`wrist.${side}`)
    upper.quaternion.identity()
    lower.quaternion.identity()
    hand.quaternion.identity()
    this.group.updateMatrixWorld(true)
    const shoulder = upper.getWorldPosition(new THREE.Vector3()),
      elbow = lower.getWorldPosition(new THREE.Vector3()),
      palm = hand.getWorldPosition(new THREE.Vector3())
    const a = shoulder.distanceTo(elbow),
      b = elbow.distanceTo(palm),
      direction = wrist.clone().sub(shoulder)
    const distance = THREE.MathUtils.clamp(
      direction.length(),
      Math.abs(a - b) + 0.005,
      a + b - 0.004,
    )
    direction.normalize()
    const end = shoulder.clone().addScaledVector(direction, distance),
      along = (a * a - b * b + distance * distance) / (2 * distance)
    const bend = new THREE.Vector3(side === 'L' ? 0.65 : -0.65, -0.8, -0.15)
    bend.addScaledVector(direction, -bend.dot(direction)).normalize()
    const joint = shoulder
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, a * a - along * along)))
    this.aim(upper, lower, joint)
    this.aim(lower, hand, end)
    for (let finger = 1; finger <= 5; finger++)
      for (let j = 1; j <= 3; j++) {
        const bone = this.bone(`finger${finger}-${j}.${side}`)
        if (bone) {
          bone.quaternion.copy(this.rest.get(bone)!)
          bone.rotateX(closure * (finger === 1 ? 0.38 : 0.75))
        }
      }
    this.group.updateMatrixWorld(true)
    return { wrist: hand.getWorldPosition(new THREE.Vector3()), lengths: [a, b] }
  }
  private aim(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    const position = bone.getWorldPosition(new THREE.Vector3()),
      from = child.getWorldPosition(new THREE.Vector3()).sub(position).normalize(),
      to = target.clone().sub(position).normalize()
    const rotation = new THREE.Quaternion()
      .setFromUnitVectors(from, to)
      .multiply(bone.getWorldQuaternion(new THREE.Quaternion()))
    bone.quaternion.copy(
      bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rotation),
    )
    this.group.updateMatrixWorld(true)
  }
}
export type { HumanData }
