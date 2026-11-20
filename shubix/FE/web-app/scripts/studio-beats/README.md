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

Measured 2026-11-14 (`baseline.json`). "Own" is the studio's own tracker alone; "both" is what the studio uses: its own
tracker and the neural tracker Beat This!, the analysis keeping the better of the two (`docs/fast-studio.md`).

```
node beatthis.mjs out/set1 out/set2 out/set3 out/deg1 out/deg2 out/deg3     # the neural tracker's beats (beatthis.json)
node bench.mjs --check baseline.json out/set1 out/set2 out/set3 out/deg1 out/deg2 out/deg3
```

| | set 1 | set 2 | set 3 | set 1 phone | set 2 phone | set 3 phone |
|---|---|---|---|---|---|---|
| own, F70 | 99.7% | 100% | 86.9% | 90.7% | 87.9% | 79.5% |
| own, F40 | 99.7% | 99.8% | 86.7% | 90.7% | 86.3% | 79.2% |
| Beat This! alone, F70 | 96.0% | 98.4% | 80.3% | 92.0% | 87.7% | 79.0% |
| **both, F70** | **99.3%** | **98.6%** | **92.5%** | **95.4%** | **94.4%** | **93.7%** |
| **both, F40** | **99.3%** | **98.6%** | **92.5%** | **95.4%** | **94.4%** | **93.4%** |

Where the own tracker is wrong, it is the tempo, not the timing: the beats it finds sit 0 to 11 ms (median) from the
true ones, but `pop_triplet_808_135`, `tabla_kaharwa_84`, phone `fast_174`, `trap_70_halftime` and
`bollywood_dembow_96` are counted at another tempo (0.5x, 0.74x, 0.8x, 1.7x, 2x). Beat This! gets most of those right.

Found with this benchmark and fixed (2026-11-14): the neural tracker's beats come in 20 ms steps, and lining the grid
up on the attacks (`refineBeats`) moved whole stretches of them 60 to 90 ms off the true beats.
`reggaeton_95`: 100% with either tracker alone, 85% (F40 64%) together; now 100%. Set 2 together: 96.5% -> 98.6% (F40
93.5% -> 98.6%); no set lower.

Still wrong together, not changed (the rules that choose a tracker were tuned on real songs, and these are synthetic):
- `tabla_kaharwa_84`: the own tracker counts twice too fast and is kept (67%); Beat This! alone has it right.
- `bhajan_accelerando_90_140` and `change_140_100`: Beat This! is kept (75%, 94%) where the own tracker is right.
- phone `trap_70_halftime`: neither has it (72%).

These numbers are lower than the table in `docs/fast-studio.md` (99.7% / 100% / 99.7%), which was measured earlier
with a script no longer in the repository; here the song reaches Beat This! through ffmpeg's resampler, in the app
through the browser's. Real songs (above) are what settles it.

## The rate a song is read at (2026-11-19)

The tracker's frames are counted in samples, and the benchmark decodes every song at 44.1 kHz, while a browser or a phone
decodes at its own rate, mostly 48 kHz. The same synthetic songs (sets 1-3, own tracker, F70):

| | 44.1 kHz | 48 kHz | 32 kHz | 22.05 kHz |
|---|---|---|---|---|
| before | 95.2% | 89.4% | 79.1% | 94.6% |
| after (every song resampled to 44.1 kHz first, `songAnalysis`) | 95.2% | 95.2% | 95.2% | 95.2% |

At 48 kHz `four_floor_124` and `bollywood_dembow_96` fell to 41%. A Reel song on QA got a beat every 0.79 s in the
browser, every 0.33 s at 44.1 kHz. `--check baseline.json` unchanged (its songs are 44.1 kHz).

## Where the cuts go (2026-11-19)

Only hits the drum / voice split called drums could be cuts, and a dhol, dholki, tabla or a Reel song's bass often is
not called a drum: whole songs got one or two cuts. A strong hit (over the song's median) right on a tracked beat is now
a cut too; in a song with little beat no shot is under 1.5 beats. Cuts per song, the longest shot (own tracker, 44.1 kHz):

| | before | after |
|---|---|---|
| garba 6/8 | 1 cut, 25.5 s | 14 cuts, 2.0 s |
| lavani dholki | 1, 23.7 s | 22, 1.5 s |
| bhangra dhol | 5, 9.1 s | 21, 1.8 s |
| bhajan | 6, 10.1 s | 19, 2.5 s |
| tabla kaharwa | 12, 5.7 s | 30, 1.8 s |
| piano only | 2, 29.1 s | 14, 3.0 s |
| a QA Reel song (its drop all bass) | 14, 3.9 s | 19, 1.7 s |

Drum songs (sets 1-2 but trap, hip-hop) unchanged; all 24 songs: shots over 2.5 s 24 -> 9.
