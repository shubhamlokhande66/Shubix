"""The exported Reel, measured: is the file what the studio said it made?

    python3 analyze.py <media folder> <run.cjs OUT folder>

For every exported file of report.json:
  - what the file is (ffprobe): size, frame rate, length, sound
  - which clip each frame shows (each test clip is one colour: its hue names it), so where the picture really cuts
  - those cuts against the cuts the edit planned and against the song's true beats, in ms
  - the clips the creator gave that are really in the picture; whether the black part of clip 5 is
  - sound against picture: how far the song in the file is from where the edit put it
Nothing is assumed: what cannot be measured is said. Writes analysis.json and prints a summary.
"""
import json, os, subprocess, sys
import numpy as np

media_dir, out_dir = sys.argv[1], sys.argv[2]
report = json.load(open(os.path.join(out_dir, 'report.json')))
clips = report['media']['clips']
talk_clips = report['media'].get('talk', [])
W, H = 54, 96


def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], capture_output=True, text=True)
    j = json.loads(r.stdout or '{}')
    v = next((s for s in j.get('streams', []) if s.get('codec_type') == 'video'), None)
    a = next((s for s in j.get('streams', []) if s.get('codec_type') == 'audio'), None)
    fr = None
    if v and v.get('avg_frame_rate', '0/0') not in ('0/0', ''):
        n, d = v['avg_frame_rate'].split('/'); fr = float(n) / float(d) if float(d) else None
    return {'video': v and {'codec': v.get('codec_name'), 'width': v.get('width'), 'height': v.get('height'), 'fps': fr and round(fr, 3), 'frames': v.get('nb_frames')},
            'audio': a and {'codec': a.get('codec_name'), 'rate': a.get('sample_rate'), 'channels': a.get('channels')},
            'seconds': float(j.get('format', {}).get('duration', 0) or 0),
            'starts': {'video': v and v.get('start_time'), 'audio': a and a.get('start_time')}}


def frames_of(path, fps):
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-vf', f'fps={fps},scale={W}:{H}', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], capture_output=True)
    a = np.frombuffer(r.stdout, dtype=np.uint8)
    return a[:len(a) // (W * H * 3) * (W * H * 3)].reshape(-1, H, W, 3).astype(np.float32)


def hue_of(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1); d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm, gm, bm = m & (mx == r), m & (mx == g) & (mx != r), m & (mx == b) & (mx != r) & (mx != g)
    h[rm] = ((g - b)[rm] / d[rm]) % 6; h[gm] = (b - r)[gm] / d[gm] + 2; h[bm] = (r - g)[bm] / d[bm] + 4
    return h * 60, d / np.maximum(mx, 1e-6), mx / 255


def audio_of(path, rate=8000, start=None, dur=None):
    cmd = ['ffmpeg', '-loglevel', 'error'] + (['-ss', str(start)] if start else []) + ['-i', path] + (['-t', str(dur)] if dur else []) + ['-vn', '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, dtype=np.float32)


def nearest(sorted_times, t):
    a = np.asarray(sorted_times)
    return float(np.min(np.abs(a - t))) if len(a) else float('nan')


out = {'scenarios': []}
for sc in report['scenarios']:
    res = {'id': sc['id'], 'ok': sc.get('ok', False)}
    out['scenarios'].append(res)
    if not sc.get('exported'):
        res['note'] = 'no exported file: ' + str(sc.get('failure')); continue
    path = os.path.join(out_dir, sc['exported']['file'])
    made, edit = sc['made'], sc['made']['edit']
    t0 = edit[0]['start']; reel = edit[-1]['end'] - t0
    info = probe(path); res['file'] = info
    fps = info['video']['fps'] or 30
    res['length'] = {'planned': round(reel, 3), 'file': round(info['seconds'], 3), 'differenceMs': round((info['seconds'] - reel) * 1000)}

    # ---- which clip every frame shows
    is_talk = bool(sc.get('isTalk'))
    pool = talk_clips if is_talk else clips
    given = [next(c for c in pool if os.path.basename(c['file']) == s['name']) for s in made['sources']]      # the studio's clip order
    hues = np.array([c['hue'] for c in given])
    F = frames_of(path, fps)
    mid = F[:, H // 4:3 * H // 4, W // 4:3 * W // 4].reshape(len(F), -1, 3)
    med = np.median(mid, axis=1)                                   # the white box and the grain do not move a median
    h, s, v = hue_of(med)
    dist = np.abs((h[:, None] - hues[None, :] + 180) % 360 - 180)
    who = dist.argmin(1); far = dist.min(1)
    known = (s > 0.25) & (v > 0.15) & (far < 360 / len(clips) / 2 + 3)      # (the talking rooms are 44 degrees apart or more)
    who = np.where(known, who, -1)
    # a dissolve between two clips passes through colours that are neither's (and can look like a third clip's for a
    # frame or two): a clip counts where it holds for 4 frames or more, the rest is the way from one to the next
    k0 = 0
    for k in range(1, len(who) + 1):
        if k == len(who) or who[k] != who[k0]:
            if k - k0 < 4: who[k0:k] = -1
            k0 = k
    res['frames'] = {'count': int(len(F)), 'fps': fps, 'toldApart': round(float(known.mean()), 3), 'dark': int((v < 0.08).sum())}

    # ---- where the picture really cuts: the frame a new clip first shows
    cuts = []
    k = 1
    while k < len(who):
        if who[k] != who[k - 1] and who[k] >= 0:
            prev = next((who[j] for j in range(k - 1, -1, -1) if who[j] >= 0), -1)
            if prev != who[k] and prev >= 0:
                first_unknown = k
                while first_unknown - 1 >= 0 and who[first_unknown - 1] < 0: first_unknown -= 1
                # a run of frames between two clips that are neither (a dissolve, a flash): the cut is its middle
                cuts.append({'t': ((first_unknown + k) / 2) / fps, 'from': int(prev), 'to': int(who[k]), 'soft': k - first_unknown})
        k += 1
    planned = [{'t': e['start'] - t0, 'from': edit[i - 1]['src'], 'to': e['src'], 'tr': e['tr']} for i, e in enumerate(edit) if i > 0]
    seen_changes = [p for p in planned if p['from'] != p['to']]       # a cut inside one clip keeps its colour: not seen here
    errs, missed = [], []
    for p in seen_changes:
        cand = [c for c in cuts if c['to'] == p['to'] and abs(c['t'] - p['t']) < 0.35]
        if cand: errs.append({'at': round(p['t'], 3), 'tr': p['tr'], 'ms': round((min(cand, key=lambda c: abs(c['t'] - p['t']))['t'] - p['t']) * 1000, 1)})
        else: missed.append({'at': round(p['t'], 3), 'tr': p['tr'], 'to': p['to']})
    hard = [abs(e['ms']) for e in errs if e['tr'] == 'hard']
    allabs = [abs(e['ms']) for e in errs]
    stat = lambda a: None if not a else {'n': len(a), 'medianMs': round(float(np.median(a)), 1), 'worstMs': round(float(np.max(a)), 1), 'within1Frame': round(float(np.mean(np.array(a) <= 1000 / fps + 0.5)), 3)}
    extra = [{'at': round(c['t'], 3), 'from': c['from'], 'to': c['to'], 'soft': c['soft']} for c in cuts if not any(p['to'] == c['to'] and abs(c['t'] - p['t']) < 0.35 for p in seen_changes)]
    res['cuts'] = {'notPlanned': extra[:12], 'planned': len(planned), 'plannedBetweenClips': len(seen_changes), 'seenInFile': len(cuts), 'matched': len(errs), 'notFound': missed[:12],
                   'fileAgainstPlan': {'all': stat(allabs), 'hardCuts': stat(hard)}}

    # ---- the end of the file: which clip each of its last frames shows, and those frames as a picture in the log
    res['lastFrames'] = {'clips': [int(x) for x in who[-15:]], 'lastShotClip': edit[-1]['src']}
    if res['cuts']['notPlanned']:
        import base64
        t_at = max(0.0, min(c['at'] for c in res['cuts']['notPlanned'][-3:]) - 0.2)
        jpg = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{t_at:.3f}', '-i', path, '-frames:v', '16', '-vf', 'scale=120:-2,tile=16x1', '-q:v', '6', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-'], capture_output=True).stdout
        if jpg: print(f"SHOT {sc['id']}-frames-from-{t_at:.2f}s {base64.b64encode(jpg).decode()} END")

    if is_talk:
        # ---- the voice in the file against the clip it comes from, shot by shot: is the picture's sound its own, and when
        whole = audio_of(path)
        sync = []
        for e in edit[:14]:
            L = min(0.6, e['end'] - e['start'] - 0.1)
            if L < 0.25: continue
            src = audio_of(os.path.join(media_dir, given[e['src']]['file']), start=max(0.0, e['in'] + 0.05 - 0.2), dur=L + 0.4)      # 0.2 s either side to slide in
            a0 = int((e['start'] - t0 + 0.05) * 8000); x = whole[a0:a0 + int(L * 8000)]
            if len(x) < 1600 or len(src) < len(x): continue
            best, lag = -1.0, 0
            for d in range(0, len(src) - len(x) + 1, 8):                                  # 1 ms steps
                y = src[d:d + len(x)]; c = float(np.dot(x, y) / (np.sqrt(np.dot(x, x) * np.dot(y, y)) + 1e-12))
                if c > best: best, lag = c, d
            sync.append({'shot': edit.index(e), 'match': round(best, 2), 'voiceLateMs': round((1600 - lag) / 8)})
        good = [q for q in sync if q["match"] >= 0.4]
        res['voice'] = {'shotsMeasured': len(sync), 'shotsMatched': len(good), 'voiceLateMs': stat([abs(q['voiceLateMs']) for q in good]), 'medianSignedMs': round(float(np.median([q['voiceLateMs'] for q in good])), 1) if good else None,
                        'unmatched': [q for q in sync if q["match"] < 0.4][:6]}
        res['talk'] = sc.get('talk')
    else:
        # ---- the cuts in the file against the song's true beats (the whole point: a cut on the beat, in the file)
        name = sc.get('song') or {'A': 'four_floor_124', 'B': 'bhangra_dhol_98'}.get(sc['id'][0])
        truth = next(x['beats'] for x in report['media']['songs'] if x['name'] == name)
        sec = made['section'].get('start') or 0.0
        beats_in_reel = [b - sec - t0 for b in truth]
        file_cut_times = [c['t'] for c in cuts if c['soft'] <= 2 and any(p['to'] == c['to'] and abs(c['t'] - p['t']) < 0.35 for p in seen_changes)]   # the planned cuts, where the file has them
        # the studio cuts one frame before the beat on purpose (1/30 s): measured both as it is and with that taken off
        raw = [nearest(beats_in_reel, t) * 1000 for t in file_cut_times]
        lead = [nearest(beats_in_reel, t + 1 / 30) * 1000 for t in file_cut_times]
        res['beats'] = {'song': name, 'sectionStart': sec, 'hardCutsInFile': len(file_cut_times),
                        'cutToTrueBeat': stat(raw) and {**stat(raw), 'within40ms': round(float(np.mean(np.array(raw) <= 40)), 3)},
                        'cutPlusOneFrameToTrueBeat': stat(lead) and {**stat(lead), 'within40ms': round(float(np.mean(np.array(lead) <= 40)), 3)},
                        'studioBeatsToTruth': (lambda sb: stat([nearest(truth, b + sec) * 1000 for b in sb]) if sb else None)([b for b in made['beats'] if 0 <= b - t0 <= reel])}

    # ---- the clips really in the picture; the black part of clip 5
    shown = sorted(set(int(x) for x in who if x >= 0))
    res['clips'] = {'given': len(given), 'inTheEdit': len(set(e['src'] for e in edit)), 'inThePicture': len(shown),
                    'notInThePicture': [given[i]['file'] for i in range(len(given)) if i not in shown]}
    dark = [g for g in given if g.get('darkUntil')]
    if dark:
        di = given.index(dark[0])
        uses = [e for e in edit if e['src'] == di]
        res['darkPart'] = {'clip': dark[0]['file'], 'shotsFromIt': len(uses), 'shotsInItsBlackPart': sum(1 for e in uses if e['in'] < dark[0]['darkUntil'] - 0.05),
                           'blackFramesInFile': res['frames']['dark']}

    # ---- sound against picture: the song in the file against the song where the edit put it
    if is_talk:
        pass
    elif info['audio']:
        a = np.abs(audio_of(path)); b = np.abs(audio_of(os.path.join(media_dir, name + '.wav'), start=sec + t0, dur=reel))
        n = min(len(a), len(b)) // 8 * 8
        if n > 8000:
            ea, eb = a[:n].reshape(-1, 8).mean(1), b[:n].reshape(-1, 8).mean(1)        # 1 ms steps
            ea, eb = ea - ea.mean(), eb - eb.mean()
            lags = range(-300, 301)
            cc = [float(np.dot(ea[max(0, l):len(ea) + min(0, l)], eb[max(0, -l):len(eb) + min(0, -l)])) for l in lags]
            best = int(np.argmax(cc)); norm = float(np.sqrt(np.dot(ea, ea) * np.dot(eb, eb))) or 1.0
            res['sound'] = {'offsetMs': lags[best], 'match': round(cc[best] / norm, 3), 'note': 'positive: the song is late in the file'}
    else:
        res['sound'] = {'note': 'the file has no sound'}

json.dump(out, open(os.path.join(out_dir, 'analysis.json'), 'w'), indent=1)
for r in out['scenarios']:
    print('\n== ' + r['id'] + (' ' if r.get('file') else ' · ' + str(r.get('note'))))
    if not r.get('file'): continue
    f = r['file']; print('  stream starts:', json.dumps(f.get('starts'))); print(f"  file: {f['video']['codec']} {f['video']['width']}x{f['video']['height']} {f['video']['fps']} fps, sound {f['audio'] and f['audio']['codec']}, {f['seconds']:.2f} s (planned {r['length']['planned']} s)")
    print('  frames told apart:', r['frames']['toldApart'], '· black frames:', r['frames']['dark'])
    print('  cuts:', json.dumps(r['cuts']))
    if r.get('beats'): print('  beats:', json.dumps(r['beats']))
    if r.get('voice'): print('  talk:', json.dumps(r.get('talk'))); print('  voice:', json.dumps(r['voice']))
    print('  clips:', json.dumps(r['clips']), '· dark part:', json.dumps(r.get('darkPart')))
    print('  sound:', json.dumps(r.get('sound')))
