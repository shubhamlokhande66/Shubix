import type { Guide } from "./guides";

/** The guide to Ask Shubix (2026-11-26): what to type to get one exact look. Its commands are Shared/core
 * chatCommands.ts: when a command or a choice changes there, change it here too. */
export const ASK_SHUBIX_GUIDE: Guide = {
  slug: "ask-shubix",
  title: "Ask Shubix: how to get exactly the edit you want",
  description: "Shubix edits every Reel on the beat by itself. When you want one exact look, the box transition, a cutout or a zoom on the drop, here is what to type, with the / commands and examples in English, Hindi and Marathi.",
  minutes: 6,
  body: `When you press Make Reel, Shubix chooses everything by itself: which moment of each clip, where it cuts on the beat, the transitions, the effects and the colour. Most of the time that is all you need.

But sometimes you already know the look you want: the transition where the next clip builds in boxes, a person cut out before the drop, a slow push in. Shubix will not guess that by itself. You tell it in **Ask Shubix**, the box above your Reel (on the website and in the app), and it changes the Reel that way.

## The fastest way: type /
Type **/** in the Ask Shubix box. A list of commands opens:
- **/transition**: how one clip changes to the next (box panels, rows, a sliding window, zoom, flash, whip and more).
- **/effect**: a beat effect or a look on the clips (box grows on the beat, grid, zoom punch, shake, VHS, mirror…).
- **/cutout**: a person cut out of the shot (the subject pop), or the video shown inside your text.
- **/keyframe**: camera moves inside a clip: a push in, a snap zoom on the drop, a zoom on every beat, a slow tilt.
- **/speed**: slow motion on the drop, everything in slow motion, a speed ramp, a freeze on the drop.
- **/text**: an opening title, captions, a text on the drop.
- **/pace**: faster, calmer, a cut on every beat, a new version.
- **/look**: warm cinematic colour, black and white, vintage film, a square frame.

Pick a command, then pick what you want. Shubix writes the sentence in the box for you. You can add to it ("…only on clip 3") or change the words in quotes to your own, then press send.

**Exact every time:** a transition or an effect picked from /transition or /effect goes on every clip exactly as named, straight away, without using Shubix AI credits. The other commands are done by Shubix AI, like anything you write yourself.

## The transitions, and what they look like
- **Box panels:** the next clip builds in 6 boxes, out of black.
- **Row panels:** 5 rows slide in one by one.
- **Column panels:** 4 columns slide in one by one.
- **Sliding window:** a small window of the next clip slides across the screen, then opens to full.
- **Random tiles:** tiles flip to the next clip.
- **Zoom-through, Exposure flash, Whip pan, Glitch RGB:** fast, energetic cuts for drops and hits.
- **Dissolve, Dip to black, Film burn:** soft, calm changes.
- **Circle reveal, Heart reveal, Doors open, 3D cube, Swipe up, Push left, Spin, Pixelate:** a shape or a move into the next clip.

## Write it in your own words
You do not need the commands. Write what you want, the way you would tell an editor. A good request says three things:
- **What:** the transition, effect, zoom, speed or text.
- **Where:** all clips, one clip ("clip 2", "the first clip", "the last shot"), or a moment ("on the drop", "at the start", "the ending").
- **How much:** "a little", "strong", "only once", "on every beat".

Examples that work:
- "Use the box panels transition on every clip"
- "Zoom in on the drop and shake on the bass"
- "Slow motion on clip 3"
- "Add a subject pop before the drop"
- "Add the opening text \\"GOA TRIP\\" and make it fast"
- "Make it calm and cinematic, slower cuts"

Shubix understands Hindi, Marathi and Hinglish too:
- "saglya clips la box transition lav" (Marathi: the box transition on all clips)
- "sabhi clips par zoom punch effect lagao" (Hindi: a zoom punch on all clips)
- "drop var slow motion kar" (Marathi: slow motion on the drop)
- "pehle clip par text likho \\"HAPPY BIRTHDAY\\"" (Hindi: a text on the first clip)

## One change at a time
Ask for one or two things per message, look at the result, then ask for the next. After each change you can **Keep** it or **Undo** it, and every earlier version stays in the list, one tap away. If Shubix did not understand, it says so: name the clip or the moment and try again.

## What uses credits
- A transition or an effect from **/transition** or **/effect**: free, done straight away.
- A small change to some clips (one clip, the drop, the ending): a small Shubix AI change.
- A change to the whole Reel (a new version, a new pace for everything): a bigger Shubix AI change.
The box shows the cost before anything is used, and a change that fails uses no credits.

## Try it
Open any Reel, open Ask Shubix and type **/**. Start with **/transition** and **Box panels**: it is the quickest way to see a Reel change exactly the way you asked.`,
};
