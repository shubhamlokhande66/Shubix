# Reference Reels: how creators cut, in numbers

Shubix's edit is made by rules, not by a trained model. Real edited Reels show what those rules should aim for. This
folder measures such Reels and keeps only the numbers: no videos, no file names, nobody's footage.

- `analyze.mjs` measures each video:
  - the song's beats and drops, with the studio's own song analysis (`Shared/core/src/engine/studio/song.ts`);
  - where the picture cuts (ffmpeg scene change over 0.32, run on a 180 px copy);
  - its light and colour.

  It writes each Reel's numbers and the set's medians with their middle half (25th to 75th percentile).
- `compare.mjs` measures a Reel Shubix made against `references.json`. It marks each edit number that falls outside
  the references' middle half. Use it as the yardstick for a change to how the edit is cut.
- `references.json` holds the current set: 19 beat Reels a creator sent, measured on 2026-11-15. The set is cars,
  weddings, shops and dance, 23-39 s long, at 106-144 BPM.

```
node analyze.mjs out.json a.mp4 b.mp4 ...            # ANON=1 names them r01, r02... (do this for references.json)
node compare.mjs references.json shubix-reel.mp4     # Node 22.18+ and ffmpeg
```

## What the 19 Reels show (medians)

| | creators | Shubix before (Mix, 5 clips, 98 BPM) | Shubix after |
|---|---|---|---|
| opening shot | 2.7 s, about 4 beats | 2.0 s | 2.0 s (the song's own part change) |
| shot | 1.4 s (2.3 beats) | 1.0 s | 1.25 s |
| shortest shot | 0.33 s | 0.17 s | 0.33 s |
| shots under 0.5 s | 8% | 39% | 25% |
| last five shots | longer | 1.0-2.5 s | 2.0-2.5 s |

These numbers changed the edit in both engines (`paceWell` and the burst gap in `beatEdit`):

- **The opening holds about 4 beats.** No cut comes before about 4 beats (1.6-3 s); a drop or a break still cuts.
- **The last fifth slows down.** No shot there is shorter than two beats.
- **No flashes in a burst.** Cuts on the drum hits are at least 0.3 s or half a beat apart; a third of a beat made
  0.17 s shots.

Auto only: Fast cuts on every beat on purpose, Smooth and Natural are long already, and a copied Reel keeps its own edit.

## What the numbers cannot settle

Cuts "on the beat" (±70 ms) measured 24%, which is about chance at 123 BPM. On the half-beats they measured 66%.

Several Reels lock to one steady offset of +64 to +100 ms after the detected beat, which is consistent. The cause
could be any of these:

- the scene detector marking the frame after the cut;
- the beat tracker on a mixed track;
- editors cutting late.

So these Reels say nothing yet about *where* in the beat to cut. The studio keeps cutting one frame before it. Settling
this needs Reels with a known song (the same song as a file), so the beats are measured on clean music.

## Adding Reels

1. Put the videos outside the repository.
2. Run `ANON=1 node analyze.mjs references.json all-of-them/*.mp4`.
3. Commit only the JSON.
