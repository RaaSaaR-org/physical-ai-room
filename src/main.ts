import '@fontsource-variable/dm-sans/index.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './style.css'
import {
  createIcons,
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  BrainCircuit,
  Check,
  CircleHelp,
  Cpu,
  Database,
  Eye,
  Headset,
  Lightbulb,
  MessageSquare,
  Mouse,
  Move3d,
  Orbit,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  Repeat,
  RotateCcw,
  Route,
  Scan,
  ScanLine,
  TriangleAlert,
  Video,
  X,
} from 'lucide'
const icons = {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  BrainCircuit,
  Check,
  CircleHelp,
  Cpu,
  Database,
  Eye,
  Headset,
  Lightbulb,
  MessageSquare,
  Mouse,
  Move3d,
  Orbit,
  Pause,
  Play,
  RadioTower,
  RefreshCw,
  Repeat,
  RotateCcw,
  Route,
  Scan,
  ScanLine,
  TriangleAlert,
  Video,
  X,
}
import { Room } from './room'
import { createDatasetExplorer } from './datasets'
import { base, frameAt, phaseAt, sources, stations, type Episode } from './data'
import { lesson, hardware } from './lessons'

const icon = (name: string) => `<i data-lucide="${name}"></i>`
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="topbar"><a class="brand" href="./" aria-label="EmAI Physical AI Room home"><span class="brand-symbol">e<span>.</span></span><b>EmAI</b><span class="brand-divider"></span><span class="brand-product">PHYSICAL AI ROOM</span></a><div class="top-actions"><span class="browser-status"><b></b> BROWSER EXPERIENCE</span><button class="quiet-button" id="datasets-button" aria-label="Discover datasets">${icon('database')}<span>Datasets</span></button><button class="quiet-button" id="sources-button">${icon('book-open')}<span>Field guide</span></button><button class="vr-button" id="vr-button">${icon('headset')}<span>Enter VR</span>${icon('arrow-up-right')}</button></div></header>
  <aside class="rail" aria-label="Room tools"><span class="rail-top">${icon('box')}</span><div class="rail-stations">${stations.map((s, i) => `<button class="rail-button ${i === 0 ? 'active' : ''}" data-station="${i}" aria-label="${s.name}" title="${s.name}">${icon(s.icon)}</button>`).join('')}</div><button class="rail-button" id="help-button" aria-label="Controls and accessibility" title="Controls and accessibility">${icon('circle-help')}</button><span class="rail-bottom">01—05</span></aside>
  <main>
    <div class="page-heading"><div><div class="breadcrumb">THE LEARNING LAB <span>/</span> UNITREE G1</div><h1>A small task.<br class="mobile-break"> A whole world of learning<span>.</span></h1><p>Follow an apple from human demonstration to robot intelligence.</p></div><button class="tour-button" id="tour-button">Take the guided tour ${icon('arrow-right')}</button></div>
    <nav class="station-tabs" aria-label="Learning stations"><button data-station="-1" class="station-tab active" aria-current="step"><span class="station-count">◎</span>Overview</button>${stations.map((s, i) => `<button data-station="${i}" class="station-tab ${i === 0 ? 'active' : ''}" ${i === 0 ? 'aria-current="step"' : ''}><span class="station-count">0${i + 1}</span>${s.name}${i < 4 ? '<span class="tab-connector">→</span>' : ''}</button>`).join('')}</nav>
    <section class="lab" aria-label="Robot demonstration and lesson">
      <div class="scene-column"><div class="viewport" id="viewport"><div class="scene-top"><span class="scene-title"><span class="status-dot"></span> DEMONSTRATION REPLAY</span><span class="scene-badge">G1 EDU <span>/</span> DEX3</span></div><div id="room-canvas"></div><div class="scene-caption"><span class="eyebrow">LEARNING CELL / 001</span><h2>The apple-to-plate task</h2><p>“Move the apple to the plate.”</p></div><button class="teleop-toggle" id="teleop-toggle" aria-pressed="false" hidden>${icon('headset')}<span>Human teleoperation</span><b>OFF</b></button><div class="camera-feed"><div class="camera-heading">${icon('video')} ROBOT’S VIEW <span>RGB</span></div><video id="episode-video" muted playsinline preload="auto" aria-label="Original NVIDIA episode 0 egocentric camera recording"><source src="${base}data/episode-000000.mp4" type="video/mp4"></video><div class="camera-footer">RECORDED <span>640 × 480 · 30 Hz</span></div></div><div class="view-tools"><button class="view-button active" id="orbit-view" aria-label="Orbit camera view" title="Orbit view">${icon('orbit')}</button><button class="view-button" id="front-view" aria-label="Front camera view" title="Front view">${icon('scan')}</button><button class="view-button" id="top-view" aria-label="Overhead camera view" title="Overhead view">${icon('arrow-down-to-line')}</button><button class="view-button" id="grasp-view" aria-label="Close-up grasp camera view" title="Grasp close-up">${icon('scan')}</button><span></span><button class="view-button" id="wireframe-button" aria-label="Toggle wireframe" aria-pressed="false" title="Wireframe">${icon('box')}</button><button class="view-button active" id="trail-button" aria-label="Toggle hand trajectory" aria-pressed="true" title="Hand trajectory">${icon('route')}</button></div><span class="orbit-hint">${icon('mouse')} DRAG TO ORBIT <span>·</span> SCROLL TO ZOOM</span><div class="loading" id="loading"><span class="loader"></span><strong>Assembling the learning cell</strong><span>Loading G1 + real demonstration</span></div><span class="reconstruction-label">Measured robot · illustrative operator & objects</span></div>
      <div class="playback"><div class="playback-heading"><span><b class="orange-dot"></b> EPISODE 000000 <span class="playback-dataset">/ NVIDIA AppleToPlate</span></span><span class="recording-tag">REAL DEMONSTRATION</span></div><div class="playback-controls"><button class="play-button" id="play-button" aria-label="Play demonstration" disabled>${icon('play')}</button><button class="restart-button" id="restart-button" aria-label="Restart demonstration" disabled>${icon('rotate-ccw')}</button><span class="timecode" id="timecode">00:00 <em>/ 00:19</em></span><div class="timeline"><input id="timeline" type="range" min="0" max="19.633333" step="any" value="0" aria-label="Demonstration time" disabled><div class="timeline-labels"><span>OBSERVE</span><span>REACH</span><span>GRASP</span><span>PLACE</span><span>RETURN</span></div></div><button id="speed-button" class="speed-button" aria-label="Playback speed">1×</button><button id="loop-button" class="restart-button" aria-label="Loop demonstration" aria-pressed="false">${icon('repeat')}</button></div></div></div>
      <aside class="lesson-sidebar"><div class="sidebar-header"><span class="eyebrow" id="lesson-kicker"></span><span class="station-indicator" id="station-indicator">01 / 05</span></div><h2 id="lesson-title"></h2><p id="lesson-description"></p><div class="observation-card"><div class="card-title">${icon('activity')} AT THIS MOMENT <span id="phase-badge">Observe</span></div><div class="observation-row"><span>Instruction</span><strong>Move the apple to the plate</strong></div><div class="observation-row"><span>Frame</span><strong id="frame-value">000 / 589</strong></div><div class="joint-readout"><span>LEFT ARM · MEASURED POSITION</span><div id="joint-bars"></div><div class="joint-key"><span>SHOULDER</span><span>ELBOW</span><span>WRIST</span></div></div><div class="signal-footer"><span><b></b> 43 joint channels</span><button id="inspect-frame">Inspect frame ↗</button></div></div><div class="insight"><span>${icon('lightbulb')} THE KEY IDEA</span><p id="key-idea"></p></div><button class="next-button" id="next-button">Inside a VLA ${icon('arrow-right')}</button><div class="sidebar-footer">Built around NVIDIA Isaac GR00T N1.7<br><button id="provenance-button">About this recording ↗</button></div></aside>
    </section>
    <section class="lesson-content" id="lesson-content" aria-label="Interactive learning station"></section>
    <footer class="page-footer"><span><b>EmAI</b> <span>Making physical AI tangible.</span></span><span>THREE.JS + WEBXR <span class="footer-dot">·</span> <button id="credits-button">Sources & credits ↗</button></span></footer>
  </main><div id="toast" role="status" aria-live="polite"></div>
  <dialog id="guide-dialog"><div class="dialog-top"><span class="eyebrow">THE FIELD GUIDE</span><button class="quiet-button" id="close-dialog" aria-label="Close field guide">${icon('x')}</button></div><div id="dialog-content"></div></dialog>
`
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!
// Keep the explanation and controls next to the scene they affect.
$('.lesson-sidebar').insertBefore($('#lesson-content'), $('.insight'))
$('.scene-column').append($('.observation-card'))
$('.lesson-sidebar').setAttribute('tabindex', '-1')
$('.lesson-sidebar').setAttribute('aria-labelledby', 'lesson-title')
const refreshIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.6 } })
let room: Room | null = null,
  episode: Episode | null = null,
  station = -1,
  t = 0,
  playing = false,
  speed = 1,
  loop = false,
  wireframe = false,
  trail = true,
  inferenceStep = 0,
  tour = false
let lastFrame = -1,
  lastVideoSync = -1
const video = $<HTMLVideoElement>('#episode-video')
const timeline = $<HTMLInputElement>('#timeline')
const keyIdeas = [
  'A demonstration is more than a video. Each frame pairs what the robot saw with its measured state and the action the human commanded.',
  'A VLA predicts movements, not a written plan. Robot state grounds visual and language understanding in the body that must act.',
  'Fine-tuning changes the model’s weights. Inference uses those weights. They are different workloads with different hardware needs.',
  'A policy does not blindly play a whole episode. It repeatedly observes the world and predicts the next actions.',
  'A plausible imagined future is not a guarantee. World action models still need feedback, real-world evaluation, and reliable control.',
]
function toast(message: string) {
  $('#toast').textContent = message
  $('#toast').classList.add('visible')
  window.setTimeout(() => $('#toast').classList.remove('visible'), 6500)
}
function dialog(content: string) {
  $('#dialog-content').innerHTML = content
  $<HTMLDialogElement>('#guide-dialog').showModal()
}
function guide() {
  dialog(
    `<h2>A real recording.<br>A visible learning process.</h2><p>This independent educational room follows NVIDIA’s GR00T N1.7 workflow. It runs entirely in your browser.</p><h3>What is real?</h3><p>Episode 0 from <strong>NVIDIA GR00T-N1.7-AppleToPlate</strong>: 590 samples, 30 Hz, 19.63 seconds, 43 measured joint positions and commanded targets, plus synchronized RGB video. The dataset contains 402 human demonstrations.</p><h3>What is reconstructed?</h3><p>The cyan operator uses a CC0 MakeHuman mesh and skeleton with a Quest 3-inspired headset, animated from robot motion. Human tracking was not captured in this episode. Signal paths explain teleoperation; this browser is not controlling hardware. The G1’s root stays fixed. Table, apple, and plate positions are reconstructed from the measured hand path and visual timing; the source has no object poses. The 3D scene has no contact physics. The training chart, inference diagram, and future trajectories are explanatory illustrations. No GR00T or DreamZero model runs here.</p><h3>Asset credits</h3><p>Human body: MakeHuman graphical assets (CC0), adapted as a skinned hologram. <a href="${base}licenses/human-operator.md" target="_blank" rel="noopener">Human model attribution ↗</a></p><p>G1 EDU / Dex3 geometry: Unitree Robotics, adapted from your robot-management-system, simplified with utilities from vr-headquarter. Robot joints remain articulated. NVIDIA data: CC BY 4.0; positions rounded to six decimals and video transcoded to H.264.</p><p><a href="${base}licenses/dataset-CC-BY-4.0.txt" target="_blank" rel="noopener">Dataset license ↗</a> · <a href="${base}licenses/unitree-g1.md" target="_blank" rel="noopener">Robot asset attribution ↗</a></p><h3>Read the primary sources</h3><div class="source-list">${sources.map(([text, url]) => `<a href="${url}" target="_blank" rel="noopener">${text}<span>↗</span></a>`).join('')}</div><p class="subtle">Sources checked September 12, 2026. NVIDIA’s “latest” course can change. Dataset revision: <code>${episode?.revision || 'loading'}</code>.</p>`,
  )
}
function setStation(n: number, reveal = true) {
  station = Math.max(-1, Math.min(4, n))
  const s =
    station === -1
      ? {
          kicker: 'START HERE / A REAL DEMONSTRATION',
          title: 'A robot, an apple, and a learned skill.',
          description:
            'Watch the G1 pick up an apple and place it on a plate. Then explore how people collect the experience that teaches a robot to act.',
        }
      : stations[station]
  document.querySelectorAll<HTMLElement>('[data-station]').forEach((el) => {
    const active = Number(el.dataset.station) === station
    el.classList.toggle('active', active)
    if (active) el.setAttribute('aria-current', 'step')
    else el.removeAttribute('aria-current')
  })
  document.body.dataset.station = String(station)
  $('#lesson-kicker').textContent = s.kicker
  $('#station-indicator').textContent = station === -1 ? 'OVERVIEW' : `0${station + 1} / 05`
  $('#lesson-title').textContent = s.title
  $('#lesson-description').textContent = s.description
  $('#key-idea').textContent =
    station === -1
      ? 'The orange robot follows measured joints from a real human demonstration. The apple and table are reconstructed to make the task visible.'
      : keyIdeas[station]
  $('#next-button').innerHTML =
    `${station === -1 ? 'How was this taught?' : station < 4 ? stations[station + 1].name : 'Back to overview'} ${icon('arrow-right')}`
  $('#lesson-content').innerHTML =
    station === -1
      ? `<div class="overview-guide"><button id="overview-play" class="overview-action">${icon('play')}<span>Watch the pick & place<small>19 seconds · real G1 recording</small></span></button><div class="reading-card"><span class="eyebrow">FOLLOW THE MOVEMENT</span><h3 id="overview-phase">First, observe the task.</h3><p>Scrub the timeline to inspect a moment. Use the grasp camera for a close-up of the fingers and apple.</p><button class="text-link" id="overview-grasp">Look closer at the grasp ↗</button></div><button class="overview-action secondary" id="overview-collect">${icon('headset')}<span>Where does the experience come from?<small>Explore teleoperation and data collection →</small></span></button><button class="text-link" id="overview-datasets">Open the dataset library ↗</button></div>`
      : lesson(station)
  bindLesson()
  room?.setStation(station)
  setTeleoperation(station === 0)
  $('#teleop-toggle').hidden = station !== 0
  $('.reconstruction-label').textContent =
    station === 0
      ? 'Measured robot · illustrative operator & objects'
      : 'Measured joints · reconstructed objects'
  $('.lesson-sidebar').scrollTop = 0
  if (reveal) {
    const target = window.innerWidth < 1000 ? $('.lesson-sidebar') : $('.station-tabs')
    if (window.innerWidth < 1000 || target.getBoundingClientRect().top < 0)
      target.scrollIntoView({ block: 'start', behavior: 'instant' })
    $('.lesson-sidebar').focus({ preventScroll: true })
    document
      .querySelector<HTMLElement>(`.station-tab[data-station="${station}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  refreshIcons()
  if (tour) $('#tour-button').innerHTML = `Tour · ${station + 1} of 5 ${icon('arrow-right')}`
}
function bindLesson() {
  document.querySelector<HTMLButtonElement>('#overview-play')?.addEventListener('click', () => {
    seek(0)
    setPlaying(true)
  })
  document
    .querySelector<HTMLButtonElement>('#overview-collect')
    ?.addEventListener('click', () => setStation(0))
  document
    .querySelector<HTMLButtonElement>('#overview-datasets')
    ?.addEventListener('click', () => openDatasets())
  document.querySelector<HTMLButtonElement>('#overview-grasp')?.addEventListener('click', () => {
    setPlaying(false)
    seek(8.5)
    $('#grasp-view').click()
    $('#viewport').scrollIntoView({ block: 'center' })
  })
  if (station === 0) room?.setTeleoperationStage(0)
  document.querySelector<HTMLButtonElement>('#watch-teleop')?.addEventListener('click', () => {
    setTeleoperation(true)
    seek(2.5)
    setPlaying(true)
    $('#viewport').scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
  document.querySelectorAll<HTMLButtonElement>('[data-teleop-stage]').forEach((button) => {
    button.onclick = () => {
      const stage = Number(button.dataset.teleopStage)
      setTeleoperation(true)
      room?.setTeleoperationStage(stage)
      document.querySelectorAll<HTMLButtonElement>('[data-teleop-stage]').forEach((b) => {
        b.classList.toggle('active', b === button)
        b.setAttribute('aria-pressed', String(b === button))
      })
      $('#teleop-explanation').textContent = [
        'The headset supplies head and hand poses. Hand tracking captures finger motion; the robot camera gives the operator a view of the task. The cyan avatar illustrates this input, reconstructed from the robot recording.',
        'Retargeting translates human wrist and finger motion into goals for a different body. Inverse kinematics and robot controllers account for its joints and limits. A five-fingered human hand is not a one-to-one copy of a three-fingered Dex3.',
        'Record synchronized camera images, measured robot states, and commanded action targets while the person guides the task. These demonstrations can later supervise a VLA. Here, the orange robot replays the real recording; the operator and signal paths explain the process.',
      ][stage]
    }
  })
  document
    .querySelector<HTMLButtonElement>('#discover-datasets')
    ?.addEventListener('click', openDatasets)
  const details = [
    'A demonstration pairs what the robot observes with the action a person commands. Repeat with varied apple positions, lighting, and approaches. The reference real-robot recipe asks for at least 200 episodes; quality and coverage matter as well as count.',
    'At each timestamp, store camera frames, measured joint positions (observation.state), and commanded joint targets (action). They are related but not identical: motors need time to reach a target. Keep timestamps aligned and reject dropped or corrupted recordings.',
    'Review complete episodes, attach the task instruction, and export to LeRobot. Videos carry images; Parquet carries numerical samples; metadata describes rates and modalities. Split by episode to avoid leaking near-identical neighboring frames into evaluation.',
  ]
  document.querySelectorAll<HTMLButtonElement>('[data-collect]').forEach(
    (el) =>
      (el.onclick = () => {
        document.querySelectorAll('[data-collect]').forEach((e) => e.classList.remove('selected'))
        el.classList.add('selected')
        $('#collect-detail').textContent = details[Number(el.dataset.collect)]
      }),
  )
  document.querySelectorAll<HTMLButtonElement>('[data-input]').forEach(
    (el) =>
      (el.onclick = () => {
        el.classList.toggle('active')
        el.setAttribute('aria-pressed', String(el.classList.contains('active')))
        el.querySelector('b')!.textContent = el.classList.contains('active') ? 'ON' : 'OFF'
        const off = [...document.querySelectorAll<HTMLElement>('[data-input]:not(.active)')].map(
          (e) => e.dataset.input,
        )
        const messages: Record<string, string> = {
          vision:
            'Without vision, the policy loses current visual evidence of the apple and plate.',
          language:
            'Without language, the requested goal is no longer specified through the instruction.',
          state:
            'Without state, the policy loses the joint configuration that grounds action in the robot’s body.',
        }
        $('#vla-explanation').textContent = off.length
          ? off.map((x) => messages[x!]).join(' ') +
            ' This is an information-flow illustration, not a measured ablation experiment.'
          : 'All inputs are present: scene, goal, and body state. The learned policy can use them together to generate an action chunk.'
      }),
  )
  document.querySelectorAll<HTMLButtonElement>('[data-hardware]').forEach(
    (el) =>
      (el.onclick = () => {
        document.querySelectorAll('[data-hardware]').forEach((e) => e.classList.remove('active'))
        el.classList.add('active')
        $('#hardware-detail').innerHTML = hardware[el.dataset.hardware as keyof typeof hardware]
      }),
  )
  if (station === 2) {
    $('#hardware-detail').innerHTML = hardware.train
    $<HTMLInputElement>('#train-steps').oninput = (e) => {
      const value = +(e.target as HTMLInputElement).value
      $('#steps-value').textContent = value.toLocaleString() + ' steps'
      $('#loss-point').setAttribute('cx', String((value / 10000) * 380))
      $('#loss-point').setAttribute('cy', String(8 + 66 * (1 - Math.exp(-value / 2300))))
    }
  }
  if (station === 3) {
    inferenceStep = 0
    $('#step-inference').onclick = () => {
      inferenceStep = (inferenceStep + 1) % 4
      document
        .querySelectorAll<HTMLElement>('[data-inference]')
        .forEach((el) =>
          el.classList.toggle('active', Number(el.dataset.inference) === inferenceStep),
        )
      $('#inference-detail').textContent = [
        'Observe: capture fresh RGB and joint states together with the task instruction. The actual robot loop uses new sensor data, rather than replaying this recorded episode.',
        'Predict: run the trained policy to produce an action chunk. The course configuration uses a 16-step prediction horizon; the execution schedule is determined by the deployment stack.',
        'Execute: issue the configured portion of the chunk to controllers. Manipulation targets and whole-body balance must be coordinated; the VLA is not a replacement for every motor controller.',
        'Observe again: measure what really happened, including any tracking error or changed object position. Predict a new chunk to close the feedback loop.',
      ][inferenceStep]
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-future]').forEach(
    (el) =>
      (el.onclick = () => {
        document.querySelectorAll('[data-future]').forEach((e) => e.classList.remove('active'))
        el.classList.add('active')
        room?.makeFutures(el.dataset.future === 'miss')
      }),
  )
}
function setPlaying(value: boolean) {
  if (!episode || !room?.ready) return
  if (value && t >= episode.duration) t = 0
  playing = value
  $('#play-button').innerHTML = icon(playing ? 'pause' : 'play')
  $('#play-button').setAttribute(
    'aria-label',
    playing ? 'Pause demonstration' : 'Play demonstration',
  )
  if (playing) {
    video.currentTime = t
    video.playbackRate = speed
    video
      .play()
      .catch(() =>
        toast('Camera playback could not start. The measured joint replay remains available.'),
      )
  } else video.pause()
  refreshIcons()
}
function seek(value: number) {
  if (!episode) return
  t = Math.max(0, Math.min(episode.duration, value))
  video.currentTime = t
  room?.update(t)
  updateReadout(true)
}
function timeText(seconds: number) {
  return `00:${Math.floor(seconds).toString().padStart(2, '0')}`
}
function updateReadout(force = false) {
  if (!episode) return
  const frame = frameAt(episode, t)
  timeline.value = String(t)
  timeline.style.setProperty('--progress', `${(t / episode.duration) * 100}%`)
  $('#timecode').innerHTML = `${timeText(t)} <em>/ ${timeText(episode.duration)}</em>`
  if (frame.index === lastFrame && !force) return
  lastFrame = frame.index
  $('#frame-value').textContent =
    `${String(frame.index).padStart(3, '0')} / ${episode.frames.length - 1}`
  $('#phase-badge').textContent = phaseAt(t)
  const reading = document.querySelector('#overview-phase')
  if (reading)
    reading.textContent = {
      Observe: 'First, observe the task.',
      Reach: 'Reach toward the apple.',
      Grasp: 'Close the fingers around the apple.',
      Transport: 'Carry the apple toward the plate.',
      Release: 'Open the fingers and set it down.',
      Return: 'The demonstration is complete.',
    }[phaseAt(t)]
  document.querySelectorAll<HTMLElement>('.joint-bar').forEach((el, i) => {
    const v = frame.a.q[15 + i]
    el.style.setProperty('--height', `${Math.min(100, 15 + Math.abs(v) * 45)}%`)
    el.title = `${episode!.jointNames[15 + i]}: ${v.toFixed(3)} rad`
    el.setAttribute('aria-label', el.title)
  })
}
$('#joint-bars').innerHTML = Array.from(
  { length: 7 },
  (_, i) => `<span class="joint-bar" style="--height:${25 + i * 7}%"><b></b></span>`,
).join('')
document
  .querySelectorAll<HTMLButtonElement>('[data-station]')
  .forEach((el) => (el.onclick = () => setStation(Number(el.dataset.station))))
$('#play-button').onclick = () => setPlaying(!playing)
$('#restart-button').onclick = () => seek(0)
timeline.oninput = () => seek(Number(timeline.value))
$('#speed-button').onclick = () => {
  speed = speed === 1 ? 0.5 : speed === 0.5 ? 2 : 1
  video.playbackRate = speed
  $('#speed-button').textContent = speed + '×'
}
$('#loop-button').onclick = () => {
  loop = !loop
  $('#loop-button').classList.toggle('active', loop)
  $('#loop-button').setAttribute('aria-pressed', String(loop))
}
$('#next-button').onclick = () => {
  if (tour && station === 4) {
    tour = false
    $('#tour-button').innerHTML = `Tour complete ${icon('check')}`
    toast('You’ve explored the full learning loop. Revisit any station to keep experimenting.')
  }
  setStation(station === 4 ? -1 : station + 1)
}
$('#tour-button').onclick = () => {
  tour = true
  setStation(0)
  toast('Guided tour started. Explore each station, then use the next-station button.')
  setPlaying(true)
}
for (const id of ['sources-button', 'provenance-button', 'credits-button'])
  $('#' + id).onclick = guide
$('#inspect-frame').onclick = () => {
  if (!episode) {
    toast('The recording is still loading.')
    return
  }
  setPlaying(false)
  const { a, index } = frameAt(episode, t)
  dialog(
    `<h2>Inside a real dataset entry.</h2><p>Episode 000000 · Frame ${index} · Timestamp ${a.t.toFixed(6)} s<br>Instruction: <strong>move the apple to the plate</strong></p><p>Measured position tells us where the joint was. The action target tells us where the controller was commanded to move it. These can differ. Values are in radians, displayed to four decimals.</p><div class="frame-table-wrap"><table class="frame-table"><thead><tr><th>Joint</th><th>Measured</th><th>Target</th></tr></thead><tbody>${episode.jointNames.map((name, i) => `<tr><td>${name.replace('_joint', '')}</td><td>${a.q[i].toFixed(4)}</td><td>${a.a[episode!.actionJointNames.indexOf(name)].toFixed(4)}</td></tr>`).join('')}</tbody></table></div><p class="subtle">Hand state and action arrays have different orders in the NVIDIA recorder. This table matches them by joint name. RGB comes from the synchronized video.</p><a class="text-link" href="${base}data/episode-000000.json" download="episode-000000.json">Download this episode as JSON ↓</a>`,
  )
}
$('#close-dialog').onclick = () => $<HTMLDialogElement>('#guide-dialog').close()
$('#guide-dialog').onclick = (e) => {
  if (e.target === $('#guide-dialog')) $<HTMLDialogElement>('#guide-dialog').close()
}
$('#help-button').onclick = () =>
  dialog(
    `<h2>Your way into the room.</h2><h3>Browser</h3><p>Drag the scene to orbit. Scroll or pinch to zoom. Camera buttons offer orbit, front, overhead, and grasp close-up views. Use the timeline to scrub the real recording.</p><p><kbd>Space</kbd> Play / pause · <kbd>←</kbd> <kbd>→</kbd> Seek one second · <kbd>0</kbd> Overview · <kbd>1</kbd>–<kbd>5</kbd> Change lesson · <kbd>R</kbd> Reset view. Shortcuts are inactive while editing controls or reading this dialog.</p><h3>Virtual reality</h3><p>Open the HTTPS site in a WebXR browser with a connected headset, then select Enter VR. The robot is life-sized. Point a controller ray and press the trigger to select a lesson or toggle playback. The headset’s system menu exits VR.</p><p>VR uses spatial lesson panels and the original camera video. Headset and controller behavior still needs device testing. All lessons are also available as readable browser content.</p>`,
  )
function setTeleoperation(visible: boolean) {
  visible = visible && station === 0
  room?.setTeleoperation(visible)
  $('#viewport').classList.toggle('teleop-visible', visible)
  $('#teleop-toggle').setAttribute('aria-pressed', String(visible))
  $('#teleop-toggle b').textContent = visible ? 'ON' : 'OFF'
  for (const view of ['orbit', 'front', 'top', 'grasp'])
    $('#' + view + '-view').classList.toggle('active', view === 'orbit')
}
$('#teleop-toggle').onclick = () =>
  setTeleoperation(!($('#teleop-toggle').getAttribute('aria-pressed') === 'true'))
for (const view of ['orbit', 'front', 'top', 'grasp'])
  $('#' + view + '-view').onclick = () => {
    room?.resetView(view)
    for (const v of ['orbit', 'front', 'top', 'grasp'])
      $('#' + v + '-view').classList.toggle('active', v === view)
  }
$('#wireframe-button').onclick = () => {
  wireframe = !wireframe
  room?.setHologram(wireframe)
  $('#wireframe-button').classList.toggle('active', wireframe)
  $('#wireframe-button').setAttribute('aria-pressed', String(wireframe))
}
$('#trail-button').onclick = () => {
  trail = !trail
  room?.setTrail(trail)
  $('#trail-button').classList.toggle('active', trail)
  $('#trail-button').setAttribute('aria-pressed', String(trail))
}
document.addEventListener('keydown', (e) => {
  if (
    (e.target as HTMLElement).closest('input,button,a,textarea,select') ||
    document.querySelector('dialog[open]')
  )
    return
  if (e.code === 'Space') {
    e.preventDefault()
    setPlaying(!playing)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    seek(t + 1)
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    seek(t - 1)
  } else if (e.key === '0') setStation(-1)
  else if (/^[1-5]$/.test(e.key)) setStation(+e.key - 1)
  else if (e.key.toLowerCase() === 'r') room?.resetView()
})
$('#vr-button').onclick = async () => {
  if (!room?.ready) {
    toast('The 3D room is still loading. Try again in a moment.')
    return
  }
  try {
    if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr'))) {
      dialog(
        '<h2>Visit from your headset.</h2><p>This browser does not currently support immersive VR. Open this site over HTTPS in a WebXR-capable headset browser, such as Meta Quest Browser, and choose Enter VR.</p><p>You can explore the complete learning room here with your mouse, keyboard, or touch screen.</p>',
      )
      return
    }
    await room.enterVR()
  } catch (e) {
    toast('Could not start VR: ' + (e instanceof Error ? e.message : String(e)))
  }
}
const openDatasets = createDatasetExplorer(() => setPlaying(false), seek)
$('#datasets-button').onclick = openDatasets
setStation(-1, false)
async function initialize() {
  try {
    room = new Room($('#room-canvas'), video)
    $('#room-canvas').addEventListener('room-error', (e) => toast((e as CustomEvent).detail))
    room.onStation = setStation
    room.onToggle = () => setPlaying(!playing)
    room.onXR = (active) => {
      document.body.classList.toggle('in-vr', active)
      if (active) setPlaying(true)
    }
    const response = await fetch(base + 'data/episode-000000.json')
    if (!response.ok) throw Error('Dataset download failed')
    episode = (await response.json()) as Episode
    const info = await room.load(episode)
    room.setStation(station)
    timeline.max = String(episode.duration)
    timeline.disabled = false
    $<HTMLButtonElement>('#play-button').disabled = false
    $<HTMLButtonElement>('#restart-button').disabled = false
    $('#loading').classList.add('loaded')
    setTimeout(() => $('#loading').remove(), 500)
    room.onTime = (dt) => {
      if (!episode) return
      if (playing) {
        t += dt * speed
        if (t >= episode.duration) {
          if (loop) {
            t = 0
            video.currentTime = 0
            void video.play().catch(() => {})
          } else {
            t = episode.duration
            setPlaying(false)
          }
        }
        if (Math.abs(video.currentTime - t) > 0.22 && Math.abs(t - lastVideoSync) > 0.5) {
          video.currentTime = t
          lastVideoSync = t
        }
      }
      room!.update(t)
      updateReadout()
    }
    room.update(0)
    updateReadout(true)
    // Read-only diagnostics used by browser tests and future recording integrations.
    Object.defineProperty(window, '__roomDebug', {
      value: () => ({
        ready: room!.ready,
        time: t,
        playing,
        station,
        frame: frameAt(episode!, t).index,
        videoTime: video.currentTime,
        joints: info.joints,
        teleoperator: room!.operator?.diagnostics(),
        apple: room!.apple.position.toArray(),
        pickup: info.pickup,
        destination: info.destination,
        tabletop: room!.tabletopHeight,
        handClearance: room!.handClearance(),
        graspContacts: room!.graspContacts(),
        tableIntersections: room!.tableIntersections(),
        appleHalfHeight: room!.appleHalfHeight,
        grip: room!.grip,
        release: room!.release,
        drawCalls: room!.renderer.info.render.calls,
        triangles: room!.renderer.info.render.triangles,
        jointRotations: room!.bindings.map((j) => ({
          column: j.column,
          relative: j.rest.clone().invert().multiply(j.node.quaternion).toArray(),
        })),
      }),
      configurable: true,
    })
  } catch (error) {
    console.error(error)
    $('#loading').innerHTML =
      `${icon('triangle-alert')}<strong>The 3D room could not load</strong><span>${error instanceof Error ? error.message : 'WebGL is unavailable'}</span><button class="small-button" id="retry-button">Reload room</button>`
    $('#retry-button').onclick = () => location.reload()
    refreshIcons()
    toast('The text lessons remain available below.')
  }
}
video.addEventListener('error', () =>
  toast(
    'The recorded camera video could not load. Joint playback and the lessons remain available.',
  ),
)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing && !room?.renderer.xr.isPresenting) setPlaying(false)
})
void initialize()
