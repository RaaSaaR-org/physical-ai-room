# EmAI Physical AI Room

A static Three.js / WebXR learning lab for the NVIDIA Isaac GR00T N1.7 workflow. Explore an articulated Unitree G1 EDU with Dex3-1 hands, replay a real apple-to-plate demonstration, and move through five interactive learning stations.

[Open the learning room](https://raasaar-org.github.io/physical-ai-room/) · [GitHub repository](https://github.com/RaaSaaR-org/physical-ai-room)

## Run locally

Requires Node.js 22.12+ (or a supported newer release).

```sh
npm ci
npm run dev
```

Vite prints the local URL. No backend, credentials, or GPU model server is needed. The robot, episode, camera video, and fonts are bundled with the site.

```sh
npm run build     # TypeScript validation + production assets in dist/
npm run preview   # Serve the production build
npx playwright install chromium
npm test          # Production browser tests under /physical-ai-room/
```

## What you can explore

- **Collect data:** XR teleoperation, synchronized observations and commands, review, and LeRobot export.
- **Inside a VLA:** toggle vision, language, and body-state inputs to understand their roles in action generation.
- **Train & fine-tune:** compare simulation, training, and edge hardware; inspect an example recipe and an illustrative optimization curve.
- **Run inference:** step through observe → predict → execute → observe again, including the roles of whole-body control and Jetson Thor.
- **Beyond VLAs:** compare action prediction with DreamZero-style joint video/action prediction. Explore illustrative success and missed-grasp trajectories.

The player supports pause, restart, scrubbing, 0.5× / 1× / 2× speed, optional looping, camera presets, wireframe, and a hand trajectory overlay. **Inspect frame** shows all 43 measured joint values alongside the corresponding action targets and provides an episode JSON download.

Keyboard: Space toggles playback, arrows seek one second, 1–5 select a station, R resets the camera. Input controls and dialogs retain their normal keyboard behavior. Playback starts only on user action; backgrounding the page pauses browser playback. Reduced-motion settings disable the ambient hologram sweep.

## Deploy to GitHub Pages

The included `.github/workflows/pages.yml` builds and deploys on pushes to `main` or manual workflow dispatch.

1. Put this project in a GitHub repository with a `main` branch.
2. In repository **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Push to `main`, or run **Deploy learning room** from the Actions tab.

The Vite base is `./`, so both `https://owner.github.io/repository/` and a custom-domain root work. Production tests use a strict static host at a nested repository path and reject missing asset requests. The live site is hosted at https://raasaar-org.github.io/physical-ai-room/ and updates automatically when changes are pushed to `main`.

## What is real, and what is illustrated?

**Real recording:** NVIDIA Corporation’s [GR00T-N1.7-AppleToPlate](https://huggingface.co/datasets/nvidia/GR00T-N1.7-AppleToPlate), episode `000000`, dataset revision `d89c126a713c6632432a607c12661546ff4d6ea9`. It contains 590 samples at 30 Hz, lasting 19.633333 seconds, with 43 measured joint positions, 43 action targets, the task instruction, and 640×480 RGB video. It is a human teleoperation demonstration, not an autonomous policy rollout.

- The hologram is driven by measured `observation.state` values, interpolated by timestamp. All 43 joints remain articulated.
- Joint ordering is checked against NVIDIA’s recorder configuration, pinned in `public/data/joint-layout.json`. **The hand state and hand action arrays have different orders.** The inspector maps targets to measured joints by name.
- The root transform is held fixed and grounded from the first pose because this episode does not provide a measured world-root pose.
- Apple, plate, and table positions are reconstructed from the measured hand trajectory and visual timing. The apple attaches to a palm offset during the annotated grasp interval and settles onto the plate after release. These object poses and phase labels are illustrative annotations, not measured ground truth.
- The 78 cm table is sized to the task workspace, keeping the idle hand beside its edge. The active hand has over 6 mm of tabletop clearance throughout the recording. A 69 mm apple is fitted between the measured thumb and fingers; it attaches at 6.6 s and releases at 10.4 s. The plate and apple rest on their support surfaces.
- Browser regression checks sample every recorded frame and every midpoint, test robot triangles against the tabletop volume, and check finger-to-apple surface distances. A grasp close-up camera and screenshots in `.cache/validated-*.png` make pickup, carry, release, and placement reviewable.
- There is no contact physics, Isaac Sim execution, robot control connection, or GR00T inference in the browser. This is a kinematic data replay and an educational room.
- The training curve, inference walkthrough, and WAM ghost paths are conceptual illustrations, not experimental results or model outputs.

The field guide inside the app repeats these distinctions and links directly to primary sources. Hardware is tied to the course’s September 12, 2026 documentation: prerequisites specify at least 48 GB training VRAM, while its fine-tuning page separately mentions 40 GB. The room uses the stricter planning guidance and exposes the discrepancy.

## Teleoperation scene

The cyan operator uses a continuous MakeHuman mesh, a fitted suit surface, and a detailed skeleton with skin weights. A procedural Quest 3-inspired headset sits over the modeled face. The body follows an illustrative inverse mapping of the recorded robot wrist motion; the dataset does not contain measured human tracking. Orange G1 joints still replay the original measured states without alteration. Cyan paths show commands through a retargeting node, violet shows camera feedback, and orange shows demonstration capture.

The app starts on **Overview**, with only the robot. The operator and its controls appear exclusively in **Collect data** and disappear when you leave that section. On desktop, the scene and readings share a single workspace; lesson controls stay inside the adjacent reading panel. On mobile, changing sections reveals the selected lesson, and navigation remains at the top. Live joint readouts sit directly below the replay controls.

Use **Watch teleoperation** in Collect data to play the demonstration, and the three stage buttons to explore tracking, retargeting, and recording. The existing grasp view focuses on the apple. No hardware is controlled. All assets are bundled locally for GitHub Pages.

Human source: MakeHuman graphical assets (CC0), pinned to revision `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`; see `public/licenses/human-operator.md`. Regenerate with `npm run prepare:human`. The export includes the body, fitted clothing helper surface, skeleton, and four normalized skin influences per vertex.

## Dataset explorer

Open **Datasets** in the header or **Discover datasets** in the collection lesson. Compare original AppleToPlate episodes 0, 1, and 2, scrub video and numerical frames, select any of the 43 joints, and compare measured positions with name-aligned action targets. The training view exposes up to 16 recorded target rows without crossing an episode boundary. A format guide explains video, Parquet, metadata, and the compact JSON teaching export.

The library also introduces NVIDIA’s [Arena simulation dataset](https://huggingface.co/datasets/nvidia/Arena-G1-Static-PickNPlace-Task), with links to its original data and workflow. That card is a source guide; its videos are not bundled. Episodes 1 and 2 use the same pinned AppleToPlate revision and attribution as episode 0. Their previews are 2D because the 3D object reconstruction is calibrated specifically for episode 0.

Regenerate an additional recording and thumbnail with `uv run --with pyarrow python scripts/prepare-episode.py --episode 1` (or `2`). Previews load on demand and work under a GitHub Pages path without requesting third-party assets.

## VR

Open the deployed **HTTPS** site in a WebXR-capable headset browser and select **Enter VR**. The robot remains in metre units. The VR scene includes a spatial lesson panel, recorded camera view, station buttons, and playback control. Point a controller ray and press its trigger to select. Exit through the headset system menu.

Browser tests cover unsupported VR behavior. **Physical headset rendering, controller targeting, comfort, and frame rate still require device testing.** The app uses Three.js’s controller model factory, which may download the controller profile/model when a device connects. Ordinary browser use makes no external asset requests.

## Assets and regeneration

Checked-in production assets are sufficient to build the app; the sibling repositories and Python are not needed for normal development or deployment.

To regenerate the robot from the local source project:

```sh
npm run prepare:robot
# Or pass a different folder containing g1_edu.urdf and meshes/:
node scripts/prepare-robot.mjs /path/to/g1
```

The converter uses asset utilities adapted from `../../vr-headquarter`, retains every joint, and simplifies the visual geometry to roughly 91,000 triangles / 2.94 MB. Its default source is `../../robot-management-system/app/public/assets/robots/g1`.

To re-extract the pinned real episode, install `uv` and `ffmpeg`, then run:

```sh
npm run prepare:episode
```

This downloads the pinned Parquet/video and metadata, validates joint ordering, rounds numerical values to six decimals, emits browser JSON, and transcodes the source AV1 video to H.264 for broader browser support. Source downloads stay in ignored `.cache/`. The JSON includes the original Parquet SHA-256 and dataset revision.

## Code map

| File                         | Responsibility                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `src/room.ts`                | Three.js room, articulated replay, reconstructed props, and WebXR interaction         |
| `src/main.ts`                | Browser UI, playback clock, video synchronization, frame inspector, and navigation    |
| `src/data.ts`                | Episode types, timestamp interpolation lookup, stations, and primary source links     |
| `src/lessons.ts`             | Interactive educational content and hardware comparisons                              |
| `src/style.css`              | Responsive EmAI visual design                                                         |
| `scripts/prepare-robot.mjs`  | G1 EDU URDF/STL conversion                                                            |
| `scripts/prepare-episode.py` | Pinned dataset extraction and video conversion                                        |
| `tests/room.spec.ts`         | Data integrity, real joint transforms, playback, lessons, mobile, and fallback checks |

## Attribution

- G1 EDU / Dex3 geometry: Unitree Robotics, sourced through the local robot-management-system. BSD 3-Clause notice in `public/licenses/unitree-g1.md`.
- Dataset: NVIDIA Corporation, **CC BY 4.0**. Attribution and modification details above; complete license in `public/licenses/dataset-CC-BY-4.0.txt`.
- Design and mesh preparation utilities: EmAI `vr-headquarter`.
- DM Sans and IBM Plex Mono: SIL Open Font License; notices in `public/licenses/`.
- Icons: Lucide, ISC. Three.js: MIT. Their dependency packages contain license notices.

This is an independent educational project, not an official NVIDIA or Unitree application.
