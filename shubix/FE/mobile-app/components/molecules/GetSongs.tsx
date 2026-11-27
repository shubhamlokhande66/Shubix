import { useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { mobileApi } from "../../lib/api";
import { useStudioText } from "@mobile/hooks";
import { Button, IconButton } from "@mobile/ui-mobile";

/** Get songs (the website's #songsites): where to find a song, each opened outside the app (the browser, or the
 * Instagram app for Instagram). Shubix downloads nothing: the song is saved on the phone and picked with Add your song. */
export function GetSongs({ disabled }: { disabled?: boolean }) {
  const words = useStudioText(), [open, setOpen] = useState(false);
  // the places (Admin → Songs → Song sites): their names and notes are the administrator's
  const list = useQuery({ queryKey: ["song-sites"], queryFn: mobileApi.songSites, enabled: open, staleTime: 10 * 60_000 });
  const sites = (list.data?.sites ?? []).filter((s) => /^https:\/\//.test(s.url));
  return (
    <>
      <Button full variant="secondary" icon="download" disabled={disabled} title={words("Get songs")} onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable className="flex-1 items-center justify-center bg-black/70 px-4" onPress={() => setOpen(false)} accessibilityLabel={words("Close")}>
          <Pressable className="max-h-[85%] w-full max-w-[480px] rounded-[28px] border border-accent/30 bg-surface p-5" onPress={() => undefined}>
            <View className="mb-3 flex-row items-center justify-between">
              <Text accessibilityRole="header" className="text-[18px] font-semibold text-foreground">{words("Get songs")}</Text>
              <IconButton icon="close" label={words("Close")} size={34} onPress={() => setOpen(false)} />
            </View>
            <ScrollView contentContainerClassName="gap-2">
              {list.isLoading && <ActivityIndicator className="py-4" />}
              {list.isError && <Text className="text-[13px] text-muted">{words("Could not load the list. Check your connection and try again.")}</Text>}
              {list.data && !sites.length && <Text className="text-[13px] text-muted">{words("No places to get songs yet.")}</Text>}
              {sites.map((s) => (
                <Pressable key={s.id} accessibilityRole="link" onPress={() => { setOpen(false); void Linking.openURL(s.url); }} className="gap-0.5 rounded-2xl border border-border bg-surface-2 px-4 py-3 active:border-accent active:bg-accent/10">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[15px] font-semibold text-foreground">{s.name}</Text>
                    <Text className={`rounded-full px-2 py-0.5 text-[11px] ${s.free ? "bg-accent/15 text-accent" : "bg-border text-muted"}`}>{words(s.free ? "Free to use" : "Trending")}</Text>
                  </View>
                  {!!s.note && <Text className="text-[12.5px] leading-[18px] text-muted">{s.note}</Text>}
                </Pressable>
              ))}
              <Text className="mt-1 text-[12.5px] leading-[18px] text-muted">{words("The page opens in a new tab. Download the song to your device, come back to Shubix and tap Add your song.")}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
