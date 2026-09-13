"""Extract actual measured positions and commanded targets, never synthesize them.
Run: npm run prepare:episode. Original downloads are cached outside the build.
"""
import json, pathlib, urllib.request, hashlib, subprocess, argparse

parser = argparse.ArgumentParser()
parser.add_argument("--episode", type=int, default=0)
args = parser.parse_args()
episode_id = args.episode
episode_key = f"{episode_id:06d}"
import pyarrow.parquet as pq

root = pathlib.Path(__file__).resolve().parents[1]
cache = root / '.cache'
out = root / 'public/data'
cache.mkdir(exist_ok=True)
out.mkdir(exist_ok=True)
repo = 'nvidia/GR00T-N1.7-AppleToPlate'
revision = 'd89c126a713c6632432a607c12661546ff4d6ea9'
base = f'https://huggingface.co/datasets/{repo}/resolve/{revision}/'
def download(remote, destination):
    urllib.request.urlretrieve(base + remote, destination)

source = cache / f'episode_{episode_key}.parquet'
download(f'data/chunk-000/episode_{episode_key}.parquet', source)
for name in ['info.json', 'modality.json', 'tasks.jsonl']:
    download('meta/' + name, out / name)
table = pq.read_table(source).to_pydict()
legs = ['hip_pitch','hip_roll','hip_yaw','knee','ankle_pitch','ankle_roll']
arms = ['shoulder_pitch','shoulder_roll','shoulder_yaw','elbow','wrist_roll','wrist_pitch','wrist_yaw']
joints = [f'{side}_{joint}_joint' for side in ['left','right'] for joint in legs]
joints += ['waist_yaw_joint','waist_roll_joint','waist_pitch_joint']
joints += [f'{side}_{joint}_joint' for side in ['left','right'] for joint in arms]
for side, fingers in [('left',['thumb_0','thumb_1','thumb_2','middle_0','middle_1','index_0','index_1']),('right',['thumb_0','thumb_1','thumb_2','index_0','index_1','middle_0','middle_1'])]:
    joints += [f'{side}_hand_{finger}_joint' for finger in fingers]
frames = []
layout = json.loads((out / 'joint-layout.json').read_text())
groups = ['left_leg','right_leg','waist','left_arm','right_arm','left_hand','right_hand']
assert joints == [j for group in groups for j in layout['state'][group]], 'Measured state layout must match NVIDIA recorder'
action_joints = [j for group in groups for j in layout['action'][group]]
for i,t in enumerate(table['timestamp']):
    state, action = table['observation.state'][i],table['action'][i]
    assert len(state) == len(action) == len(joints) == 43
    frames.append({'t':round(t,6),'q':[round(float(x),6) for x in state], 'a':[round(float(x),6) for x in action]})
episode = {'id':episode_id, 'fps':30, 'dataset':repo, 'revision':revision, 'source':f'https://huggingface.co/datasets/{repo}', 'license':'CC-BY-4.0', 'attribution':'NVIDIA Corporation', 'parquetSha256':hashlib.sha256(source.read_bytes()).hexdigest(), 'jointNames':joints, 'actionJointNames':action_joints, 'jointLayoutSource':'joint-layout.json', 'frames':frames, 'duration':frames[-1]['t'], 'note':'Measured joints and commanded targets. Root fixed for visualization; table, plate and apple poses are illustrative reconstructions.'}
(out / f'episode-{episode_key}.json').write_text(json.dumps(episode,separators=(',',':')))
print(f'{len(frames)} frames, {frames[-1]["t"]:.2f}s, {revision}')

video_source = cache / f'episode_{episode_key}.mp4'
download(f'videos/chunk-000/observation.images.ego_view/episode_{episode_key}.mp4', video_source)
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(video_source),'-c:v','libx264','-crf','24','-pix_fmt','yuv420p','-movflags','+faststart','-an',str(out / f'episode-{episode_key}.mp4')],check=True)
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(out / f'episode-{episode_key}.mp4'),'-frames:v','1','-vf','scale=320:240','-update','1',str(out / f'episode-{episode_key}.jpg')],check=True)
