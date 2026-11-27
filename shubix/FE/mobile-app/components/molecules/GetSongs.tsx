import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SONG_SITES, SONG_SITES_HOW } from "@mobile/core/lib/song-sites";
import { useStudioText } from "@mobile/hooks";
import { Button, IconButton } from "@mobile/ui-mobile";

/** Get songs (the website's #songsites): where to find a song, each opened outside the app (the browser, or the
 * Instagram app for Instagram). Shubix downloads nothing: the song is saved on the phone and picked with Add your song. */
export function GetSongs({ disabled }: { disabled?: boolean }) {
  const words = useStudioText(), [open, setOpen] = useState(false);
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
              {SONG_SITES.map((s) => (
                <Pressable key={s.id} accessibilityRole="link" onPress={() => { setOpen(false); void Linking.openURL(s.url); }} className="gap-0.5 rounded-2xl border border-border bg-surface-2 px-4 py-3 active:opacity-80">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[15px] font-semibold text-foreground">{s.name}</Text>
                    <Text className={`rounded-full px-2 py-0.5 text-[11px] ${s.free ? "bg-accent/15 text-accent" : "bg-border text-muted"}`}>{words(s.free ? "Free to use" : "Trending")}</Text>
                  </View>
                  <Text className="text-[12.5px] leading-[18px] text-muted">{words(s.note)}</Text>
                </Pressable>
              ))}
              <Text className="mt-1 text-[12.5px] leading-[18px] text-muted">{words(SONG_SITES_HOW.replace("in a new tab", "outside Shubix"))}</Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
