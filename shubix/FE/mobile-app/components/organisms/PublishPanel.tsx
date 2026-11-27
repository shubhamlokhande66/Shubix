import { safeMessage } from "@mobile/utils";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { Badge, Button, Chip, Field, Icon, Input, SidePanel, TextArea, colors } from "@mobile/ui-mobile";
import { mobileApi, type SocialPlatform, type SocialPost } from "../../lib/api";

/**
 * Publish a saved Reel to the person's own Instagram (a Reel) and YouTube (a Short), as the website's
 * components/organisms/PublishDialog.tsx: now or at a time, with a caption Shubix AI can write; below, this Reel's posts
 * with their state and, once up, their views, likes and comments. An account is connected in the phone's browser (the
 * link carries who is connecting) and the browser comes back to the app (shubix://reels). While a post is being
 * published the panel asks again every 4 s (that also moves the work on).
 */

type Id = SocialPlatform["id"];
const NAME: Record<Id, string> = { youtube: "YouTube Shorts", instagram: "Instagram Reels" };
const STATUS: Record<SocialPost["status"], string> = { scheduled: "Scheduled", working: "Publishing…", published: "Published", failed: "Failed", cancelled: "Cancelled" };
const n = (x?: number) => (x === undefined ? "–" : x >= 1e6 ? `${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `${(x / 1e3).toFixed(1)}K` : String(x));
/** the times offered (no date picker on the phone): now, in an hour, this evening, tomorrow morning and evening */
function times(): { id: string; label: string; at: Date | null }[] {
  const at = (days: number, h: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(h, 0, 0, 0); return d; };
  const out: { id: string; label: string; at: Date | null }[] = [{ id: "now", label: "Now", at: null }, { id: "1h", label: "In 1 hour", at: new Date(Date.now() + 3600_000) }];
  if (new Date().getHours() < 19) out.push({ id: "eve", label: "Today 8 pm", at: at(0, 20) });
  out.push({ id: "tm", label: "Tomorrow 9 am", at: at(1, 9) }, { id: "te", label: "Tomorrow 8 pm", at: at(1, 20) });
  return out;
}

export function PublishPanel({ reel, onClose }: { reel: { id: string; name: string } | null; onClose: () => void }) {
  const [platforms, setPlatforms] = useState<SocialPlatform[] | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [pick, setPick] = useState<Id[]>([]);
  const [title, setTitle] = useState(reel?.name ?? "");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState("now");
  const [busy, setBusy] = useState<"" | "post" | "ai" | Id>("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (first = false) => {
    try {
      const s = await mobileApi.social();
      setPlatforms(s.platforms); setPosts(s.posts); setError(null);
      if (first) setPick(s.platforms.filter((p) => p.connected).map((p) => p.id));
    } catch (e) { setError(safeMessage(e instanceof Error ? e.message : "", "Shubix cannot be reached. Check your internet and try again.")); }
  }, []);
  useEffect(() => { if (reel) void load(true); }, [reel, load]);
  const mine = posts.filter((p) => reel && p.reelId === reel.id);
  const moving = mine.some((p) => p.status === "working" || (p.status === "scheduled" && new Date(p.at).getTime() <= Date.now() + 60_000));
  useEffect(() => { if (!reel || !moving) return; const t = setTimeout(() => void load(), 4000); return () => clearTimeout(t); }, [reel, moving, posts, load]);

  const run = async (what: typeof busy, work: () => Promise<void>) => {
    setBusy(what); setError(null);
    try { await work(); } catch (e) { setError(safeMessage(e instanceof Error ? e.message : "", "That did not work. Please try again.")); }
    setBusy("");
  };
  const connect = (p: Id) => run(p, async () => { await Linking.openURL((await mobileApi.socialConnectLink(p)).url); });
  const post = () => run("post", async () => {
    if (!reel) return;
    const t = times().find((x) => x.id === when)?.at ?? null;
    await mobileApi.publish({ reelId: reel.id, platforms: pick, caption, title, at: t ? t.toISOString() : null });
    await load();
  });
  const ai = () => run("ai", async () => {
    if (!reel) return;
    const r = await mobileApi.writeCaption([title, caption].filter(Boolean).join(". ").trim() || reel.name, pick[0] ?? "instagram");
    setTitle(r.title || title); setCaption(r.caption);
  });

  const connected = platforms?.filter((p) => p.connected) ?? [];
  return (
    <SidePanel open={!!reel} onClose={onClose} title="Publish" where={reel?.name} closeLabel="Close">
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {!platforms && !error && <ActivityIndicator color={colors.accent} />}
        {platforms?.map((p) => (
          <View key={p.id} className="flex-row items-center gap-2 rounded-2xl border border-border p-3">
            <Pressable className="min-w-0 flex-1 flex-row items-center gap-2.5" disabled={!p.connected} accessibilityRole="checkbox" accessibilityState={{ checked: pick.includes(p.id) }}
              onPress={() => setPick((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}>
              {p.connected && <View className={`h-5 w-5 items-center justify-center rounded-md border ${pick.includes(p.id) ? "border-accent bg-accent" : "border-border"}`}>{pick.includes(p.id) && <Icon name="check" size={13} color="#fff" />}</View>}
              <View className="min-w-0 flex-1">
                <Text className="text-[13.5px] font-bold text-foreground">{NAME[p.id]}</Text>
                <Text numberOfLines={1} className="text-[12px] text-muted">{p.connected ? `${p.name}${p.needsReconnect ? " · connect again" : ""}` : p.ready ? "Not connected" : "Not available yet"}</Text>
              </View>
            </Pressable>
            {p.ready && (!p.connected || p.needsReconnect) && <Button size="sm" title="Connect" loading={busy === p.id} disabled={!!busy} onPress={() => void connect(p.id)} />}
            {p.connected && !p.needsReconnect && <Button size="sm" variant="secondary" title="Disconnect" disabled={!!busy} onPress={() => void run(p.id, async () => { await mobileApi.socialDisconnect(p.id); await load(true); })} />}
          </View>
        ))}
        {platforms && !connected.length && <Text className="text-[12px] leading-[17px] text-muted">Instagram needs a Business or Creator account. YouTube posts it as a Short (vertical, up to 3 minutes). Connect opens your browser and comes back here.</Text>}

        {connected.length > 0 && (
          <View className="gap-3">
            <Field label="Title (YouTube)"><Input value={title} onChangeText={setTitle} maxLength={100} /></Field>
            <Field label="Caption"><TextArea value={caption} onChangeText={setCaption} maxLength={2200} placeholder="What is this Reel about? Hashtags at the end…" /></Field>
            <Button size="sm" variant="secondary" icon="sparkle" title="Write it with Shubix AI" loading={busy === "ai"} disabled={!!busy} onPress={() => void ai()} />
            <View className="flex-row flex-wrap gap-2">
              {times().map((t) => <Chip key={t.id} label={t.label} on={when === t.id} onPress={() => setWhen(t.id)} />)}
            </View>
            <Button icon="send" full title={when === "now" ? "Publish now" : "Schedule"} loading={busy === "post"} disabled={!!busy || !pick.length} onPress={() => void post()} />
          </View>
        )}

        {error && <Text className="text-[13px] text-danger">{error}</Text>}

        {mine.length > 0 && (
          <View className="gap-2">
            <Text className="text-[13.5px] font-bold text-foreground">This Reel&apos;s posts</Text>
            {mine.map((p) => (
              <View key={p.id} className="gap-1 rounded-2xl border border-border p-3">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-[13px] font-bold text-foreground">{NAME[p.platform]}</Text>
                  <Badge tone={p.status === "published" ? "success" : p.status === "failed" ? "danger" : "neutral"}>{STATUS[p.status]}</Badge>
                </View>
                {!!(p.status === "scheduled" ? `Goes out ${new Date(p.at).toLocaleString()}` : p.step || p.error) && <Text className="text-[12px] text-muted">{p.status === "scheduled" ? `Goes out ${new Date(p.at).toLocaleString()}` : p.step || p.error}</Text>}
                {p.stats && <Text className="text-[12.5px] text-foreground">{n(p.stats.views)} views · {n(p.stats.likes)} likes · {n(p.stats.comments)} comments</Text>}
                <View className="flex-row gap-4">
                  {!!p.url && <Text className="text-[12.5px] font-bold text-accent" onPress={() => void Linking.openURL(p.url)}>Open</Text>}
                  {p.status === "scheduled" && p.platform === "instagram" && <Text className="text-[12.5px] font-bold text-danger" onPress={() => void run("post", async () => { await mobileApi.cancelPost(p.id); await load(); })}>Cancel</Text>}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SidePanel>
  );
}
