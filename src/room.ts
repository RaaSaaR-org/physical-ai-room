import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js'
import type { HumanData } from './human'
import { Teleoperator } from './teleoperator'
import { base, frameAt, stations, type Episode } from './data'

interface Joint {
  name: string
  child: string
  axis: number[] | null
  type: string
}
interface Binding {
  node: THREE.Object3D
  rest: THREE.Quaternion
  axis: THREE.Vector3
  column: number
}
export class Room {
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(37, 1, 0.01, 60)
  controls: OrbitControls
  episode: Episode | null = null
  bindings: Binding[] = []
  robot = new THREE.Group()
  apple = new THREE.Group()
  private appleShadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  plate = new THREE.Group()
  table = new THREE.Group()
  future = new THREE.Group()
  trail = new THREE.Group()
  xrPanels = new THREE.Group()
  xrRig = new THREE.Group()
  raycaster = new THREE.Raycaster()
  interactive: THREE.Mesh[] = []
  holoMaterials: THREE.ShaderMaterial[] = []
  hand: THREE.Object3D | null = null
  // Scene calibration for this episode; preserve its measured joint motion.
  tabletopHeight = 0.78
  readonly appleRadius = 0.0345
  readonly appleHalfHeight = this.appleRadius * 0.94
  private graspOffset = new THREE.Vector3(0.0995, -0.0925, 0.009)
  private tableBounds = new THREE.Box3()
  private fingertipMeshes: THREE.Mesh[] = []
  pickup = new THREE.Vector3(0.22, 0.82, 0.5)
  destination = new THREE.Vector3(-0.03, 0.82, 0.5)
  grip = 6.6
  release = 10.4
  operator: Teleoperator | null = null
  teleoperationVisible = false
  ready = false
  station = -1
  onStation: (n: number) => void = () => {}
  onToggle: () => void = () => {}
  onTime: (dt: number) => void = () => {}
  onXR: (active: boolean) => void = () => {}
  private previous = 0
  private jointRotation = new THREE.Quaternion()
  private position = new THREE.Vector3()
  private resizeObserver: ResizeObserver
  private xrText: THREE.Mesh | null = null
  private home = new THREE.Vector3(1.9, 1.55, 2.5)
  constructor(
    private container: HTMLElement,
    private video: HTMLVideoElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
    this.renderer.setClearColor('#0d0d0f')
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.xr.enabled = true
    this.renderer.xr.setReferenceSpaceType('local-floor')
    container.appendChild(this.renderer.domElement)
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D hologram of Unitree G1 with Dex3 hands. Drag to orbit; scroll to zoom.',
    )
    this.renderer.domElement.setAttribute('role', 'img')
    this.scene.fog = new THREE.FogExp2('#0d0d0f', 0.085)
    this.camera.position.copy(this.home)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 0.72, 0.12)
    this.controls.enableDamping = true
    this.controls.minDistance = 1.1
    this.controls.maxDistance = 7
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.enablePan = false
    this.scene.add(new THREE.HemisphereLight('#f2d6c2', '#282736', 2))
    const light = new THREE.DirectionalLight('#ffb578', 3)
    light.position.set(2, 4, 3)
    this.scene.add(light)
    const fill = new THREE.DirectionalLight('#bccde3', 2)
    fill.position.set(-3, 2, -1)
    this.scene.add(fill)
    this.buildArchitecture()
    this.buildObjects()
    this.scene.add(
      this.robot,
      this.table,
      this.apple,
      this.plate,
      this.trail,
      this.future,
      this.xrRig,
      this.xrPanels,
    )
    this.xrRig.add(this.camera)
    this.xrPanels.visible = false
    this.setupXR()
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.renderer.setAnimationLoop((time) => {
      const dt = this.previous ? Math.min((time - this.previous) / 1000, 0.1) : 0
      this.previous = time
      if (!this.renderer.xr.isPresenting) this.controls.update()
      for (const material of this.holoMaterials)
        material.uniforms.uTime.value = window.matchMedia('(prefers-reduced-motion: reduce)')
          .matches
          ? 0
          : time / 1000
      this.onTime(dt)
      this.renderer.render(this.scene, this.camera)
    })
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      container.dispatchEvent(
        new CustomEvent('room-error', {
          detail: 'The graphics context was lost. Reload the room to restore 3D playback.',
        }),
      )
    })
  }
  resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (!w || !h) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }
  material(color: string, opacity = 1) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness: 0.5,
      transparent: opacity < 1,
      opacity,
    })
  }
  box(
    w: number,
    h: number,
    d: number,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
    opacity = 1,
  ) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.material(color, opacity))
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }
  line(points: THREE.Vector3[], color = '#ff6700', opacity = 0.5) {
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
    )
  }
  ring(radius: number, y: number, color: string, opacity = 0.5) {
    const p = Array.from(
      { length: 129 },
      (_, i) =>
        new THREE.Vector3(
          Math.cos((i / 128) * Math.PI * 2) * radius,
          y,
          Math.sin((i / 128) * Math.PI * 2) * radius,
        ),
    )
    return this.line(p, color, opacity)
  }
  text(text: string, width = 1024, height = 160, color = '#b8aaa0', size = 45) {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = color
    ctx.font = `500 ${size}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, width / 2, height / 2)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  label(text: string, position: THREE.Vector3, width = 0.8, color = '#b8aaa0') {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.text(text, 1024, 140, color),
        transparent: true,
        depthTest: false,
      }),
    )
    sprite.position.copy(position)
    sprite.scale.set(width, (width * 140) / 1024, 1)
    this.scene.add(sprite)
    return sprite
  }
  buildArchitecture() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 96),
      new THREE.MeshBasicMaterial({ color: '#111114' }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.065
    this.scene.add(floor)
    const grid = new THREE.GridHelper(30, 100, '#2b211b', '#202023')
    grid.position.y = -0.06
    this.scene.add(grid)
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.3, 0.07, 96),
      new THREE.MeshBasicMaterial({ color: '#181619' }),
    )
    plinth.position.y = -0.025
    this.scene.add(plinth)
    this.scene.add(
      this.ring(1.25, 0.014, '#ff6700', 0.8),
      this.ring(1.18, 0.016, '#63422b', 0.5),
      this.ring(1.5, -0.04, '#403329', 0.5),
      this.ring(3, -0.045, '#302b25', 0.4),
    )
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      this.scene.add(
        this.line(
          [
            new THREE.Vector3(Math.cos(a) * 1.26, 0.017, Math.sin(a) * 1.26),
            new THREE.Vector3(
              Math.cos(a) * (i % 4 === 0 ? 1.34 : 1.29),
              0.017,
              Math.sin(a) * (i % 4 === 0 ? 1.34 : 1.29),
            ),
          ],
          '#8b4a23',
          0.6,
        ),
      )
    }
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 2
      this.box(0.05, 3, 0.05, '#232326', x, 1.45, -3)
      this.box(1.95, 0.02, 0.03, '#2c2926', x, 2.85, -3)
      this.box(0.013, 1.1, 0.012, '#8a3c0f', x, 1.5, -2.968)
    }
    this.scene.add(this.ring(3.8, 3.1, '#5b3924', 0.35))
    const vertices = []
    for (let i = 0; i < 160; i++) {
      const a = i * 2.39996
      vertices.push(
        Math.cos(a) * (2 + (i % 7) * 0.6),
        0.3 + (i % 17) * 0.19,
        Math.sin(a) * (2 + (i % 7) * 0.6),
      )
    }
    const particles = new THREE.Points(
      new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.Float32BufferAttribute(vertices, 3),
      ),
      new THREE.PointsMaterial({ color: '#86634b', size: 0.009, transparent: true, opacity: 0.45 }),
    )
    this.scene.add(particles)
    this.label('G1 / DEX3-1', new THREE.Vector3(0.0, 1.65, -0.05), 0.67, '#d4b8a1')
    this.label('PHYSICAL AI  /  LEARNING CELL 01', new THREE.Vector3(0, 0.02, 1.32), 1, '#b06735')
  }
  buildObjects() {
    const shadowCanvas = document.createElement('canvas')
    shadowCanvas.width = shadowCanvas.height = 64
    const context = shadowCanvas.getContext('2d')!
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(0,0,0,0.8)')
    gradient.addColorStop(0.45, 'rgba(0,0,0,0.35)')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, 64, 64)
    this.appleShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.105, 0.105),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(shadowCanvas),
        transparent: true,
        depthWrite: false,
      }),
    )
    this.appleShadow.rotation.x = -Math.PI / 2
    this.scene.add(this.appleShadow)
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(this.appleRadius, 32, 24),
      new THREE.MeshStandardMaterial({
        color: '#ff4422',
        emissive: '#861800',
        emissiveIntensity: 0.35,
        roughness: 0.3,
      }),
    )
    body.scale.set(1, 0.94, 1)
    this.apple.add(body)
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.002, 0.003, 0.022, 7),
      this.material('#6c451f'),
    )
    stem.position.set(0.002, 0.039, 0)
    stem.rotation.z = -0.22
    this.apple.add(stem)
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 8), this.material('#75a146'))
    leaf.scale.set(1, 0.12, 0.5)
    leaf.position.set(0.009, 0.042, 0)
    this.apple.add(leaf)
    const dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.098, 0.085, 0.006, 64),
      this.material('#ddd6cd'),
    )
    this.plate.add(dish)
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.093, 0.004, 8, 64),
      this.material('#eee9e1'),
    )
    rim.rotation.x = Math.PI / 2
    rim.position.y = 0.004
    this.plate.add(rim)
  }
  hologram() {
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld; void main(){ vec4 p=modelViewMatrix*vec4(position,1.); vNormal=normalize(normalMatrix*normal); vView=-p.xyz; vWorld=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*p; }`,
      fragmentShader: `varying vec3 vNormal; varying vec3 vView; varying vec3 vWorld; uniform float uTime; void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.0);float light=max(dot(normalize(vNormal),normalize(vec3(.5,1.,1.))),0.);float scan=.5+.5*sin(vWorld.y*390.);float sweep=pow(.5+.5*sin(vWorld.y*8.-uTime*.8),24.);vec3 c=vec3(1.,.31,.045)*(.28+light*.40+rim*.75+sweep*.16);gl_FragColor=vec4(c,.77+rim*.22-scan*.08);}`,
    })
    this.holoMaterials.push(m)
    return m
  }
  async load(episode: Episode) {
    this.episode = episode
    const [gltf, rig] = await Promise.all([
      new GLTFLoader().loadAsync(base + 'models/g1-dex3.glb'),
      fetch(base + 'models/g1-rig.json').then((r) => {
        if (!r.ok) throw Error('Robot rig failed to load')
        return r.json() as Promise<{ joints: Joint[] }>
      }),
    ])
    const wrapper = new THREE.Group()
    wrapper.rotation.set(-Math.PI / 2, 0, 0)
    wrapper.add(gltf.scene)
    this.robot.rotation.y = -Math.PI / 2
    this.robot.position.set(0, 0.79, -0.22)
    this.robot.add(wrapper)
    const holo = this.hologram()
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: '#ff9b50',
      transparent: true,
      opacity: 0.16,
    })
    gltf.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.material = holo
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(node.geometry, 32),
          edgeMaterial,
        )
        node.add(edges)
      }
    })
    this.bindings = rig.joints
      .filter((j) => j.axis && episode.jointNames.includes(j.name))
      .map((j) => {
        const node = gltf.scene.getObjectByName(j.child)
        if (!node) throw Error('Missing joint ' + j.name)
        return {
          node,
          rest: node.quaternion.clone(),
          axis: new THREE.Vector3(...j.axis!),
          column: episode.jointNames.indexOf(j.name),
        }
      })
    if (this.bindings.length !== 43)
      throw Error(`Expected 43 joints; loaded ${this.bindings.length}`)
    this.hand = gltf.scene.getObjectByName('left_hand_palm_link')!
    this.pose(0)
    const feet = new THREE.Box3()
      .setFromObject(gltf.scene.getObjectByName('left_ankle_roll_link')!)
      .union(new THREE.Box3().setFromObject(gltf.scene.getObjectByName('right_ankle_roll_link')!))
    this.robot.position.y -= feet.min.y - 0.014
    this.robot.updateMatrixWorld(true)
    for (const name of ['left_ankle_roll_link', 'right_ankle_roll_link']) {
      const foot = gltf.scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3())
      const contact = new THREE.Mesh(
        new THREE.CircleGeometry(0.11, 32),
        new THREE.MeshBasicMaterial({
          color: '#000000',
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        }),
      )
      contact.rotation.x = -Math.PI / 2
      contact.scale.y = 1.6
      contact.position.set(foot.x, 0.016, foot.z)
      this.scene.add(contact)
    }
    // Fit the apple inside the recorded thumb/index/middle grasp, in palm-local
    // coordinates. Lowering its world Y independently would put it below the hand.
    this.pose(this.grip)
    this.handPoint(this.pickup)
    const tabletop = this.tabletopHeight
    this.pickup.y = tabletop + this.appleHalfHeight
    this.pose(this.release)
    this.handPoint(this.destination)
    this.destination.y = tabletop + 0.006 + this.appleHalfHeight
    // The idle right hand hangs beside the work surface. Keep the table edge
    // outside its swept volume instead of extending the surface through it.
    const width = 0.62
    const depth = 0.53
    const center = new THREE.Vector3(this.destination.x - 0.125 + width / 2, tabletop, 0.135)
    this.tableBounds.set(
      new THREE.Vector3(center.x - width / 2, tabletop - 0.026, center.z - depth / 2),
      new THREE.Vector3(center.x + width / 2, tabletop, center.z + depth / 2),
    )
    this.box(width, 0.026, depth, '#343033', center.x, tabletop - 0.013, center.z, this.table)
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, 0.026, depth)),
      new THREE.LineBasicMaterial({ color: '#ae7246', transparent: true, opacity: 0.7 }),
    )
    outline.position.set(center.x, tabletop - 0.013, center.z)
    this.table.add(outline)
    for (const x of [-width / 2 + 0.035, width / 2 - 0.035])
      for (const z of [-depth / 2 + 0.035, depth / 2 - 0.035])
        this.box(
          0.018,
          tabletop - 0.026,
          0.018,
          '#393438',
          center.x + x,
          (tabletop - 0.026) / 2,
          center.z + z,
          this.table,
        )
    this.plate.position.copy(this.destination)
    this.plate.position.y = tabletop + 0.003
    this.robot.traverse((node) => {
      if (
        node instanceof THREE.Mesh &&
        /^left_hand_(thumb_2|index_1|middle_1)_link_visual$/.test(node.name)
      )
        this.fingertipMeshes.push(node)
    })
    const points = []
    for (let t = 2.5; t <= 12; t += 0.16) {
      this.pose(t)
      points.push(this.handPoint(new THREE.Vector3()).clone())
    }
    this.trail.add(this.line(points, '#ffa866', 0.42))
    this.makeFutures()
    this.pose(0)
    const humanResponse = await fetch(base + 'models/operator-human.json')
    if (!humanResponse.ok) throw Error('Human model could not load')
    this.operator = new Teleoperator(this.robot, (await humanResponse.json()) as HumanData)
    this.operator.group.visible = this.teleoperationVisible
    this.scene.add(this.operator.group)
    this.resetView()
    this.ready = true
    return {
      joints: this.bindings.length,
      tabletop,
      pickup: this.pickup.toArray(),
      destination: this.destination.toArray(),
    }
  }
  handPoint(out: THREE.Vector3) {
    this.robot.updateMatrixWorld(true)
    return this.hand ? this.hand.localToWorld(out.copy(this.graspOffset)) : out.copy(this.pickup)
  }
  // Read-only mesh clearance for verifying the reconstructed table against replay poses.
  handClearance() {
    let lowest = Infinity
    const vertex = new THREE.Vector3()
    this.robot.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !/hand|wrist/.test(node.name)) return
      const positions = node.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld)
        if (
          vertex.x >= this.tableBounds.min.x &&
          vertex.x <= this.tableBounds.max.x &&
          vertex.z >= this.tableBounds.min.z &&
          vertex.z <= this.tableBounds.max.z
        )
          lowest = Math.min(lowest, vertex.y)
      }
    })
    return lowest - this.tabletopHeight
  }
  tableIntersections() {
    const collisions: string[] = []
    const bounds = new THREE.Box3()
    const triangle = new THREE.Triangle()
    this.robot.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox()
      bounds.copy(node.geometry.boundingBox!).applyMatrix4(node.matrixWorld)
      if (!bounds.intersectsBox(this.tableBounds)) return
      const positions = node.geometry.getAttribute('position')
      const index = node.geometry.index
      for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
        for (const [j, vertex] of [triangle.a, triangle.b, triangle.c].entries())
          vertex
            .fromBufferAttribute(positions, index ? index.getX(i + j) : i + j)
            .applyMatrix4(node.matrixWorld)
        if (this.tableBounds.intersectsTriangle(triangle)) {
          collisions.push(node.name)
          break
        }
      }
    })
    return collisions
  }
  // Nearest triangle distance in apple-normalized space: 1 means skin contact.
  // This verifies the actual finger surfaces, including triangle interiors.
  graspContacts() {
    const point = new THREE.Vector3()
    const triangle = new THREE.Triangle()
    const origin = new THREE.Vector3()
    const radii = new THREE.Vector3(this.appleRadius, this.appleHalfHeight, this.appleRadius)
    return this.fingertipMeshes.map((mesh) => {
      const positions = mesh.geometry.getAttribute('position')
      const index = mesh.geometry.index
      let nearest = Infinity
      for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
        for (const [j, vertex] of [triangle.a, triangle.b, triangle.c].entries())
          vertex
            .fromBufferAttribute(positions, index ? index.getX(i + j) : i + j)
            .applyMatrix4(mesh.matrixWorld)
            .sub(this.apple.position)
            .divide(radii)
        triangle.closestPointToPoint(origin, point)
        nearest = Math.min(nearest, point.length())
      }
      return { finger: mesh.name, surfaceGap: (nearest - 1) * this.appleRadius }
    })
  }
  pose(t: number) {
    if (!this.episode) return
    const { a, b, alpha } = frameAt(this.episode, t)
    for (const j of this.bindings) {
      const angle = THREE.MathUtils.lerp(a.q[j.column], b.q[j.column], alpha)
      j.node.quaternion.copy(j.rest).multiply(this.jointRotation.setFromAxisAngle(j.axis, angle))
    }
    this.robot.updateMatrixWorld(true)
  }
  update(t: number) {
    if (!this.ready) return
    this.pose(t)
    if (t < this.grip) this.apple.position.copy(this.pickup)
    else if (t < this.release) {
      this.handPoint(this.apple.position)
      this.apple.position.y = Math.max(
        this.apple.position.y,
        this.tabletopHeight + this.appleHalfHeight,
      )
    } else if (t < this.release + 0.25) {
      this.pose(this.release)
      this.handPoint(this.position)
      this.apple.position.lerpVectors(
        this.position,
        this.destination,
        Math.min(1, (t - this.release) / 0.25),
      )
      this.pose(t)
    } else this.apple.position.copy(this.destination)
    if (this.operator && this.episode) {
      const { a, b, alpha } = frameAt(this.episode, t)
      const column = this.episode.jointNames.indexOf('left_hand_index_1_joint')
      const curl = THREE.MathUtils.clamp(
        Math.abs(THREE.MathUtils.lerp(a.q[column], b.q[column], alpha)) / 0.72,
        0,
        1,
      )
      this.operator.update(t, curl)
    }
    if (this.appleShadow) {
      const overPlate =
        Math.hypot(
          this.apple.position.x - this.destination.x,
          this.apple.position.z - this.destination.z,
        ) < 0.075
      const surface = this.tabletopHeight + (overPlate ? 0.006 : 0)
      const height = Math.max(0, this.apple.position.y - this.appleHalfHeight - surface)
      this.appleShadow.position.set(this.apple.position.x, surface + 0.0004, this.apple.position.z)
      this.appleShadow.scale.setScalar(1 + height * 3)
      this.appleShadow.material.opacity = Math.exp(-height * 14)
    }
  }

  setStation(n: number) {
    this.station = n
    this.setTeleoperation(n === 0)
    this.future.visible = n === 4
    this.updateXRText()
    this.interactive.forEach((m) => {
      if (m.userData.station !== undefined)
        (m.material as THREE.MeshBasicMaterial).color.set(
          m.userData.station === n ? '#ffad78' : '#ffffff',
        )
    })
  }
  setHologram(enabled: boolean) {
    for (const m of this.holoMaterials) m.wireframe = enabled
  }
  setTrail(enabled: boolean) {
    this.trail.visible = enabled
  }
  setTeleoperation(visible: boolean) {
    this.teleoperationVisible = visible && this.station === 0
    visible = this.teleoperationVisible
    if (this.operator) this.operator.group.visible = visible
    this.resetView()
  }
  setTeleoperationStage(stage: number) {
    this.operator?.setStage(stage)
  }
  resetView(view = 'orbit') {
    if (this.renderer.xr.isPresenting) return
    if (view === 'grasp') {
      this.controls.minDistance = 0.3
      this.controls.target.copy(this.pickup).lerp(this.destination, 0.5)
      this.camera.position.copy(this.controls.target).add(new THREE.Vector3(0.48, 0.28, 0.65))
      this.controls.update()
      return
    }
    this.controls.minDistance = 1.1
    if (this.teleoperationVisible) {
      const portrait = this.camera.aspect < 1.15
      this.controls.target.set(-0.9, 0.88, 0.08)
      this.camera.position.copy(
        view === 'top'
          ? new THREE.Vector3(-0.9, portrait ? 6.5 : 4.5, 0.3)
          : new THREE.Vector3(view === 'front' ? -0.9 : -0.35, 1.7, portrait ? 6.5 : 4.35),
      )
      this.controls.update()
      return
    }
    this.camera.position.copy(
      view === 'front'
        ? new THREE.Vector3(0, 1.3, 3.5)
        : view === 'top'
          ? new THREE.Vector3(0.01, 3.8, 0.3)
          : this.home,
    )
    this.controls.target.set(0, 0.72, 0.12)
    this.controls.update()
  }
  makeFutures(miss = false) {
    for (const child of [...this.future.children]) {
      this.future.remove(child)
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    }
    const end = this.destination.clone()
    if (miss) end.add(new THREE.Vector3(0.24, -0.008, 0.1))
    const curve = new THREE.QuadraticBezierCurve3(
      this.pickup.clone(),
      this.pickup
        .clone()
        .lerp(end, 0.5)
        .add(new THREE.Vector3(0, 0.27, 0)),
      end,
    )
    this.future.add(this.line(curve.getPoints(50), miss ? '#ff5470' : '#a6bbff', 0.85))
    for (let i = 0; i < 5; i++) {
      const ghost = new THREE.Mesh(
        new THREE.SphereGeometry(0.039, 16, 12),
        new THREE.MeshBasicMaterial({
          color: miss ? '#ff5470' : '#a6bbff',
          wireframe: true,
          transparent: true,
          opacity: 0.22 + i * 0.12,
        }),
      )
      ghost.position.copy(curve.getPoint(i / 4))
      this.future.add(ghost)
    }
    this.future.visible = this.station === 4
  }
  panelTexture(n: number) {
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 900
    const x = c.getContext('2d')!
    x.fillStyle = '#151517'
    x.fillRect(0, 0, 1200, 900)
    x.strokeStyle = '#ff6700'
    x.lineWidth = 4
    x.strokeRect(2, 2, 1196, 896)
    x.fillStyle = '#ff8534'
    x.font = '30px monospace'
    x.fillText(stations[Math.max(0, n)].kicker, 65, 85)
    x.fillStyle = '#f2ece6'
    x.font = 'bold 57px sans-serif'
    x.fillText(stations[Math.max(0, n)].name, 65, 170)
    x.font = '34px sans-serif'
    let y = 265
    for (const line of stations[Math.max(0, n)].vr) {
      const words = line.split(' ')
      let s = ''
      for (const word of words) {
        if (x.measureText(s + word).width > 1040) {
          x.fillText(s, 65, y)
          y += 48
          s = ''
        }
        s += word + ' '
      }
      x.fillText(s, 65, y)
      y += 98
    }
    x.fillStyle = '#a49c95'
    x.font = '27px monospace'
    x.fillText('Point + trigger: select a station or replay', 65, 835)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }
  updateXRText() {
    if (this.xrText) {
      const material = this.xrText.material as THREE.MeshBasicMaterial
      material.map?.dispose()
      material.map = this.panelTexture(this.station)
    }
  }
  setupXR() {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 1.05),
      new THREE.MeshBasicMaterial({ map: this.panelTexture(0) }),
    )
    m.position.set(-3.1, 1.55, 0.1)
    m.rotation.y = 0.55
    this.xrPanels.add(m)
    this.xrText = m
    const videoTex = new THREE.VideoTexture(this.video)
    videoTex.colorSpace = THREE.SRGBColorSpace
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.88, 0.66),
      new THREE.MeshBasicMaterial({ map: videoTex }),
    )
    screen.position.set(1.35, 1.5, 0.1)
    screen.rotation.y = -0.45
    this.xrPanels.add(screen)
    for (let i = 0; i < 5; i++) {
      const button = new THREE.Mesh(
        new THREE.PlaneGeometry(0.44, 0.13),
        new THREE.MeshBasicMaterial({
          map: this.text(`${i + 1} ${stations[i].short}`, 1024, 220, '#ffad78', 70),
          transparent: true,
        }),
      )
      button.position.set((i - 2) * 0.47, 0.42, 1.1)
      button.rotation.x = -0.3
      button.userData.station = i
      this.xrPanels.add(button)
      this.interactive.push(button)
    }
    const play = new THREE.Mesh(
      new THREE.PlaneGeometry(0.65, 0.16),
      new THREE.MeshBasicMaterial({
        map: this.text('PLAY / PAUSE', 1024, 200, '#ffad78', 70),
        transparent: true,
      }),
    )
    play.position.set(0, 0.65, 1.1)
    play.userData.play = true
    this.xrPanels.add(play)
    this.interactive.push(play)
    const factory = new XRControllerModelFactory()
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i)
      this.xrRig.add(controller)
      const ray = this.line([new THREE.Vector3(), new THREE.Vector3(0, 0, -4)], '#ffb16a', 0.8)
      controller.add(ray)
      const grip = this.renderer.xr.getControllerGrip(i)
      grip.add(factory.createControllerModel(grip))
      this.xrRig.add(grip)
      controller.addEventListener('select', () => {
        const rotation = new THREE.Matrix4().extractRotation(controller.matrixWorld)
        this.raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld)
        this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(rotation)
        const hit = this.raycaster.intersectObjects(this.interactive, false)[0]
        if (hit) {
          if (hit.object.userData.play) this.onToggle()
          else this.onStation(hit.object.userData.station)
        }
      })
    }
    this.renderer.xr.addEventListener('sessionstart', () => {
      this.controls.enabled = false
      this.xrPanels.visible = true
      this.xrRig.position.set(0, 0, 2.1)
      this.onXR(true)
    })
    this.renderer.xr.addEventListener('sessionend', () => {
      this.xrRig.position.set(0, 0, 0)
      this.controls.enabled = true
      this.xrPanels.visible = false
      this.resetView()
      this.onXR(false)
    })
  }
  async enterVR() {
    const session = await navigator.xr!.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    })
    await this.renderer.xr.setSession(session)
  }
}
