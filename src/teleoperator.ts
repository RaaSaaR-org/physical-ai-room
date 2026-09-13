import * as THREE from 'three'
import { Human, type HumanData } from './human'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

/** An explanatory human avatar, reconstructed from robot motion; not human tracking data. */
export class Teleoperator {
  group = new THREE.Group()
  body = new THREE.Group()
  headset = new THREE.Group()
  links = new THREE.Group()
  stage = 0
  private human: Human
  private robot: THREE.Group
  private tracked: { wrist: THREE.Vector3; lengths: number[] }[] = []
  private closure = 0
  private pulses: THREE.Mesh[] = []
  private paths: THREE.CatmullRomCurve3[] = []
  private lines: THREE.Line[] = []
  private head = new THREE.Group()
  private material: THREE.ShaderMaterial
  private cyan = new THREE.MeshStandardMaterial({
    color: '#7ee7e0',
    emissive: '#18ada8',
    emissiveIntensity: 0.4,
    roughness: 0.5,
  })
  private dark = new THREE.MeshStandardMaterial({ color: '#15272d', roughness: 0.6 })
  private temp = new THREE.Vector3()
  private target = new THREE.Vector3()
  private elbowPoint = new THREE.Vector3()
  private direction = new THREE.Vector3()
  private bend = new THREE.Vector3()
  private recorder = new THREE.Group()
  private robotCamera = new THREE.Vector3()
  private hubMesh: THREE.Mesh
  private hub = new THREE.Vector3(-0.95, 1.05, 0.5)
  constructor(robot: THREE.Group, data: HumanData) {
    this.robot = robot
    this.human = new Human(data)
    this.group.name = 'illustrative-teleoperator'
    this.body.position.set(-1.95, 0, 0)
    this.group.add(this.body, this.links)
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { time: { value: 0 } },
      vertexShader: `varying vec3 n; varying vec3 v; varying vec3 world; void main(){vec4 p=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);v=-p.xyz;world=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*p;}`,
      fragmentShader: `varying vec3 n;varying vec3 v;varying vec3 world;uniform float time;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.);float light=max(dot(normalize(n),normalize(vec3(-.5,1.,1.))),0.);float scan=.5+.5*sin(world.y*290.);vec3 c=vec3(.12,.77,.76)*(.24+.4*light+1.1*rim);gl_FragColor=vec4(c,.75+rim*.2-scan*.08);}`,
    })
    const pad = this.mesh(new THREE.CylinderGeometry(0.53, 0.57, 0.045, 64), this.dark, this.body)
    pad.position.y = -0.015
    for (const radius of [0.48, 0.54]) {
      const ring = this.mesh(new THREE.TorusGeometry(radius, 0.002, 6, 80), this.cyan, this.body)
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.009
    }
    this.body.add(this.human.group)
    this.head.position.set(0, 1.65, 0.034)
    this.body.add(this.head)
    this.buildHeadset()
    this.label('HUMAN / XR OPERATOR', new THREE.Vector3(-1.95, 1.96, 0), 1.15, '#99eee4')
    this.label('ILLUSTRATIVE TRACKING', new THREE.Vector3(-1.95, 0.05, 0.72), 1.0, '#679c9c')
    this.hubMesh = this.mesh(
      new THREE.OctahedronGeometry(0.085),
      new THREE.MeshBasicMaterial({ color: '#a5e7d8', wireframe: true }),
      this.links,
    )
    this.hubMesh.position.copy(this.hub)
    this.label('RETARGET', this.hub.clone().add(new THREE.Vector3(0, 0.16, 0)), 0.6, '#c2e7dd')
    const head = robot.getObjectByName('head_link')
    if (head) new THREE.Box3().setFromObject(head).getCenter(this.robotCamera)
    this.robotCamera.z += 0.06
    this.recorder.position.set(-0.85, 0.42, 0.65)
    this.links.add(this.recorder)
    for (let i = 0; i < 3; i++) {
      const page = this.mesh(
        new THREE.BoxGeometry(0.19, 0.012, 0.14),
        new THREE.MeshStandardMaterial({
          color: '#d9945b',
          emissive: '#b05c22',
          emissiveIntensity: 0.4,
          transparent: true,
          opacity: 0.7,
        }),
        this.recorder,
      )
      page.position.set(i * 0.018, i * 0.05, 0)
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(page.geometry),
        new THREE.LineBasicMaterial({ color: '#ffc18f' }),
      )
      page.add(outline)
    }
    this.label('DEMO CAPTURE', new THREE.Vector3(-0.8, 0.7, 0.65), 0.66, '#ebb283')
    this.label('RGB + STATE + ACTION', new THREE.Vector3(-0.85, 0.27, 0.75), 0.95, '#ebb283')
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Line(
        new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(new Float32Array(49 * 3), 3),
        ),
        new THREE.LineBasicMaterial({
          color: i === 2 ? '#a4a2ff' : i === 3 ? '#ffac64' : '#72dfcb',
          transparent: true,
          opacity: 0.5,
        }),
      )
      this.links.add(line)
      this.lines.push(line)
      this.paths.push(
        new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
      )
      for (let j = 0; j < 3; j++)
        this.pulses.push(
          this.mesh(
            new THREE.SphereGeometry(0.013, 8, 6),
            new THREE.MeshBasicMaterial({
              color: i === 2 ? '#c3bcff' : i === 3 ? '#ffc98f' : '#a3ffdf',
            }),
            this.links,
          ),
        )
    }
  }
  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) {
    const mesh = new THREE.Mesh(geometry, material)
    parent.add(mesh)
    return mesh
  }
  private ellipsoid(
    parent: THREE.Object3D,
    position: number[],
    scale: number[],
    material: THREE.Material = this.material,
  ) {
    const mesh = this.mesh(new THREE.SphereGeometry(1, 20, 14), material, parent)
    mesh.position.set(...(position as [number, number, number]))
    mesh.scale.set(...(scale as [number, number, number]))
    return mesh
  }
  private buildHeadset() {
    this.head.add(this.headset)
    const shell = new THREE.MeshStandardMaterial({
      color: '#e3f3f0',
      roughness: 0.35,
      metalness: 0.2,
    })
    // Quest 3-inspired three-pill faceplate, face cushion, side arms and head straps.
    this.ellipsoid(this.headset, [0, 0.014, 0.086], [0.119, 0.059, 0.058], this.dark)
    const faceplate = this.mesh(
      new RoundedBoxGeometry(0.23, 0.105, 0.072, 4, 0.026),
      shell,
      this.headset,
    )
    faceplate.position.set(0, 0.014, 0.12)
    for (const x of [-0.062, 0, 0.062]) {
      const sensor = this.mesh(
        new THREE.CapsuleGeometry(0.009, 0.03, 4, 12),
        this.dark,
        this.headset,
      )
      sensor.position.set(x, 0.015, 0.16)
      const lens = this.mesh(new THREE.SphereGeometry(0.004, 8, 6), this.cyan, this.headset)
      lens.position.set(x, 0.024, sensor.position.z + 0.007)
    }
    const strap = this.mesh(new THREE.TorusGeometry(0.102, 0.01, 6, 48), shell, this.headset)
    strap.rotation.x = Math.PI / 2
    strap.scale.z = 0.75
    strap.position.y = 0.026
    const top = this.mesh(new THREE.TorusGeometry(0.11, 0.009, 6, 40, Math.PI), shell, this.headset)
    top.rotation.y = Math.PI / 2
    top.position.y = 0.009
  }
  private label(text: string, position: THREE.Vector3, width: number, color: string) {
    const canvas = document.createElement('canvas')
    canvas.width = 768
    canvas.height = 80
    const context = canvas.getContext('2d')!
    context.font = '500 52px monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillStyle = color
    context.fillText(text, 384, 40, 720)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }),
    )
    sprite.position.copy(position)
    sprite.scale.set(width, (width * 80) / 768, 1)
    this.group.add(sprite)
  }
  setStage(stage: number) {
    this.stage = stage
    this.lines.forEach((line, index) => {
      ;(line.material as THREE.LineBasicMaterial).opacity =
        stage === 0 && index === 2
          ? 0.85
          : stage === 1 && index < 2
            ? 0.85
            : stage === 2 && index === 3
              ? 0.95
              : 0.25
    })
  }
  update(time: number, closure: number) {
    this.material.uniforms.time.value = time
    this.hubMesh.rotation.set(time * 0.15, time * 0.3, 0)
    this.hubMesh.scale.setScalar(this.stage === 1 ? 1.25 : 1)
    this.recorder.children.forEach((sheet, i) => {
      sheet.position.y = i * 0.05 + 0.008 * Math.sin(time * 3 - i)
    })
    this.closure = closure
    this.tracked = []
    for (const side of ['L', 'R']) {
      const wrist = this.robot.getObjectByName(`${side === 'L' ? 'left' : 'right'}_hand_palm_link`)
      if (!wrist) continue
      const end = wrist.getWorldPosition(new THREE.Vector3())
      const target = new THREE.Vector3(end.x * 1.05 - 1.95, end.y + 0.32, end.z + 0.35)
      const pose = this.human.pose(side, target, side === 'L' ? closure : 0.12)
      this.tracked.push(pose)
      const hub = this.hub.clone()
      hub.y += side === 'L' ? 0.035 : -0.035
      this.paths[side === 'L' ? 0 : 1].points = [pose.wrist, hub, end]
    }
    // Purple return path: the robot camera supplies the operator's view.
    this.paths[2].points = [
      this.robotCamera.clone(),
      new THREE.Vector3(-0.9, 1.8, -0.12),
      new THREE.Vector3(-1.95, 1.66, 0.14),
    ]
    this.paths[3].points = [
      new THREE.Vector3(0.02, 0.95, 0.12),
      new THREE.Vector3(-0.3, 0.74, 0.55),
      this.recorder.position.clone().add(new THREE.Vector3(0.03, 0.12, 0)),
    ]
    this.paths.forEach((path, i) => {
      const attribute = this.lines[i].geometry.getAttribute('position') as THREE.BufferAttribute
      for (let p = 0; p < 49; p++) {
        path.getPoint(p / 48, this.temp)
        attribute.setXYZ(p, this.temp.x, this.temp.y, this.temp.z)
      }
      attribute.needsUpdate = true
      this.lines[i].geometry.computeBoundingSphere()
      for (let j = 0; j < 3; j++)
        this.pulses[i * 3 + j].position.copy(path.getPoint((time * 0.45 + j / 3) % 1))
    })
  }
  diagnostics() {
    return {
      visible: this.group.visible,
      stage: this.stage,
      illustrative: true,
      body: 'skinned-human',
      wrists: this.tracked.map((p) => p.wrist.toArray()),
      armLengths: this.tracked.map((p) => p.lengths),
      fingerCurl: this.closure,
    }
  }
}
