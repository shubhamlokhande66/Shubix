import { requireNativeView, requireOptionalNativeModule, type EventSubscription } from "expo";

/** The phone's video engine (android/…/ShubixVideoModule.kt). null where it is not in the app: Expo Go and the web. */
type Engine = {
  exportReel(spec: string): Promise<{ uri: string; size: number; duration: number }>;
  reverseCopy(uri: string, start: number, end: number): Promise<string>;
  /** a slowed part of a clip as its own silent file at the Reel's speed, each picture between two real frames the two mixed
   * (Smooth slow-mo, SmoothCopy.kt); `ramp` its speed ramp as JSON ("" none). "" back: nothing in it is slowed */
  smoothCopy?(uri: string, start: number, end: number, speed: number, ramp: string, fps: number, side: number): Promise<string>;
  cancel(): Promise<void>;
  /** Ask Shubix by voice: what the person said, as text, in `lang` (hi-IN, mr-IN, en-IN); "" when nothing was heard */
  listen?(lang: string): Promise<string>;
  stopListening?(): Promise<void>;
  /** why Android closed the app after `since` (ms): JSON [{ at, reason, description, pss, rss, trace }] */
  lastExits?(since: number): string;
  keepAwake?(on: boolean, title: string): void;
  /** the tiny web server on the phone (127.0.0.1): it serves the engine page from the APK, reads the app's files for it,
   * takes the Reel back and passes its calls on to `api` */
  fileServer(api: string): { port: number; key: string };
  addListener(event: "onProgress", fn: (e: { progress: number }) => void): EventSubscription;
};
export const ShubixVideo = requireOptionalNativeModule<Engine>("ShubixVideo");

/** The Reel playing live (android/…/ShubixPreviewView.kt): the same picture the export makes. Its ref loads a Reel (the
 * export's spec, without `output`) at a time, then plays, pauses and seeks; it tells the time ten times a second. */
export type PreviewRef = {
  load(spec: string, at: number): Promise<number>;
  play(): Promise<void>; pause(): Promise<void>; seek(at: number): Promise<void>; setMuted(muted: boolean): Promise<void>; release(): Promise<void>;
};
export type PreviewProps = {
  style?: import("react-native").StyleProp<import("react-native").ViewStyle>;
  onTime?: (e: { nativeEvent: { time: number; playing: boolean } }) => void;
  onEnded?: () => void;
  onError?: (e: { nativeEvent: { message: string } }) => void;
  ref?: import("react").Ref<PreviewRef>;
};
export const ShubixPreviewView: import("react").ComponentType<PreviewProps> | null = ShubixVideo ? requireNativeView<PreviewProps>("ShubixVideo") : null;
