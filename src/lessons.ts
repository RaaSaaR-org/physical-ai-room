import { doc } from './data'
const link = (path: string, text: string) =>
  `<a class="text-link" href="${doc + path}" target="_blank" rel="noopener">${text} ↗</a>`
export function lesson(index: number) {
  switch (index) {
    case 0:
      return `
      <div class="lesson-heading"><div><span class="eyebrow">MAKE A DATASET</span><h2>Teach once. Capture everything.</h2></div><span class="subtle">Explore the learning pipeline</span></div>
      <div class="teleop-lesson"><div class="teleop-lesson-top"><div><span class="eyebrow">HUMAN IN THE LOOP</span><h3>Your movement. A different body.</h3><p>A human demonstrates the task through an XR headset. The robot’s experience becomes training data.</p></div><button class="small-button" id="watch-teleop"><i data-lucide="play"></i> Watch teleoperation</button></div>
      <div class="teleop-stages"><button data-teleop-stage="0" class="active" aria-pressed="true"><i data-lucide="headset"></i><span><b>01 / Track the human</b><small>Head + hands + fingers</small></span></button><span>→</span><button data-teleop-stage="1" aria-pressed="false"><i data-lucide="move-3d"></i><span><b>02 / Map to the robot</b><small>Retarget + solve + control</small></span></button><span>→</span><button data-teleop-stage="2" aria-pressed="false"><i data-lucide="database"></i><span><b>03 / Record the attempt</b><small>RGB + state + actions</small></span></button></div>
      <p id="teleop-explanation">The cyan operator wears a Quest 3-inspired headset. Its hands mirror the robot demonstration, while moving signals show commands going to the robot and camera feedback returning to the human. The human pose is illustrative; the robot joints come from the dataset.</p>
      <div class="teleop-key"><span>● Human / cyan</span><span>● Robot / orange</span><span>● Camera feedback / violet</span>${link('real-robot-workflow/real-teleop.html', 'Teleoperation workflow')}</div></div>
      <div class="collect-grid">
        <button class="step-card selected" data-collect="0"><span class="step-number">01</span><i data-lucide="headset"></i><h3>Guide the robot</h3><p>Use XR teleoperation to demonstrate the complete task.</p><span class="card-link">Human → robot <span>↗</span></span></button>
        <button class="step-card" data-collect="1"><span class="step-number">02</span><i data-lucide="video"></i><h3>Record in sync</h3><p>Capture images, measured joints, and commanded targets.</p><span class="card-link">30 samples / second <span>↗</span></span></button>
        <button class="step-card" data-collect="2"><span class="step-number">03</span><i data-lucide="database"></i><h3>Build the dataset</h3><p>Review demonstrations and convert them into LeRobot.</p><span class="card-link">Video + Parquet + metadata <span>↗</span></span></button>
      </div>
      <div class="explanation" id="collect-detail">A demonstration pairs what the robot observes with the action a person commands. Repeat with varied apple positions, lighting, and approaches. The reference real-robot recipe asks for at least 200 episodes; quality and coverage matter as well as count.</div>
      <div class="dataset-invitation"><div><span class="eyebrow">OPEN THE DATA LIBRARY</span><h3>What does a robot actually learn from?</h3><p>Browse real recordings. Scrub the images, inspect the signals, and unpack a training example.</p></div><button class="small-button" id="discover-datasets">Discover datasets <span>↗</span></button></div>
      <div class="lesson-foot">SIM: Isaac Teleop → HDF5 → LeRobot <span>REAL: Isaac Teleop → MCAP → LeRobot</span>${link('real-robot-workflow/real-fine-tuning-and-leapp.html', 'Open the recipe')}</div>`
    case 1:
      return `
      <div class="lesson-heading"><div><span class="eyebrow">VISION · LANGUAGE · ACTION</span><h2>Three inputs. One coordinated movement.</h2></div><span class="tag">Conceptual model</span></div>
      <div class="vla-flow"><div class="input-stack"><button data-input="vision" class="input-chip active"><i data-lucide="eye"></i><span>Vision <small>RGB camera frames</small></span><b>ON</b></button><button data-input="language" class="input-chip active"><i data-lucide="message-square"></i><span>Language <small>“Move the apple to the plate”</small></span><b>ON</b></button><button data-input="state" class="input-chip active"><i data-lucide="activity"></i><span>Robot state <small>43 measured joint positions</small></span><b>ON</b></button></div><span class="flow-arrow">→</span><div class="model-block"><span class="eyebrow">PRETRAINED VLA</span><strong>GR00T <em>N1.7</em></strong><p>Multimodal understanding<br>↓<br>Action generation</p></div><span class="flow-arrow">→</span><div class="output-block"><span class="eyebrow">ACTION CHUNK</span><div class="chunk-bars">${Array.from({ length: 16 }, (_, i) => `<b style="height:${22 + Math.sin(i * 0.6) * 13 + i * 2}px"></b>`).join('')}</div><p>16 future steps<br><small>Joint targets, not words</small></p></div></div>
      <div class="explanation" id="vla-explanation">Toggle an input to explore what information it contributes. GR00T combines visual and language features with robot state to generate actions. This diagram explains the information flow; it does not run the model.</div>
      <div class="lesson-foot">Train on demonstrations → predict action chunks → observe again ${link('real-robot-workflow/real-fine-tuning-and-leapp.html', 'Model configuration')}</div>`
    case 2:
      return `
      <div class="lesson-heading"><div><span class="eyebrow">BUILD YOUR TRAINING SETUP</span><h2>Adapt a foundation. Don’t start from zero.</h2></div><span class="tag">GR00T N1.7 · 3B</span></div>
      <div class="training-grid"><div><div class="segmented" id="hardware-tabs"><button data-hardware="sim">Simulation</button><button data-hardware="train" class="active">Fine-tuning</button><button data-hardware="edge">Inference</button></div><div id="hardware-detail" class="hardware-detail"></div></div><div class="training-process"><span class="eyebrow">THE OPTIMIZATION LOOP</span><div class="mini-flow"><span>Predict actions</span>→<span>Compare to demo</span>→<span>Update weights</span></div><label for="train-steps">Explore training progress <output id="steps-value">2,000 steps</output></label><input id="train-steps" type="range" min="0" max="10000" step="1000" value="2000"><svg id="loss-chart" viewBox="0 0 380 80" role="img" aria-label="Illustrative loss decreases as training progresses"><path d="M0 10H380 M0 40H380 M0 70H380" stroke="#303033"/><path d="M0 8 Q30 42 65 48 T130 60 T200 68 T300 72 T380 74" fill="none" stroke="#ff6700" stroke-width="2"/><circle id="loss-point" cx="76" cy="51" r="5" fill="#ff6700"/></svg><small>Illustrative loss, not a training run. Lower loss does not guarantee task success.</small></div></div>
      <div class="explanation">Validate timestamps and modality order → split by episode → fine-tune pretrained weights → evaluate success on unseen starts. The reference recipe uses 10,000 steps and a global batch size of 32 as starting values. Full pretraining is a much larger data and compute project.</div>
      <details class="recipe"><summary>Inspect the reference fine-tuning command</summary><p>Use the workflow’s pinned <code>gr00t_workflow_0.1</code> environment and generated modality configuration. Replace the dataset and output paths.</p><pre>uv run python gr00t/experiment/launch_finetune.py \
  --base-model-path nvidia/GR00T-N1.7-3B \
  --dataset-path ./lerobot_output \
  --embodiment-tag NEW_EMBODIMENT \
  --modality-config-path ./lerobot_output/new_embodiment_config_defaults.py \
  --num-gpus 1 --output-dir ./checkpoints \
  --max-steps 10000 --save-steps 2000 --global-batch-size 32</pre></details>
      <div class="lesson-foot">Course prerequisites: ≥48 GB VRAM. Fine-tuning page separately lists ≥40 GB; plan for the stricter guidance. ${link('getting-started/prerequisites.html', 'Hardware requirements')}</div>`
    case 3:
      return `
      <div class="lesson-heading"><div><span class="eyebrow">INFERENCE IS A FEEDBACK LOOP</span><h2>Observe. Predict. Execute. Repeat.</h2></div><button class="small-button" id="step-inference">Next control step <span>→</span></button></div>
      <div class="inference-flow">${[
        ['eye', '01', 'Observe', 'Camera + instruction + current joint state'],
        ['brain-circuit', '02', 'Predict', 'GR00T produces a short action chunk'],
        ['move-3d', '03', 'Execute', 'Track targets with robot controllers'],
        ['refresh-cw', '04', 'Observe again', 'Update from the world, then replan'],
      ]
        .map(
          ([icon, n, title, desc], i) =>
            `<div class="inference-node ${i === 0 ? 'active' : ''}" data-inference="${i}"><i data-lucide="${icon}"></i><span class="eyebrow">${n}</span><h3>${title}</h3><p>${desc}</p></div>`,
        )
        .join('')}</div>
      <div class="explanation" id="inference-detail">The model receives fresh observations. Inference uses learned weights; it does not update those weights on each control step. This interactive loop is an explanation, while the robot above replays a recorded human demonstration.</div>
      <div class="deploy-strip"><i data-lucide="cpu"></i><div><strong>Jetson AGX Thor</strong><span>GR00T policy + Isaac ROS + whole-body control</span></div><div><strong>Checkpoint → LEAPP → robot</strong><span>Evaluate success, timing, and recovery before deployment.</span></div></div>
      <div class="lesson-foot">Action prediction and low-level motor control run at different rates; the dataset’s 30 Hz is its recording rate. ${link('real-robot-workflow/real-deployment.html', 'Deployment workflow')}</div>`
    default:
      return `
      <div class="lesson-heading"><div><span class="eyebrow">WORLD ACTION MODELS</span><h2>Actions, with a picture of the future.</h2></div><span class="tag">Research frontier</span></div>
      <div class="future-grid"><div class="future-model"><span class="eyebrow">VLA · THE ACTION</span><h3>“What should I do?”</h3><div class="mini-flow"><span>Image + goal + state</span>→<span>Actions</span></div><p>A direct route from perception and instructions to control. Strong task performance depends on training coverage and evaluation.</p></div><div class="future-model highlighted"><span class="eyebrow">WAM · THE ACTION + ITS FUTURE</span><h3>“What happens as I do it?”</h3><div class="mini-flow"><span>Image + goal</span>→<span>Future video + actions</span></div><p>DreamZero jointly generates visual futures and actions, using a pretrained video model’s knowledge of how scenes change.</p></div></div>
      <div class="future-controls"><span>Explore an imagined outcome</span><div class="segmented"><button data-future="success" class="active">Apple on plate</button><button data-future="miss">Missed grasp</button></div><span class="subtle">Illustrative ghost trajectories in the room</span></div>
      <div class="explanation">Are VLAs the future? They are an important approach, not a settled final architecture. WAMs may improve generalization through video priors, but imagined futures can be inaccurate and expensive to generate. Robust contact, latency, long tasks, and recovery remain open challenges. These approaches can converge.</div>
      <div class="lesson-foot">The ghost paths are hand-authored explanations, not DreamZero outputs. <a class="text-link" href="https://dreamzero0.github.io/" target="_blank" rel="noopener">Explore DreamZero ↗</a></div>`
  }
}
export const hardware = {
  sim: `<span class="hardware-number">16 <small>GB VRAM</small></span><h3>RTX workstation for Isaac Sim</h3><p>The course lists RTX 4080 as minimum, 32 GB RAM, Ubuntu 22.04 / 24.04. Isaac Lab workloads can need more. RT cores are required; an A100 or H100 is not a rendering substitute.</p>`,
  train: `<span class="hardware-number">48+ <small>GB VRAM</small></span><h3>One GPU to begin fine-tuning</h3><p>Plan around an L40S or RTX 6000 Ada class GPU. The prerequisites recommend 8 GPUs for the real workflow at scale. Memory use varies with batch size and training configuration.</p>`,
  edge: `<span class="hardware-number">128 <small>GB unified memory</small></span><h3>Jetson AGX Thor at the robot</h3><p>The reference deployment uses Thor connected to the G1 over Ethernet. It runs the policy and control stack. This web room only needs a WebGL-capable browser.</p>`,
}
