import { base, frameAt, type Episode } from './data'

const realSource = 'https://huggingface.co/datasets/nvidia/GR00T-N1.7-AppleToPlate'
const simSource = 'https://huggingface.co/datasets/nvidia/Arena-G1-Static-PickNPlace-Task'
const key = (id: number) => String(id).padStart(6, '0')
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const external = (href: string, label: string) =>
  `<a href="${href}" target="_blank" rel="noopener">${label} ↗</a>`

export function createDatasetExplorer(pauseRoom: () => void, replay: (time: number) => void) {
  const dialog = document.createElement('dialog')
  dialog.id = 'dataset-dialog'
  dialog.setAttribute('aria-labelledby', 'dataset-title')
  document.body.append(dialog)
  const cache = new Map<number, Episode>()
  let episode: Episode | null = null
  let selected = 0
  let frame = 0
  let column = 15
  let mode = 'signals'
  let request = 0
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    dialog.querySelector<T>(selector)!
  const close = () => {
    request++
    dialog.querySelector('video')?.pause()
  }
  dialog.addEventListener('close', close)
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })

  function shell() {
    dialog.innerHTML = `<div class="dataset-top"><div><span class="eyebrow">THE DATA LIBRARY</span><h2 id="dataset-title">Look inside a robot’s experience.</h2><p>A dataset contains many attempts. An episode is one attempt. A frame captures one moment.</p></div><button id="dataset-close" class="quiet-button" aria-label="Close dataset explorer">✕</button></div>
      <div class="dataset-catalog" aria-label="Choose a dataset">
        <button data-dataset="real" class="dataset-card active" aria-pressed="true"><span class="eyebrow">REAL ROBOT · LOCAL PREVIEWS</span><strong>Apple to plate</strong><span>NVIDIA GR00T N1.7 · G1 + Dex3</span><small>402 episodes · 30 Hz · LeRobot</small></button>
        <button data-dataset="sim" class="dataset-card" aria-pressed="false"><span class="eyebrow">SIMULATION · DATASET GUIDE</span><strong>Pick & place in Isaac Lab</strong><span>NVIDIA Arena · Unitree G1</span><small>HDF5 + LeRobot · source & format guide</small></button>
      </div><div id="dataset-body"></div>`
    $('#dataset-close').onclick = () => dialog.close()
    dialog.querySelectorAll<HTMLButtonElement>('[data-dataset]').forEach(
      (button) =>
        (button.onclick = () => {
          request++
          dialog.querySelector('video')?.pause()
          dialog.querySelectorAll<HTMLButtonElement>('[data-dataset]').forEach((b) => {
            b.classList.toggle('active', b === button)
            b.setAttribute('aria-pressed', String(b === button))
          })
          if (button.dataset.dataset === 'sim') simulation()
          else real()
        }),
    )
  }
  function simulation() {
    $('#dataset-body').innerHTML =
      `<div class="dataset-sim"><span class="eyebrow">A DIFFERENT PLACE TO COLLECT EXPERIENCE</span><h3>The same learning loop, inside a simulator.</h3><p>In Isaac Lab, a person teleoperates a virtual G1. The camera images are rendered and the joint states come from the simulated robot.</p>
      <div class="dataset-flow"><div><b>01 / Demonstrate</b><span>XR teleoperation in Isaac Lab</span></div><span>→</span><div><b>02 / Record</b><span>HDF5 trajectories</span></div><span>→</span><div><b>03 / Train</b><span>Convert to LeRobot for GR00T</span></div></div>
      <div class="dataset-comparison"><div><h4>What carries over?</h4><p>Images, instructions, measured states, and action targets still form the learning example. NVIDIA’s dataset card describes 200 manually collected demonstrations at 50 Hz.</p></div><div><h4>What changes?</h4><p>Rendered appearance and simulated contact differ from the real robot. Success in simulation needs evaluation on real hardware before claiming transfer.</p></div></div>
      <div class="dataset-note">This card is a guide to the source dataset. The playable samples in this app are real AppleToPlate recordings.</div>
      <div class="dataset-links">${external(simSource, 'Explore simulation dataset')}${external(simSource + '/tree/main', 'Browse source files')}${external('https://docs.nvidia.com/learning/physical-ai/gr00t-e2e-workflow/latest/resources/models-and-datasets.html', 'NVIDIA workflow')}</div></div>`
  }
  function real() {
    $('#dataset-body').innerHTML =
      `<div class="dataset-intro"><p><strong>One task, many demonstrations.</strong> Compare starting positions, timing, and hand motion across three original episodes.</p><span class="tag">3 previews / 402 episodes</span></div>
      <div class="episode-cards">${[0, 1, 2].map((id) => `<button data-episode="${id}" class="episode-card ${id === selected ? 'active' : ''}" aria-pressed="${id === selected}"><img src="${base}data/episode-${key(id)}.jpg" alt="Starting scene of episode ${id}" width="160" height="120"><span><b>Episode ${key(id)}</b><small>${['19.63 s · 590 frames', '17.80 s · 535 frames', '15.90 s · 478 frames'][id]}</small>${id === 0 ? '<em>Also in the 3D room</em>' : '<em>Camera + recorded signals</em>'}</span></button>`).join('')}</div>
      <div id="dataset-recording"></div>
      <div class="dataset-links">${external(realSource, 'Explore all 402 episodes')}<a href="${base}data/info.json" target="_blank" rel="noopener">Dataset metadata ↗</a></div>
      <p class="dataset-credit">NVIDIA Corporation · CC BY 4.0 · Pinned revision d89c126a713c6632432a607c12661546ff4d6ea9. Videos transcoded; numbers rounded to six decimals. Other episodes are previewed in 2D; the room’s object reconstruction is calibrated to episode 0.</p>`
    dialog.querySelectorAll<HTMLButtonElement>('[data-episode]').forEach(
      (button) =>
        (button.onclick = () => {
          void load(Number(button.dataset.episode))
        }),
    )
    void load(selected)
  }
  async function load(id: number) {
    const token = ++request
    selected = id
    episode = null
    dialog.querySelector('video')?.pause()
    dialog.querySelectorAll<HTMLButtonElement>('[data-episode]').forEach((button) => {
      button.classList.toggle('active', Number(button.dataset.episode) === id)
      button.setAttribute('aria-pressed', String(Number(button.dataset.episode) === id))
    })
    $('#dataset-recording').innerHTML =
      '<p class="dataset-loading" role="status">Opening recorded images and signals…</p>'
    try {
      let data = cache.get(id)
      if (!data) {
        const response = await fetch(`${base}data/episode-${key(id)}.json`)
        if (!response.ok) throw Error('Episode could not load.')
        data = (await response.json()) as Episode
        if (data.id !== id || !data.frames.length || data.jointNames.length !== 43)
          throw Error('Episode data is incomplete.')
        cache.set(id, data)
      }
      if (token !== request || !dialog.open) return
      episode = data
      frame = 0
      recording()
    } catch {
      if (token !== request || !dialog.open) return
      $('#dataset-recording').innerHTML =
        '<p role="alert">This episode could not load.</p><button class="small-button" id="dataset-retry">Retry episode</button>'
      $('#dataset-retry').onclick = () => {
        void load(id)
      }
    }
  }
  function recording() {
    const data = episode!
    $('#dataset-recording').innerHTML =
      `<div class="dataset-workbench"><div class="dataset-camera"><video id="dataset-video" controls muted playsinline preload="metadata" aria-label="Dataset episode ${selected} original camera video" src="${base}data/episode-${key(selected)}.mp4"></video><p id="dataset-video-error" hidden>Camera video is unavailable. You can still explore the recorded signals.</p><div class="dataset-transport"><button id="dataset-prev" aria-label="Previous dataset frame">←</button><output id="dataset-frame"></output><button id="dataset-next" aria-label="Next dataset frame">→</button></div><label class="sr-only" for="dataset-timeline">Dataset frame</label><input id="dataset-timeline" type="range" min="0" max="${data.frames.length - 1}" step="1" value="0"><p class="dataset-instruction"><span class="eyebrow">THE TASK / LANGUAGE INPUT</span>“Move the apple to the plate.”</p>${selected === 0 ? '<button class="small-button" id="dataset-replay">See this moment in the 3D room ↗</button>' : ''}</div>
      <div class="dataset-inspector"><div class="segmented dataset-modes" aria-label="Explore the data">${[
        ['signals', 'Signals'],
        ['training', 'Training sample'],
        ['files', 'Files & fields'],
      ]
        .map(
          ([id, label]) =>
            `<button data-explore="${id}" class="${mode === id ? 'active' : ''}" aria-pressed="${mode === id}">${label}</button>`,
        )
        .join('')}</div><div id="dataset-detail"></div></div></div>`
    const video = $<HTMLVideoElement>('#dataset-video')
    video.ontimeupdate = () => {
      if (!episode || video.seeking) return
      frame = frameAt(episode, video.currentTime + 0.00001).index
      update()
    }
    video.onseeked = () => {
      if (!episode) return
      frame = frameAt(episode, video.currentTime + 0.00001).index
      update()
    }
    video.onerror = () => {
      $('#dataset-video-error').hidden = false
    }
    $('#dataset-prev').onclick = () => seek(frame - 1)
    $('#dataset-next').onclick = () => seek(frame + 1)
    $('#dataset-timeline').oninput = (event) =>
      seek(Number((event.target as HTMLInputElement).value))
    dialog.querySelector<HTMLButtonElement>('#dataset-replay')?.addEventListener('click', () => {
      const time = episode!.frames[frame].t
      dialog.close()
      replay(time)
    })
    dialog.querySelectorAll<HTMLButtonElement>('[data-explore]').forEach(
      (button) =>
        (button.onclick = () => {
          mode = button.dataset.explore!
          dialog.querySelectorAll<HTMLButtonElement>('[data-explore]').forEach((b) => {
            b.classList.toggle('active', b === button)
            b.setAttribute('aria-pressed', String(b === button))
          })
          detail()
          update()
        }),
    )
    detail()
    update()
  }
  function seek(index: number) {
    if (!episode) return
    frame = Math.max(0, Math.min(episode.frames.length - 1, index))
    const video = $<HTMLVideoElement>('#dataset-video')
    video.pause()
    video.currentTime = episode.frames[frame].t
    update()
  }
  function detail() {
    if (!episode) return
    if (mode === 'files') {
      $('#dataset-detail').innerHTML =
        `<h3>A recording has several parts.</h3><div class="dataset-files"><details open><summary>videos/ → What the robot saw</summary><p>MP4 stores RGB images. A timestamp connects a video frame to a numerical row. The original image is 640 × 480 × 3 color channels.</p></details><details><summary>data/ → What the robot did</summary><p>Parquet stores time-indexed rows: <code>observation.state</code> contains 43 measured positions; <code>action</code> contains 43 commanded joint targets, in radians. The full source also contains effort and navigation commands.</p></details><details><summary>meta/ → How to read it</summary><p><code>info.json</code> describes shapes and rate. <code>tasks.jsonl</code> maps task indices to instructions. <code>modality.json</code> describes channel groups.</p></details></div><div class="dataset-note">A video alone is not an action-labeled robot demonstration. Training also needs synchronized control signals and their meaning.</div><a class="text-link" href="${base}data/episode-${key(selected)}.json" download>Download this episode’s extracted JSON ↓</a><p class="dataset-credit">The local JSON is a compact teaching export of timestamps, states, and targets. NVIDIA publishes the original numerical data as Parquet.</p>`
      return
    }
    $('#dataset-detail').innerHTML =
      `<label class="dataset-joint-label" for="dataset-joint">Explore a joint <select id="dataset-joint">${episode.jointNames.map((name, i) => `<option value="${i}" ${i === column ? 'selected' : ''}>${escape(name.replace('_joint', '').replaceAll('_', ' '))}</option>`).join('')}</select></label>${mode === 'signals' ? `<h3>Where it was. Where it was told to go.</h3><div class="dataset-values"><div><span>Measured position</span><strong id="dataset-state"></strong><small>observation.state</small></div><div><span>Commanded target</span><strong id="dataset-action"></strong><small>action</small></div></div><div id="dataset-chart"></div><div class="dataset-legend"><span>━ Measured</span><span>┄ Target</span><span>Radians · time in seconds</span></div><p>Motors take time to move. The target can lead the measured position. These are recorded human demonstration signals, not a VLA’s predictions.</p><p class="dataset-credit">Hand state and action arrays use different orders. This explorer matches them by joint name.</p>` : `<h3>One moment becomes a learning example.</h3><div class="dataset-sample-flow"><div><span class="eyebrow">INPUT AT THIS MOMENT</span><p>Camera image + task instruction + 43 measured joint positions</p></div><span>↓</span><div><span class="eyebrow">SUPERVISION FROM THE DEMONSTRATION</span><p>A sequence of recorded action targets starting at this frame</p></div></div><div id="dataset-chunk"></div><p id="dataset-chunk-note"></p><p class="dataset-credit">This teaching view uses up to 16 consecutive targets at 30 Hz. Real training uses its configured horizon, normalization, sampling, and padding. The targets below are data, not generated predictions.</p>`}`
    $('#dataset-joint').onchange = (event) => {
      column = Number((event.target as HTMLSelectElement).value)
      update()
    }
  }
  function update() {
    if (!episode || !dialog.open || !dialog.querySelector('#dataset-frame')) return
    const data = episode
    const f = data.frames[frame]
    $('#dataset-frame').textContent =
      `Frame ${frame} / ${data.frames.length - 1} · ${f.t.toFixed(3)} s`
    $<HTMLInputElement>('#dataset-timeline').value = String(frame)
    $<HTMLButtonElement>('#dataset-prev').disabled = frame === 0
    $<HTMLButtonElement>('#dataset-next').disabled = frame === data.frames.length - 1
    const actionColumn = data.actionJointNames.indexOf(data.jointNames[column])
    if (mode === 'signals') {
      $('#dataset-state').textContent = f.q[column].toFixed(4) + ' rad'
      $('#dataset-action').textContent = f.a[actionColumn].toFixed(4) + ' rad'
      const values = data.frames.flatMap((f) => [f.q[column], f.a[actionColumn]])
      const min = Math.min(...values) - 0.05,
        max = Math.max(...values) + 0.05
      const x = (t: number) => 38 + (t / data.duration) * 370
      const y = (value: number) => 116 - ((value - min) / (max - min)) * 100
      const path = (target: boolean) =>
        data.frames
          .map(
            (f, i) =>
              `${i ? 'L' : 'M'}${x(f.t).toFixed(1)},${y(target ? f.a[actionColumn] : f.q[column]).toFixed(1)}`,
          )
          .join(' ')
      $('#dataset-chart').innerHTML =
        `<svg viewBox="0 0 430 146" role="img" aria-label="Measured and target joint positions across episode ${selected}; cursor at ${f.t.toFixed(3)} seconds"><path d="M38 16V116H408" stroke="#4a4240" fill="none"/><text x="1" y="22">${max.toFixed(2)}</text><text x="1" y="116">${min.toFixed(2)}</text><text x="38" y="138">0 s</text><text x="370" y="138">${data.duration.toFixed(1)} s</text><path d="${path(false)}" fill="none" stroke="#ff873e" stroke-width="2"/><path d="${path(true)}" fill="none" stroke="#80d7ca" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M${x(f.t)} 12V120" stroke="#eee" opacity=".65"/><circle cx="${x(f.t)}" cy="${y(f.q[column])}" r="3.5" fill="#ff873e"/></svg>`
    } else if (mode === 'training') {
      const chunk = data.frames.slice(frame, frame + 16)
      $('#dataset-chunk').innerHTML =
        `<div class="dataset-chunk-grid" aria-label="Recorded action chunk">${chunk.map((f, i) => `<div><small>t${i ? `+${i}` : ''}</small><strong>${f.a[actionColumn].toFixed(3)}</strong></div>`).join('')}</div>`
      $('#dataset-chunk-note').textContent =
        `${chunk.length} of 16 target rows available · ${data.jointNames[column].replace('_joint', '').replaceAll('_', ' ')} · radians.${chunk.length < 16 ? ' Episode boundary: this preview stops here instead of inventing targets or crossing into another attempt.' : ' Each row has 43 joints; this view shows your selected joint.'}`
    }
  }
  return () => {
    pauseRoom()
    if (dialog.open) return
    shell()
    dialog.showModal()
    real()
  }
}
