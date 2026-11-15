# The studio, start to end

The website's studio in a real browser, as a creator uses it: choose a song, add clips, Generate, play, Export. Then the
exported file itself is measured. It runs in Shubix CI (Actions → Shubix CI → Run workflow → what: `studio-e2e`), or by
hand against a running website:

```
node ../studio-beats/make-sets.mjs /tmp/beats            # songs whose beats are known
node make-media.mjs /tmp/media /tmp/beats                # 12 clips, each one colour of its own; clip 5 opens on 3 s of black
BASE=http://localhost:3001 MEDIA=/tmp/media OUT=/tmp/e2e CHANNEL=chrome node run.cjs
python3 analyze.py /tmp/media /tmp/e2e
```

`run.cjs` needs Playwright (`PLAYWRIGHT=<path to playwright-core>`); `CHANNEL=chrome` uses the installed Chrome, which
has the H.264 encoder the export wants. `ONLY=A,C` runs some of the runs.

## The runs

| | |
|---|---|
| A | a computer, as it comes (clips In my order, 1080p): 12 clips, a steady 124 BPM song |
| B | a computer, Mix all clips for the whole song, 720p: 5 clips (one mostly black), bhangra |
| C | a phone-sized screen with touch, as it comes, 720p: 8 clips, a dembow song |
| D | a computer, a Talking Reel (a vlog, a tutorial), 720p: three clips of speech in English, Hindi and Marathi with known pauses (`../studio-talk/make_talk.py`, needs espeak-ng), no song |

No API runs behind the website here: `/api/auth/me` is answered "accounts are off" so Generate goes on, the popup
"Shubix is not answering right now" is closed, and what needs an account or the cloud (Shubix AI's plan, saving to My
Reels, credits) is not part of this. The popups answered on the way are written in the report.

## What is measured

From the page (`report.json`): how long each step took and how long the page was blocked, the edit (its shots, clips,
the review's score), the preview's frame rate, the export's own check.

From the exported file (`analysis.json`):
- what the file is: size, frame rate, length, sound;
- which clip every frame shows (by its colour), so where the picture really cuts: against the cuts the edit planned and
  against the song's true beats, in ms (one frame is 33 ms; the studio cuts one frame before the beat on purpose);
- the clips really in the picture; black frames; whether the black part of clip 5 is shown;
- sound against picture: how far the song in the file is from where the edit put it.
- a Talking Reel: how much of the speech is in the Reel and how much of the long pauses (against the phrases really
  spoken), and shot by shot whether the voice in the file is the clip's own and how late it is against the picture.

The runner has no graphics card: the preview's frame rate and the export's time there say nothing about a phone.
Screenshots are written into the log too (small JPEGs between `SHOT` and `END`), for a run whose files cannot be fetched.
