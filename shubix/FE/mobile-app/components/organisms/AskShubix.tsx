import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useThumb } from "../../lib/thumbs";
import { router } from "expo-router";
import { useStudioText } from "@mobile/hooks";
import { Bubble, ChatChip, Gold, Icon, useColors } from "@mobile/ui-mobile";
import type { ChatLine } from "@mobile/validations";
import { choicesFor, commandsFor } from "@mobile/core/lib/chatCommands";

// when it was said or done: the time today, the date and time before today
const when = (at: number) => { const d = new Date(at); return (d.toDateString() === new Date().toDateString() ? "" : d.toLocaleDateString([], { day: "numeric", month: "short" }) + ", ") + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };

// the ideas under the box (the website's askchips): what is shown, and what it says
const IDEAS: [string, string][] = [["Fast & energetic", "Fast cuts on every beat, high energy"], ["Calm & cinematic", "Make it calm and cinematic, slower cuts"], ["Zoom on the drop", "Zoom in on the drop and add camera moves on the beats"], ["Slow-mo ending", "Slow motion on the best moment at the end"]];

/** Ask Shubix AI (the website's studio askbar): a card that opens to a box where you say how you want your Reel, the
 * ideas to tap, and the conversation with Shubix AI's history, each with its time. `onAsk` does what was asked and returns
 * the answer; `log` and `onLog` keep the conversation with the Reel (without them it lives only on this screen). */
export type ShotPic = { uri: string; kind: "video" | "image"; at: number };
function ShotThumb({ pic }: { pic: ShotPic }) {
  const t = useThumb(pic.uri, pic.kind, pic.at);
  return <View className="h-11 w-8 overflow-hidden rounded-md bg-black/70">{t ? <Image source={{ uri: t }} style={{ width: "100%", height: "100%" }} resizeMode="cover" /> : null}</View>;
}
export function AskShubix({ onAsk, plan, planned, log: kept, onLog, status, review, onKeep, onUndo, versions, onVersion, shotPics }: { onAsk: (text: string) => string | Promise<string>; plan?: { story: string; lines: string[] } | null; planned?: boolean; log?: ChatLine[]; onLog?: (add: (l: ChatLine[]) => ChatLine[]) => void;
  /** what Shubix is doing now (a change in the editor: no full-screen popup), `review`: the change just made, with Keep and Undo */
  status?: string; review?: boolean; onKeep?: () => void; onUndo?: () => void;
  /** the Reel before each change (this visit): one tap goes back to it */
  versions?: { at: number; label: string }[]; onVersion?: (i: number) => void;
  /** each shot's picture (its clip at the moment the shot starts), beside its line in the shot list, when they match */
  shotPics?: ShotPic[] }) {
  const words = useStudioText(), look = useColors();
  const [older, setOlder] = useState(false), [open, setOpen] = useState(false), [said, setSaid] = useState(""), [own, setOwn] = useState<ChatLine[]>([]), [busy, setBusy] = useState(false), [shots, setShots] = useState(false);
  const log = kept ?? own, setLog = onLog ?? setOwn;
  async function ask(text: string) {
    text = text.trim().slice(0, 300);
    if (!text || busy || /^\/\S*$/.test(text)) return;   // a command not chosen yet: its list is open
    setSaid(""); setLog((l) => [...l, { at: Date.now(), me: true, text }]); setBusy(true);
    try { const answer = await onAsk(text); setLog((l) => [...l, { at: Date.now(), me: false, text: answer }]); } finally { setBusy(false); }
  }
  return (
    <View className="overflow-hidden rounded-[18px] border border-accent/25 bg-surface">
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} className="flex-row items-center gap-3 p-3.5">
        <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full"><Gold /><Icon name="sparkle" size={18} color="#fff" /></View>
        <View className="min-w-0 flex-1">
          <Text className="text-[14.5px] font-bold text-foreground">{words("Ask Shubix")} <Text className="text-accent">AI</Text></Text>
          <Text numberOfLines={open ? undefined : 2} className="text-[12px] leading-[17px] text-muted">{words("Say how you want your Reel: the pace, the moments, zooms, transitions, slow-mo, text… Shubix edits it for you.")}</Text>
        </View>
        <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}><Icon name="down" size={20} color="muted" /></View>
      </Pressable>
      {open && (
        <View className="gap-3 border-t border-border px-3.5 pb-3.5 pt-3">
          {plan ? (
            <View className="gap-1.5 rounded-2xl border border-accent/25 bg-surface-2 p-3">
              <Text className="text-[13px] font-bold text-foreground">{words("Shubix's plan for this Reel")}</Text>
              {!!plan.story && <Text className="text-[12.5px] leading-[18px] text-foreground">{plan.story}</Text>}
              <Pressable onPress={() => setShots(!shots)} accessibilityRole="button" accessibilityState={{ expanded: shots }}><Text className="text-[12px] font-semibold text-accent">{words(shots ? "Hide the shots" : "See every shot")} ({plan.lines.length})</Text></Pressable>
              {shots && plan.lines.map((line, i) => (
                <View key={i} className="flex-row items-start gap-2">
                  {shotPics?.[i] && <ShotThumb pic={shotPics[i]} />}
                  <Text className="flex-1 text-[11.5px] leading-[16px] text-muted">{i + 1}. {line}</Text>
                </View>
              ))}
            </View>
          ) : planned === false ? <Text className="text-[12px] leading-[17px] text-muted">{words("Shubix AI has not edited this Reel. This is the phone's own edit.")}</Text> : null}
          {log.map((m, i) => <View key={i} className={m.me ? "items-end" : "items-start"}><Bubble mine={m.me}>{m.text}</Bubble><Text className="mt-0.5 px-1 text-[10.5px] text-muted">{when(m.at)}</Text></View>)}
          {busy && <View className="flex-row items-center gap-2 px-1"><ActivityIndicator size="small" color={look.accent} /><Text className="flex-1 text-[12px] text-muted">{status || words("Shubix is changing your Reel…")}</Text></View>}
          {review && !busy && (
            <View className="flex-row gap-2 self-start">
              <Pressable onPress={onKeep} accessibilityRole="button" className="overflow-hidden rounded-full px-4 py-2"><Gold /><Text className="text-[12.5px] font-semibold text-on-accent">{words("Keep")}</Text></Pressable>
              <Pressable onPress={onUndo} accessibilityRole="button" className="rounded-full border border-border px-4 py-2"><Text className="text-[12.5px] font-semibold text-foreground">{words("Undo")}</Text></Pressable>
            </View>
          )}
          {!!versions?.length && (
            <View className="gap-1.5 rounded-2xl border border-border bg-surface-2 p-3">
              <Pressable onPress={() => setOlder(!older)} accessibilityRole="button" accessibilityState={{ expanded: older }}><Text className="text-[12px] font-semibold text-accent">{words(older ? "Hide earlier versions" : "Earlier versions")} ({versions.length})</Text></Pressable>
              {older && [...versions].reverse().map((v, k) => { const i = versions.length - 1 - k; return (
                <View key={v.at} className="flex-row items-center gap-2">
                  <Text numberOfLines={1} className="flex-1 text-[12px] text-foreground">{v.label} · <Text className="text-muted">{when(v.at)}</Text></Text>
                  <Pressable onPress={() => onVersion?.(i)} disabled={busy} accessibilityRole="button" className="rounded-full border border-accent/40 px-3 py-1"><Text className="text-[11.5px] font-semibold text-accent">{words("Use this")}</Text></Pressable>
                </View>); })}
            </View>
          )}
          {log.some((m) => !m.me) && <Pressable onPress={() => router.push({ pathname: "/contact", params: { topic: "reels", message: `${words("Report an AI answer")}: ` } })} accessibilityRole="link" className="self-end py-1"><Text className="text-[12px] font-semibold text-muted underline">{words("Report an AI answer")}</Text></Pressable>}
          {said.startsWith("/") && (() => {
            // Ask Shubix's commands (the website's "/" menu, Shared/core chatCommands.ts): a command, then its choices; a choice writes its sentence
            const r = commandsFor(said), list = r.cmd ? choicesFor(r.cmd, said).map((c) => ({ key: c.label, label: c.label, hint: c.hint, go: () => setSaid(c.say) }))
              : r.list.map((c) => ({ key: c.cmd, label: c.cmd, hint: `${c.title} · ${c.hint}`, go: () => setSaid(c.cmd + " ") }));
            return list.length ? (
              <View className="max-h-[280px] overflow-hidden rounded-2xl border border-border bg-surface-2">
                {r.cmd && <Text className="px-3.5 pb-0.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-[1px] text-muted">{words(r.cmd.title)}: {words("pick one")}</Text>}
                <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {list.map((it) => (
                    <Pressable key={it.key} onPress={it.go} accessibilityRole="button" className="px-3.5 py-2.5 active:bg-accent/10">
                      <Text className="text-[13.5px] font-bold text-foreground">{r.cmd ? words(it.label) : it.label}</Text>
                      {!!it.hint && <Text className="text-[12px] leading-[16px] text-muted">{words(it.hint)}</Text>}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null;
          })()}
          <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface-2 pl-3.5 pr-1.5">
            <TextInput value={said} onChangeText={setSaid} onSubmitEditing={() => void ask(said)} returnKeyType="send" maxLength={300} placeholder={words("e.g. Fast cuts, or type / for commands")} placeholderTextColor={look.muted} className="h-11 flex-1 text-[14px] text-foreground" />
            <Pressable onPress={() => void ask(said)} disabled={!said.trim() || busy} accessibilityLabel={words("Ask Shubix")} className={`h-9 w-9 items-center justify-center overflow-hidden rounded-full ${!said.trim() || busy ? "opacity-40" : ""}`}><Gold /><Icon name="arrow" size={17} color="onAccent" /></Pressable>
          </View>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className="text-[12px] text-muted">{words("Try:")}</Text>
            <ChatChip label={words("/ Commands")} onPress={() => setSaid("/")} />
            {IDEAS.map(([label, say]) => <ChatChip key={label} label={words(label)} onPress={() => void ask(words(say))} />)}
          </View>
        </View>
      )}
    </View>
  );
}

/** What the phone can do from your words itself (the website's chatLocal, when Shubix AI is not on): the Fast or the
 * Smooth style. Returns which it used ("" when none). */
export function styleFromWords(text: string): "fast" | "smooth" | "" {
  const x = text.toLowerCase(), has = (...w: string[]) => w.some((k) => x.includes(k));
  if (has("faster", "fast", "energetic", "energy", "jalad", "जलद", "speed up", "quick")) return "fast";
  if (has("calm", "slow", "smooth", "cinematic", "halu", "हळू", "shant", "शांत")) return "smooth";
  return "";
}
