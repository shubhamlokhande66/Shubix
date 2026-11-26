/** Ask Shubix's commands (2026-11-26): typing "/" in the box lists them, a command lists its choices, and a choice
 * writes the sentence into the box (the creator can add to it, then sends it). The same list on the website and in the
 * app. The sentences are said so the studio does them exactly: a transition or an effect named here goes on every clip
 * without Shubix AI (visualIntent.ts finds its name, no credits), the rest is Shubix AI's (the director's tools). */

export type ChatChoice = { label: string; say: string; hint?: string };
export type ChatCommand = { cmd: string; title: string; hint: string; choices: ChatChoice[] };

/** the transitions a command can name: the studio's id, and the name said in the sentence (unique, found by the parser) */
export const COMMAND_TRANSITIONS: { id: string; label: string; hint: string }[] = [
  { id: "panels", label: "Box panels", hint: "the next clip builds in 6 boxes out of black" },
  { id: "hpanels", label: "Row panels", hint: "5 rows slide in one by one" },
  { id: "vpanels", label: "Column panels", hint: "4 columns slide in one by one" },
  { id: "window", label: "Sliding window", hint: "a small window of the next clip slides across, then opens" },
  { id: "tiles", label: "Random tiles", hint: "tiles flip to the next clip" },
  { id: "zoom", label: "Zoom-through", hint: "zooms into the next clip" },
  { id: "flash", label: "Exposure flash", hint: "a white flash on the cut" },
  { id: "whip", label: "Whip pan", hint: "a fast blurred swipe" },
  { id: "glitch", label: "Glitch RGB", hint: "a colour glitch" },
  { id: "dissolve", label: "Dissolve", hint: "a soft cross fade" },
  { id: "dip", label: "Dip to black", hint: "fades through black" },
  { id: "slideleft", label: "Push left", hint: "the next clip pushes in from the right" },
  { id: "swipeup", label: "Swipe up", hint: "like scrolling the feed" },
  { id: "spin", label: "Spin + blur", hint: "spins into the next clip" },
  { id: "iris", label: "Circle reveal", hint: "opens through a circle" },
  { id: "heart", label: "Heart reveal", hint: "opens through a heart" },
  { id: "burn", label: "Film burn", hint: "a warm film burn" },
  { id: "cube", label: "3D cube", hint: "turns like a cube" },
  { id: "doors", label: "Doors open", hint: "two doors open on the next clip" },
  { id: "pixelate", label: "Pixelate", hint: "pixels, then the next clip" },
];

/** the effects a command can name (on every clip): the studio's id and the name said */
export const COMMAND_EFFECTS: { id: string; label: string; hint: string }[] = [
  { id: "boxgrow", label: "Box grows on the beat", hint: "the clip in a small box that grows on each beat" },
  { id: "grid", label: "Grid opens on the beat", hint: "windows open one per beat" },
  { id: "strips", label: "Strips on the beat", hint: "3 strips, one per beat" },
  { id: "heartbeat", label: "Heart pulse", hint: "the clip in a heart, pulsing" },
  { id: "punch", label: "Zoom punch", hint: "a quick zoom on the hits" },
  { id: "zoomburst", label: "Zoom burst", hint: "a big zoom with colour split" },
  { id: "shake", label: "Camera shake", hint: "shakes on the bass" },
  { id: "bounce", label: "Beat bounce", hint: "bounces on every beat" },
  { id: "rgbpulse", label: "RGB split on the beat", hint: "colour split on each beat" },
  { id: "strobe", label: "Strobe on the beat", hint: "black and white flashes" },
  { id: "mirror", label: "Mirror", hint: "a mirrored picture" },
  { id: "vhs", label: "VHS retro", hint: "an old tape look" },
  { id: "pan-soft", label: "Ken Burns", hint: "a slow, soft move" },
];

const tr = COMMAND_TRANSITIONS.map((t) => ({ label: t.label, hint: t.hint, say: `Use the ${t.label} transition on every clip` }));
const fx = COMMAND_EFFECTS.map((t) => ({ label: t.label, hint: t.hint, say: `Put the ${t.label} effect on every clip` }));

export const CHAT_COMMANDS: ChatCommand[] = [
  { cmd: "/transition", title: "Transition", hint: "how one clip changes to the next", choices: tr },
  { cmd: "/effect", title: "Effect", hint: "a look or a beat effect on the clips", choices: fx },
  { cmd: "/cutout", title: "Cutout", hint: "a person cut out, or the video inside text", choices: [
    { label: "Subject pop", hint: "the person (or car, bike) cut out, small over the shot before the drop", say: "Add a subject pop: cut out the person before the drop" },
    { label: "Video inside the text", hint: "a colour fills the frame, the video shows through the letters", say: "Add a cutout text \"YOUR TEXT\" at the start, then fly through it into the video" },
    { label: "Fly through a letter", hint: "the camera flies through the O into the video", say: "Add a cutout text \"WELCOME\" at the start, then the video through the O" },
  ] },
  { cmd: "/keyframe", title: "Keyframe & zoom", hint: "camera moves inside a clip", choices: [
    { label: "Push in on the build-up", say: "Slowly push in (zoom in) during the build-up before the drop" },
    { label: "Snap zoom on the drop", say: "Snap zoom on the drop: start close, then quickly back out" },
    { label: "Zoom on every beat", say: "Add a zoom punch on the beats of every clip" },
    { label: "Slow tilt", say: "Add a slow tilt to the long clips" },
    { label: "Shake on the bass", say: "Shake the camera on the heavy bass hits" },
  ] },
  { cmd: "/speed", title: "Speed", hint: "slow motion, fast, freeze", choices: [
    { label: "Slow motion on the drop", say: "Slow motion on the drop" },
    { label: "All in slow motion", say: "Make every clip slow motion" },
    { label: "Speed ramp before the drop", say: "Speed ramp on the clip before the drop" },
    { label: "Freeze on the drop", say: "Freeze frame with a flash on the drop" },
    { label: "Normal speed", say: "Make every clip normal speed" },
  ] },
  { cmd: "/text", title: "Text", hint: "words on the Reel", choices: [
    { label: "Opening title", say: "Add the opening text \"YOUR TEXT\"" },
    { label: "Captions", say: "Add captions of what is said" },
    { label: "Text on the drop", say: "Add the text \"YOUR TEXT\" on the drop" },
  ] },
  { cmd: "/pace", title: "Pace", hint: "how fast it cuts", choices: [
    { label: "Faster", say: "Make it faster and more energetic" },
    { label: "Calmer", say: "Make it calm and cinematic, slower cuts" },
    { label: "Cut on every beat", say: "Cut on every beat" },
    { label: "New version", say: "Make a completely different version" },
  ] },
  { cmd: "/look", title: "Colour & frame", hint: "the colour and the frame", choices: [
    { label: "Warm cinematic", say: "Give it a warm cinematic colour" },
    { label: "Black and white", say: "Make it black and white" },
    { label: "Vintage film", say: "Give it a vintage film look with grain" },
    { label: "Square frame", say: "Put a square frame on all clips" },
  ] },
];

/** what "/" plus the typed letters shows: the commands that start so (all of them for "/"), or the choices of one */
export function commandsFor(typed: string): { cmd?: ChatCommand; list: ChatCommand[] } {
  const t = typed.trim().toLowerCase();
  if (!t.startsWith("/")) return { list: [] };
  const [word, ...rest] = t.split(/\s+/), exact = CHAT_COMMANDS.find((c) => c.cmd === word);
  if (exact && (rest.length || typed.endsWith(" "))) return { cmd: exact, list: [exact] };
  return { list: CHAT_COMMANDS.filter((c) => c.cmd.startsWith(word)) };
}
/** a command's choices that match what was typed after it ("/transition box" -> Box panels) */
export function choicesFor(cmd: ChatCommand, typed: string): ChatChoice[] {
  const q = typed.trim().toLowerCase().split(/\s+/).slice(1).join(" ");
  return q ? cmd.choices.filter((c) => c.label.toLowerCase().includes(q) || (c.hint || "").toLowerCase().includes(q)) : cmd.choices;
}
