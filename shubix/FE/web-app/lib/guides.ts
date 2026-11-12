/** The guides (app/guides): practical articles on making short vertical videos, written by the Shubix team. The body is
 * RichText: "## " a heading, "- " a list, a blank line a new paragraph, **bold** and [links](/pricing). */
import { MORE_GUIDES } from "./guides-more";

export type Guide = { slug: string; title: string; description: string; minutes: number; body: string };

const FIRST_GUIDES: Guide[] = [
  {
    slug: "beat-synced-reel",
    title: "How to make a beat-synced Reel",
    description: "Why cuts on the beat feel good, how to find the beats of a song, and how to choose which clip goes on which beat.",
    minutes: 5,
    body: `A beat-synced Reel is a video whose cuts land on the beats of its song. Viewers rarely notice it consciously, but they feel it: the picture and the music move together, so the video feels intentional instead of random. It is the single cheapest way to make simple phone footage look edited.

## Why the beat matters
Music sets an expectation. When a drum hits and the picture changes at the same moment, the brain gets the change it was waiting for. A cut a little early or late feels like a stumble, even to people who could not explain why. That is why many popular Reels use plain footage but precise timing.

## Find the structure of the song first
Before you think about clips, listen to the part of the song you will use, usually 10 to 30 seconds. Notice three things:
- **The pulse:** the steady beat you would clap along to.
- **The build-up:** a part where the energy rises, often with a drum roll, a riser or a held note.
- **The drop or the chorus:** the moment the song releases that energy. This is where your best shot belongs.

Quiet parts and pauses matter too. A short silence before a drop is a perfect place to hold a shot or to cut to black for a split second.

## Decide how often to cut
You do not have to cut on every beat. A good rule:
- **Calm or emotional songs:** a new shot every 4 or 8 beats, so each moment can breathe.
- **Most pop and Punjabi songs:** every 2 beats in the verse, every beat on the chorus.
- **Fast phonk, EDM or dhol parts:** every beat or on every strong drum hit, but only for a few seconds at a time.

Change the pace through the video. A Reel that cuts at one speed from start to end feels flat, however precise it is.

## Match clips to moments
Put your most striking shot first, because people decide in the first second whether to keep watching. Save your strongest action shot for the drop. Use calmer shots, such as wide views, slow movement and details, on the quieter parts. Avoid putting two very similar shots next to each other: alternate wide and close, still and moving.

## Cut inside the movement
A cut feels smoother when there is movement on both sides of it: a hand reaching, a person turning, a car passing. Trim each clip so the action is already happening when it appears, not a second before.

## How Shubix does it
In a Beat Reel, Shubix measures the song on your device: its beats, its drops, its quiet moments and its strongest hits. It then places the cuts on those beats and picks a moment from each clip for every cut. You can change the pace, swap a clip, move a cut or ask for another version. On paid plans, [Shubix AI](/pricing) also looks at your clips to choose the moments, transitions and effects.

## A quick checklist
- Pick 10 to 30 seconds of the song with a clear build-up and drop.
- Gather more clips than you need, each with something happening in it.
- Strongest shot first, best action on the drop.
- Change the pace with the music, not the same speed everywhere.
- Watch it once with the sound off and once with your eyes closed: both should still make sense.`,
  },
  {
    slug: "reel-size-and-length",
    title: "The right size, shape and length for Reels",
    description: "Aspect ratio, resolution, safe zones for text, and how long a Reel should be for the story you want to tell.",
    minutes: 4,
    body: `Getting the format right is the boring part of making Reels, but a wrong size can cut off your subject, hide your text behind buttons or make the video look soft. Here is what to aim for.

## Shape: vertical 9:16
Reels, Shorts and most short-video apps fill a phone screen held upright. That is a 9:16 shape: 9 units wide for every 16 tall. Film vertically whenever you can. If a clip is horizontal, you have three choices:
- **Crop it** to a vertical slice, keeping the subject in the middle.
- **Fit it** inside the frame with a blurred copy of itself behind it.
- **Use it as a moment**, such as a wide landscape, and keep it short.

## Resolution: 1080 by 1920
A 9:16 video at 1080 pixels wide and 1920 tall is the usual target. Higher resolutions are usually scaled down by the app anyway, and they make uploads slower. Lower resolutions look soft on modern phones. Shubix exports vertical 9:16 videos, so you do not have to set this by hand.

## Safe zones for text
The app draws its own buttons and captions over your video: the like and share buttons on the right, the caption and the sound name at the bottom, and the account name near the top. Keep important text and faces away from those areas:
- Leave roughly the bottom fifth of the frame free of important text.
- Keep a margin on the right side for the buttons.
- Put titles a little above the centre, not at the very top.

## Length: as short as the idea allows
There is no single right length, but there is a simple rule: a Reel should end before the viewer wants it to.
- **7 to 15 seconds:** one idea, one song section, made to be watched several times. Good for transitions, reveals and quick jokes.
- **15 to 30 seconds:** a small story with a beginning, a build and a payoff. Good for travel, events and products.
- **30 to 90 seconds:** tutorials, recipes and talking videos, where people stay for the information.

Apps change their limits over time and some now allow several minutes, but a longer limit is not a reason to use it. Watch time compared to length matters more than length itself.

## Frame rate and sound
Most phones film at 30 frames per second, which is fine for nearly everything. Film at 60 if you plan to slow a moment down. For sound, keep your song clear and, if someone speaks, make sure the voice is louder than the music. Shubix lets you set the song's volume and add captions for speech.

## Before you post
Watch the export on your phone, full screen, at normal brightness. Check that no text sits under where the buttons will be, that faces are not cut off, and that the first frame is a picture worth stopping for, because it is also what people see before they press play.`,
  },
  {
    slug: "music-rights-for-reels",
    title: "Music for Reels: choosing a song and using it legally",
    description: "How to pick a song that fits your video, and what you need to know about rights before you post or monetise.",
    minutes: 5,
    body: `The song often decides whether a Reel works. It sets the speed of the edit, the emotion and even who finds the video. It also comes with rules, and ignoring them can get a video muted, blocked or taken down.

## Start from the feeling, not the trend
Ask what the video should feel like before you search for a song. A wedding highlight wants warmth, a gym clip wants energy, a car reveal wants tension and then release, a travel diary wants space. A trending song that does not fit the feeling makes the video forgettable; a fitting song makes even simple clips feel like a story.

Then listen for structure. A song with a clear build-up and drop gives you a natural peak for your best shot. A song with a long, even groove suits calm montages and slow camera moves.

## Who owns a song
Almost every commercial song has at least two kinds of rights: the composition (the melody and lyrics) and the recording. Being able to buy or stream a song does not give you the right to put it in your own videos and publish them. Using a song without permission can lead to the video being muted or removed, and repeated problems can affect an account.

## Safe ways to use music
- **The app's own music library.** Instagram and similar apps license many songs for use inside their apps. Adding music there is usually the simplest route for personal posts. The rules for business and branded accounts are often stricter, so check them.
- **Royalty-free or licensed music.** Libraries sell or give licences for use in videos. Read what the licence allows: some exclude ads or require credit.
- **Your own music,** or music made for you with a written agreement.
- **Your clips' own sound.** Ambient sound, speech and live moments can be stronger than any song.

## How this works in Shubix
Shubix is video editing software. It does not sell music, and it does not supply a song library. You add a song from your own device, and Shubix uses it only to find the beats and build the edit. You are responsible for having the right to use the song where you publish. If you are not sure, a common approach is to edit in Shubix, export the video without the song, and then add the same song from the app's licensed library when you post. In Shubix you can also use your clips' own sound instead of a song. Read our [terms](/terms) for the details.

## Monetised and client videos
If the video promotes a business, is paid for by a client or earns money, be stricter. Use music you have a licence for that clearly covers that use, keep the licence, and avoid popular commercial songs unless you have permission.

## Mixing music and speech
When someone speaks, lower the song under the voice instead of muting it completely, and raise it again when the speech ends. Captions help too: many people watch without sound, and captions keep the meaning when the music is loud.

## A checklist before posting
- The song fits the feeling of the video.
- Its strongest moment matches your strongest shot.
- You know where the right to use it comes from.
- Voices are clear above the music.
- The video still makes sense with the sound off.`,
  },
  {
    slug: "wedding-reel-editing",
    title: "Editing a wedding or event Reel people will rewatch",
    description: "Which moments to keep, how to order them, and how to edit a celebration so it feels warm instead of rushed.",
    minutes: 5,
    body: `A wedding, birthday or family function produces hours of footage and only a few seconds that matter. A good event Reel is mostly about choosing: the right moments, in the right order, at the right pace.

## Collect the moments that carry emotion
Look for shots with a clear feeling, not just a clear picture:
- **Details before the event:** decorations, jewellery, mehendi, the cake, the venue lights.
- **Anticipation:** getting ready, a nervous laugh, a parent adjusting a dupatta or a tie.
- **The main moment:** the entry, the varmala, the vows, the candles being blown out.
- **Reactions:** people laughing, crying, cheering. Reactions often matter more than the moment itself.
- **Celebration:** dancing, friends lifting the couple, confetti, the baraat.
- **A quiet ending:** a walk away, a hug, a look back at the camera.

## Order: a small story
Do not simply follow the clock. Build the Reel like a story: set the scene with details, build up with anticipation, put the main moment on the strongest part of the song, release energy with the celebration, and end softly. Viewers who were not there should still feel the arc.

## Pace: let emotion breathe
Event Reels fail most often by cutting too fast. Fast cuts suit the dance floor; emotional moments need time.
- Hold an emotional reaction for at least a second and a half.
- Use slow motion only on moments that deserve it, such as a turn, a throw of petals or a hug.
- Speed up during the celebration, then slow down again for the end.

## Transitions and effects
Simple cuts on the beat are usually best. Soft dissolves suit quiet, emotional moments; a quick flash can mark the main entry or the drop of the song. Avoid shaky or glitchy effects on emotional shots: they fight the feeling. A warm, slightly golden colour look suits most celebrations, and the same look across every clip makes footage from different phones feel like one film.

## Text and names
A short title at the start, such as two names and a date, gives the Reel context. Keep it small and elegant and leave it on screen long enough to read. Only write names and details the family is happy to share publicly.

## Many cameras, one look
At events, footage comes from several phones with different colours and brightness. Before you worry about effects, make the clips match: similar warmth, similar brightness. In Shubix, one colour look applies across the whole Reel, and each clip can be adjusted on its own.

## Privacy and permission
Weddings include guests who did not agree to be in a public video, often children. Ask the couple or host before you post, avoid close-ups of guests who may not want them, and keep private moments private.

## In Shubix
Choose a romantic or calm song, add your best 15 to 30 clips, and start a Beat Reel. Put your favourite shot first, then change the pace if the emotional part feels rushed. On paid plans you can ask [Shubix AI](/pricing) in your own words, for example "slow and emotional, the entry on the chorus", and it edits the Reel that way.`,
  },
  {
    slug: "car-bike-reveal-reel",
    title: "Car and bike reveal Reels: tension, details and the drop",
    description: "How to shoot and edit a vehicle reveal that builds suspense and pays it off on the beat.",
    minutes: 4,
    body: `Car and bike Reels are one of the most popular kinds of short video, and the best ones follow the same idea: hide the vehicle, tease it with details, and show it fully exactly when the music drops.

## The idea: tension, then release
A reveal works because the viewer is waiting. If the whole car appears in the first second, there is nothing left to discover. Instead, build curiosity with parts of it and save the full view for the strongest moment of the song.

## Shots to film
Plan your shots before you go out. Film each one for several seconds so you have choices later.
- **Details:** a headlight turning on, a wheel or rim, a badge, the exhaust, the dashboard, a hand on the key or the handlebar.
- **Movement:** the vehicle passing the camera, a slow push towards it, a low shot of tyres rolling.
- **The rider or driver:** walking up, putting on a helmet or sunglasses, opening the door.
- **The hero shot:** the whole vehicle, ideally moving, in good light, framed with space around it.
- **The ending:** driving away, a final engine sound or a still, wide shot.

Film in soft light, early morning or at sunset, or at night with street lights and the vehicle's own lights. Keep the camera low: it makes any vehicle look more powerful.

## Choose the right song
This style usually uses tense, confident music: phonk, trap, drill or a hard electronic track with a clear drop. Find the exact moment of the drop. That is where your hero shot goes, and everything before it builds towards it.

## Editing
- **Before the drop:** cut detail shots on the beat. Keep each one short, and darken them slightly so they feel mysterious.
- **The build-up:** cut faster as the music rises. A short speed ramp into the last detail shot adds energy.
- **The drop:** cut to the hero shot exactly on the beat. A camera shake on the bass, a quick flash or a punch zoom makes the moment hit.
- **After the drop:** alternate movement and details, then end on a strong wide shot.

A dark, high-contrast colour look suits most reveals. Keep it the same on every clip.

## Mistakes to avoid
- Showing the full vehicle too early.
- Using shaky, handheld detail shots without a reason.
- Effects on every cut: they lose their power. Save the biggest one for the drop.
- Number plates and addresses: hide them if you do not want them public.

## In Shubix
Add your song and your clips to a Beat Reel. Put a detail shot first, check that the hero shot lands on the drop, and change the order if it does not. On paid plans, you can ask [Shubix AI](/pricing) in your own words, for example "details first, the full car on the drop", and it edits the Reel that way.`,
  },
  {
    slug: "transitions-that-work",
    title: "Transitions and effects: when to use them and when not to",
    description: "A practical guide to choosing transitions and effects that serve the music and the story instead of distracting from it.",
    minutes: 5,
    body: `Transitions and effects are the most visible part of an edit, and the easiest to overuse. Used with the music, they make a Reel feel alive. Used everywhere, they make it tiring to watch.

## The plain cut is the default
Most cuts in a good Reel are plain cuts on the beat. A plain cut is invisible: the viewer follows the story, not the editing. Special transitions work because they are rare, so they mark a moment that matters. If every cut has a transition, none of them stands out.

## Match the transition to the music
- **Flash or quick zoom:** a big drum hit or a drop. It gives the moment a burst of energy.
- **Whip or swipe:** a fast drum roll, or when the camera is already moving in the same direction in both clips.
- **Dissolve or fade:** a calm part, a held note in the vocals, or the passing of time.
- **Dip to black or white:** the end of a section, a change of place, or a dramatic pause before a drop.
- **Shapes such as a circle or a wipe:** a change of chapter, or a playful, light-hearted Reel.
- **Glitch or colour split:** electronic music and hard hits, used briefly.

## Match the transition to the feeling
A soft song with a jumpy glitch transition feels wrong, even if the timing is perfect. A sad or devotional Reel suits long shots, dissolves and gentle camera moves, without shakes or flashes. A party or dance Reel suits fast cuts, flashes and punchy zooms. A reveal suits restraint before the drop and the strongest effect exactly on it.

## Effects inside a shot
Effects that happen within a shot, such as a zoom punch on a drum hit, a small shake on the bass or a slow push-in during a build-up, are often more effective than transitions between shots. They keep the picture moving with the music without changing the scene.
- Put a punch zoom on the strongest hits only.
- Use a slow push-in on long, calm shots so they do not feel frozen.
- Use speed changes sparingly: a short slow-motion moment, or a speed ramp into the drop.

## Colour is an effect too
A consistent colour look across all clips does more for a Reel than any single transition. Pick one look that suits the feeling, such as warm for celebrations, cool and contrasty for night or vehicles, or soft and faded for calm memories, and apply it to the whole video.

## A simple rule of three
For a 15 to 30 second Reel, aim for mostly plain cuts, no more than two or three special transitions, and one big effect on the strongest moment of the song. Then watch it and remove anything that you notice before you notice the story.

## In Shubix
Shubix places transitions and effects that follow the song: it knows where the drops, the quiet parts and the strong hits are. You can change any transition or effect on any cut, or turn them off. On paid plans, [Shubix AI](/pricing) chooses them from the music of each cut and what your clips show.`,
  },
  {
    slug: "filming-clips-on-your-phone",
    title: "Filming clips on your phone that are easy to edit",
    description: "Simple habits for shooting footage that turns into a good Reel: light, steadiness, movement and variety.",
    minutes: 4,
    body: `Editing can rescue a lot, but it cannot add what was never filmed. A few habits while shooting make the edit faster and the Reel noticeably better.

## Light first
Light matters more than the phone. Face the light rather than having it behind your subject, film near windows indoors, and prefer the soft light of early morning or late afternoon outdoors. At night, use street lights, shop signs or a lamp as your light source and move closer to it. Dark footage gets grainy, and no colour filter fully fixes it.

## Hold steady, then move on purpose
Shaky footage is tiring to watch. Hold the phone with both hands, keep your elbows close to your body, and move slowly. When you do move, move deliberately: a slow walk towards the subject, a smooth turn, a pass beside it. If your phone has stabilisation, keep it on.

## Film vertically
Most Reels are watched vertically. Film upright so you do not have to crop later, and keep the subject near the middle so it survives any final crop.

## Shoot more, shorter
Instead of one long recording, film many short clips of 3 to 8 seconds, each with one clear moment. Start recording a second before the action and stop a second after it. This gives the edit room for clean cuts.

## Get variety
A Reel made of the same shot from the same distance is flat. For every scene, try to get:
- **A wide shot** that shows where you are.
- **A medium shot** of the person or object.
- **A close-up** of a detail: hands, eyes, food, a texture.
- **A moving shot:** you moving, or the subject moving through the frame.

Alternating these in the edit keeps the viewer's eyes busy without needing effects.

## Think about the cut while you film
If you plan a transition, film for it. For a whip, swing the camera quickly at the end of one clip and in the same direction at the start of the next. For a match cut, end one clip and start the next with the subject in the same place in the frame. Planned transitions look far better than added effects.

## Clean sound when it matters
If someone is speaking, get closer, film away from wind and traffic, and keep the phone's microphone uncovered. A cheap clip-on microphone improves speech more than any editing.

## Before you edit
Delete the clips that are blurred, too dark or have nothing happening in them, and keep your favourites. In Shubix, you add the clips you want, and it picks the best moment of each: the sharpest, best-lit moment with the subject in view. Better raw clips still give a better result.`,
  },
  {
    slug: "hook-the-first-second",
    title: "The first second: hooks that stop the scroll",
    description: "Why the opening of a Reel matters most, and practical ways to make people stop and keep watching.",
    minutes: 4,
    body: `People scroll quickly. In the first second, they decide whether your Reel is worth stopping for. A strong opening, called the hook, matters more than anything that follows it, because without it nothing that follows is seen.

## Open on your strongest picture
Do not start with a slow introduction, a logo or an empty room. Start with the most striking moment you have: a face mid-laugh, the finished dish, the car's headlights, the view from the top. You can tell the story after you have the viewer's attention.

## Start in the middle of the action
Begin a clip when something is already happening: the jump is already in the air, the paint is already on the brush. Motion in the very first frame catches the eye better than a still beginning.

## Make a promise
Give the viewer a reason to stay until the end:
- **A question:** "Can this old bike look new again?"
- **A result first:** show the final look, then how you got there.
- **A number:** "3 mistakes in your Reels", then deliver all three.
- **A surprise:** something unexpected in the first frame.

Then keep the promise. A hook that the video does not pay off makes people scroll faster next time.

## Text on screen
Many people watch without sound, so a few words on screen help. Keep it short, three to seven words, large and easy to read, and leave it on screen long enough to read twice. Place it away from the bottom of the frame, where the app shows its own captions.

## Use the music
A hook lands harder on a strong beat. Start your first cut right on a beat, or start the song just before a recognisable moment, so the first second already feels in rhythm.

## Keep the middle moving
A hook gets attention, and pace keeps it. Change the shot every one to two seconds in fast sections, use variety in framing, and build towards a payoff that comes a little before the end. End cleanly, without a long fade or a dead final second.

## Test it
Watch your Reel as a stranger would: on your phone, scrolling into it from another video. Would you stop? If not, try a different first shot. Changing only the first clip often changes the result more than re-editing the whole video.

## In Shubix
Shubix treats the first cut as the hook: it chooses a striking, clear moment for it and lands it on the beat. You can drag any clip to the front, add a short title, or ask for another version. A hook text can also be added from the editor, in a style that fits the Reel.`,
  },
];

export const GUIDES: Guide[] = [...FIRST_GUIDES, ...MORE_GUIDES];

export const guide = (slug: string) => GUIDES.find((g) => g.slug === slug);
