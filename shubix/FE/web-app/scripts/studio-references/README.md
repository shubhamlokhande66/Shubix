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
- `references.json` holds the current set: 22 human-edited Reels a creator sent (19 measured on 2026-11-15, three
  more added on 2026-11-17). The set is cars, weddings, shops and dance, mostly 24-36 s long, at 104-142 BPM.

## The human score

`compare.mjs` first scores the reference Reels themselves: how many of the 10 edit numbers each one has inside the
set's middle half. Every editor has a style, so no human Reel lands all 10. With the 22 Reels a human Reel typically
scores 6, and the middle half of them scores 2 to 7. A Shubix Reel is then marked:

- **as human as the references** at 6 or more;
- **close to the references** at 2 to 5;
- **less human than the references** below 2.

To score Shubix on a creator's own footage, make a Reel from their raw clips and song, export it, and run
`compare.mjs` on it. The live number from real creators is Admin → Overview → "Kept as Shubix made it": the share of
exported Reels the creator did not change after Shubix's edit (`BE/api/src/server/studio/accuracy.ts`).

```
node analyze.mjs out.json a.mp4 b.mp4 ...            # ANON=1 names them r01, r02... (do this for references.json)
node compare.mjs references.json shubix-reel.mp4     # Node 22.18+ and ffmpeg
```

## What the first 19 Reels showed (medians)

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

**The end card.** 14 of the 19 end on 4 to 6 s of black (median 4.4 s) with the creator's @handle and logo; the others
darken the last shot under them. The scene cuts above count that card, so the cut rate of the last third (0.20 a
second) is partly the card. Without it the rate is 0.48 / 0.54 / 0.32 a second (first, middle, last third): the end
still slows down, less. The studio makes the end card itself when the creator sets My brand
(`Shared/video-engine/src/finish.ts`), with the logo small in a corner through the Reel, as most of these carry.

**Their finish.** Cinematic bars (a 2.39:1 band; the festival Reels), a colour flash on the strong beats (blue, then
orange; the dance Reel), black and white before the drop: the studio has each as one tap (Look), and Shubix AI's chat
can set them.

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
