import { asksForAllClips } from "@mobile/core/lib/chatSize";
import { COMMAND_EFFECTS, COMMAND_TRANSITIONS } from "@mobile/core/lib/chatCommands";

export type DirectorVisualIntent = {
  openingText?: string;
  squareFrameAll?: boolean;
  transitionAll?: boolean;
  transitionType?: string;
  effectsAll?: boolean;
  /** one effect named (a "/effect" choice): that effect on every clip */
  effectType?: string;
  /** photo boxes: five boxes with pictures from the other clips pop in on the beat over the long shots (boxes.ts) */
  photoBoxes?: boolean;
};

const TRANSITION_ALIASES: Array<[string, RegExp]> = [
  ["hard", /\bhard\s*cut\b/i],
  // the panels: the next clip in pieces (6 boxes out of black, 5 rows, 4 columns, a sliding window)
  ["panels", /\b(?:\d\s*)?box(?:es)?\s*(?:panels?|transition|animation)\b|\bpanels?\s*build\b|\bblocks?\s*(?:transition|animation)\b|बॉक्स/i],
  ["hpanels", /\brows?\s*panels?\b|\bhorizontal\s*(?:panels?|strips?)\b/i],
  ["vpanels", /\bcolumns?\s*panels?\b|\bvertical\s*(?:panels?|strips?)\b/i],
  ["window", /\bsliding\s*window\b/i],
  ["fadein", /\bfade\s*in\b|\bfadein\b/i],
  ["flash", /\bflash\b/i],
  ["whip", /\bwhip(?:\s*pan)?\b/i],
  ["zoomout", /\bzoom\s*out\b/i],
  ["zoom", /\bzoom(?:\s*through)?\b/i],
  ["glitch", /\bglitch\b/i],
  ["dip", /\bdip(?:\s*to\s*black)?\b/i],
  ["dissolve", /\bdissolve\b/i],
  ["iris", /\biris\b/i],
  ["wipe", /\bwipe\b/i],
  ["bars", /\bbars?\b/i],
  ["spin", /\bspin\b/i],
  ["diamond", /\bdiamond\b/i],
  ["heart", /\bheart\b/i],
  ["star", /\bstar\b/i],
  ["slideleft", /\b(?:slide|push)\s*left\b/i],
  ["slideright", /\b(?:slide|push)\s*right\b/i],
  ["slideup", /\b(?:slide|push)\s*up\b/i],
  ["slidedown", /\b(?:slide|push)\s*down\b/i],
  ["swipeup", /\bswipe\s*up\b/i],
  ["blur", /\bblur(?:\s*through)?\b/i],
  ["flip", /\b(?:card\s*)?flip\b/i],
  ["luma", /\bluma\b/i],
  ["pixelate", /\bpixelat(?:e|ion)\b/i],
  ["clock", /\bclock\s*(?:wipe|transition)?\b/i],
  ["doors", /\bdoors?\s*(?:open)?\b/i],
  ["ripple", /\bripple\b/i],
  ["burn", /\bfilm\s*burn\b|\bburn\b/i],
  ["dropin", /\bdrop\s*in\b/i],
];

/** Parse explicit visual requests locally so an AI reply cannot silently omit them. */
export function parseDirectorVisualIntent(prompt: string): DirectorVisualIntent {
  const value = String(prompt || "").trim();
  const intent: DirectorVisualIntent = {};
  const asksForText = /\b(text|title|caption|overlay|headline)\b|मजकूर|टेक्स्ट|शीर्षक|عنوان|உரை|వచనం/i.test(value);
  if (asksForText) {
    const quoted = value.match(/["“]([^"”]{1,80})["”]|'([^']{1,80})'/);
    let text = (quoted?.[1] || quoted?.[2] || "").trim();
    if (!text) {
      const match = value.match(/(?:opening|intro|first|hook)?\s*(?:text|title|caption|overlay)\s*(?:effect\s*)?(?:add(?:\s+kar)?|put|show|write|display)?\s*[:=-]?\s*([A-Z0-9][A-Z0-9 !?.-]{0,50})/i);
      text = (match?.[1] || "").trim().replace(/\s+(?:at|on|for|in)\s+(?:the\s+)?(?:opening|intro|first|hook).*$/i, "").trim();
    }
    if (text) intent.openingText = text.slice(0, 80);
  }

  const squareFrame = /(?:square\s*(?:frame|border)|1\s*:\s*1\s*(?:frame|border)?)/i.test(value);
  const allClips = asksForAllClips(value);
  if (squareFrame && allClips) intent.squareFrameAll = true;

  // a name from the commands first (exact), then the words people use
  const low = value.toLowerCase(), byLabel = <T extends { id: string; label: string }>(list: T[]) => [...list].sort((a, b) => b.label.length - a.label.length).find((x) => low.includes(x.label.toLowerCase()))?.id;
  const effectType = byLabel(COMMAND_EFFECTS), labelTransition = byLabel(COMMAND_TRANSITIONS);
  const namedTransition = labelTransition || (effectType ? undefined : TRANSITION_ALIASES.find(([, pattern]) => pattern.test(value))?.[0]);
  const asksTransition = /\btransitions?\b|ट्रांजिशन|ट्रान्जिशन|ट्रांज़िशन|संक्रमण|மாற்றம்|మార్పు|পদক্ষেপ|انتقال|转场|过渡|トランジション|切り替え|전환|переход|transição|transicion|transition|übergang|transizione|geçiş|transisi|chuyển\s*cảnh|ทรานซิชัน/u.test(value);
  if (allClips && (asksTransition || namedTransition)) {
    intent.transitionAll = true;
    if (namedTransition) intent.transitionType = namedTransition;
  }
  const asksEffects = /\b(?:effects?|effecr|fx)\b|इफेक्ट(?:्स)?|प्रभाव|असर|ಎಫೆಕ್ಟ್|ఎఫెక్ట్స్?|ইফেক্টস?|અસર|ਪ੍ਰਭਾਵ|تأثيرات?|效果|エフェクト|효과|эффекты|efeitos|efectos|effets|effekte|effetti|efektler|efek|hiệu ứng|เอฟเฟกต์/u.test(value);
  if (allClips && (asksEffects || effectType)) { intent.effectsAll = true; if (effectType) intent.effectType = effectType; }
  // "photo boxes", "5 boxes pop on it", "pizza var 5 box": boxes over the shot (not the box panels transition)
  const boxWords = /\b(?:photo|picture|pic|image)s?\s*(?:box|boxes|frames?)\b|फोटो\s*बॉक्स/i.test(value)
    || (/\b(?:box|boxes|boxe|boxs)\b|बॉक्स/i.test(value) && /\b(?:pop|pops|popping|over|on top|on it|tyavar|tyachyavar|var|upar|uppar|pe|par)\b/i.test(value) && !/transition|ट्रान्झिशन|ट्रांजिशन/i.test(value));
  if (boxWords) intent.photoBoxes = true;
  return intent;
}
