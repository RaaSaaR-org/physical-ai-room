export interface Frame {
  t: number
  q: number[]
  a: number[]
}
export interface Episode {
  id: number
  fps: number
  duration: number
  dataset: string
  revision: string
  source: string
  jointNames: string[]
  actionJointNames: string[]
  frames: Frame[]
}
export const base = import.meta.env.BASE_URL
export const doc = 'https://docs.nvidia.com/learning/physical-ai/gr00t-e2e-workflow/latest/'
export const sources = [
  ['NVIDIA · End-to-end G1 workflow', doc],
  [
    'Dataset · AppleToPlate (CC BY 4.0)',
    'https://huggingface.co/datasets/nvidia/GR00T-N1.7-AppleToPlate',
  ],
  ['Hardware · Workflow prerequisites', doc + 'getting-started/prerequisites.html'],
  ['Recipe · Fine-tune GR00T 1.7', doc + 'real-robot-workflow/real-fine-tuning-and-leapp.html'],
  ['Deployment · GR00T on Jetson Thor', doc + 'real-robot-workflow/real-deployment.html'],
  ['Research · DreamZero world action model', 'https://dreamzero0.github.io/'],
  ['Paper · World Action Models are Zero-shot Policies', 'https://arxiv.org/abs/2602.15922'],
]
export const stations = [
  {
    id: 'collect',
    icon: 'scan-line',
    name: 'Collect data',
    short: 'Collect',
    title: 'Every skill starts with a demonstration.',
    description:
      'A person guides. The robot records. A dataset becomes the bridge between human intent and robot motion.',
    kicker: '01 / THE DEMONSTRATION',
    vr: [
      'A human guides the robot using XR teleoperation.',
      'Record camera images, joint states and action targets together.',
      'Review episodes, then convert MCAP or HDF5 into LeRobot.',
      'Vary positions and conditions; hold out episodes for evaluation.',
    ],
  },
  {
    id: 'understand',
    icon: 'brain-circuit',
    name: 'Inside a VLA',
    short: 'Understand',
    title: 'See the world. Understand the goal. Act.',
    description:
      'A vision-language-action model turns images, an instruction, and the robot’s own state into a sequence of actions.',
    kicker: '02 / INSIDE THE MODEL',
    vr: [
      'Vision: camera images describe the scene.',
      'Language: the instruction specifies the goal.',
      'Robot state: joint positions describe the current body.',
      'GR00T predicts an action chunk; execute a prefix and observe again.',
    ],
  },
  {
    id: 'train',
    icon: 'cpu',
    name: 'Train & fine-tune',
    short: 'Fine-tune',
    title: 'From general knowledge to a specific skill.',
    description:
      'Start with pretrained GR00T weights. Fine-tune on demonstrations from your robot, then evaluate on held-out situations.',
    kicker: '03 / THE LEARNING LOOP',
    vr: [
      'Pretraining builds broad knowledge across data and robots.',
      'Fine-tuning adapts that model to your task and embodiment.',
      'Plan for at least 48 GB VRAM using the course prerequisites.',
      'Evaluate task success; training loss alone is not enough.',
    ],
  },
  {
    id: 'deploy',
    icon: 'radio-tower',
    name: 'Run inference',
    short: 'Deploy',
    title: 'Learning ends. The feedback loop begins.',
    description:
      'At inference time, the policy uses what it learned to predict actions. New observations keep the robot connected to the real world.',
    kicker: '04 / CLOSED-LOOP CONTROL',
    vr: [
      'Camera + instruction + current state enter the policy.',
      'The policy predicts a short sequence of action targets.',
      'Controllers track targets and maintain whole-body balance.',
      'Observe again. On this workflow, deployment runs on Jetson Thor.',
    ],
  },
  {
    id: 'future',
    icon: 'orbit',
    name: 'Beyond VLAs',
    short: 'What’s next',
    title: 'What if a robot could imagine what happens next?',
    description:
      'World action models connect actions with predicted visual futures. A promising research direction, with plenty still to solve.',
    kicker: '05 / POSSIBLE FUTURES',
    vr: [
      'VLAs map vision, language and state to robot actions.',
      'DreamZero jointly predicts future video and actions.',
      'Predicted futures can be wrong; feedback remains essential.',
      'WAMs are a research direction, not a guaranteed replacement for VLAs.',
    ],
  },
]
export function frameAt(episode: Episode, t: number) {
  // Binary search timestamps rather than assuming every sensor sample is evenly spaced.
  let low = 0,
    high = episode.frames.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (episode.frames[mid].t <= t) low = mid
    else high = mid - 1
  }
  const a = episode.frames[low],
    b = episode.frames[Math.min(low + 1, episode.frames.length - 1)]
  const alpha = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0
  return { index: low, a, b, alpha }
}
export function phaseAt(t: number) {
  return t < 2.5
    ? 'Observe'
    : t < 6.2
      ? 'Reach'
      : t < 7.6
        ? 'Grasp'
        : t < 9.7
          ? 'Transport'
          : t < 11.6
            ? 'Release'
            : 'Return'
}
