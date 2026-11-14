# Fast Studio beat benchmark

How exactly the studio finds a song's beats, measured against songs whose beats are known. It runs the code the
website and the Android app run (`Shared/core/src/engine/studio/song.ts`), with Node 22.18 or newer and nothing to install.

## Synthetic songs (no copyrighted audio, the same on every computer)

```
cd FE/web-app/scripts/studio-beats
node make-sets.mjs                     # out/set1-3 (clean) and out/deg1-3 (as heard on a phone); python 3 + numpy, ffmpeg
node bench.mjs --check baseline.json out/set1 out/set2 out/set3 out/deg1 out/deg2 out/deg3
```

`--check` ends with an error when a set's mean is more than 1 point under `baseline.json`, so a change to the tracker
that makes beats worse is seen before it ships. After a change that makes them better: `--write baseline.json` in place
of `--check`, and commit the file.

- Set 1: 100, 128, off-beat 140, 95 -> 128, drift 108 -> 114, slow 72, fast 174.
- Set 2: four-on-the-floor, swung hip-hop, reggaeton, half-time trap, piano, drift, change.
- Set 3, what Indian Reels use: pop / hip-hop 135 with triplet hats and an 808 on and off the beat, bhangra dhol 98,
  garba 6/8, lavani dholki 160, Bollywood dembow 96, a free-time intro then 128, kaharwa on tabla 84, a bhajan speeding
  up 90 -> 140.
- `make_degraded.py`: MP3 128 kb/s, room echo, a phone speaker's roll-off, room noise, quieter and slightly clipped.

## Real songs

Synthetic songs are not real mixes. For real music, a person marks the beats:

1. Open `tap.html` in a browser, choose the song, tap on every beat, check them with the click, save `song.beats.txt`.
   (An Audacity label track exported as text works too: one time in seconds at the start of each line.)
2. Put each song and its `.beats.txt` in one folder per kind of music, under `real/` (never committed: `.gitignore`).
3. `node bench.mjs real/bollywood real/marathi real/garba ...` (ffmpeg decodes mp3, m4a, aac, ogg, flac, opus).

A song with no `.beats.txt`, or with under 8 beats marked, is skipped and named; nothing is guessed.

## What is measured

| | |
|---|---|
| F70 | F-measure, a beat counted within ±70 ms: the usual standard for beat tracking |
| F40 | the same within ±40 ms: about one frame of video, what a cut on the beat needs |
| off | the median distance of the found beats from the true ones (of those within ±70 ms) |
| tempo | found beats / true beats: 1.00 is right, 2.00 or 0.50 twice or half the tempo, 1.50 a triplet count |

## Results

The studio's own tracker alone, measured 2026-11-14 (`baseline.json`):

| | set 1 | set 2 | set 3 | set 1 phone | set 2 phone | set 3 phone |
|---|---|---|---|---|---|---|
| F70 | 99.7% | 100% | 86.9% | 90.7% | 87.9% | 79.5% |
| F40 | 99.7% | 99.8% | 86.7% | 90.7% | 86.3% | 79.2% |

Where it is wrong, it is the tempo, not the timing: the beats it finds sit 0 to 11 ms (median) from the true ones, but
`pop_triplet_808_135`, `tabla_kaharwa_84`, phone `fast_174`, `trap_70_halftime` and `bollywood_dembow_96` are counted
at another tempo (0.5x, 0.74x, 0.8x, 1.7x, 2x).

The studio does not use this tracker alone: the neural tracker Beat This! runs beside it and the analysis keeps the
better of the two (`docs/fast-studio.md`). With a `beatthis.json` in a set's folder (`{ "<name>": { "beats": [...] } }`)
`bench.mjs` also scores the two together ("both"). Earlier measurements of the two together, made with a script that is
no longer in the repository and not measured again here: 99.7% / 100% / 99.7% clean, 98.5% / 89.1% / 99.7% phone.
