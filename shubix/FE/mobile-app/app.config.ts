import type { ConfigContext, ExpoConfig } from "expo/config";

/** app.json plus what comes from the build: the AdMob app ids (AdMob → Apps → App settings). They are built into the
 * app; without them it uses Google's sample app ids, which show test ads only. The banner ad units are set by the
 * administrator (Admin → Settings → Ads) and read at run time. */
const GOOGLE_TEST_APP = { android: "ca-app-pub-3940256099942544~3347511713", ios: "ca-app-pub-3940256099942544~1458002511" };

/** Kept by R8 in release builds: Room's generated databases (found by name), ONNX Runtime's JNI classes and the
 * Shubix video module (Expo finds its modules and views by name). */
const PROGUARD = `
-keep class * extends androidx.room.RoomDatabase { <init>(); }
-keep class androidx.work.impl.WorkDatabase_Impl { *; }
-keep class androidx.work.** { *; }
-keep class ai.onnxruntime.** { *; }
-keep class expo.modules.shubixvideo.** { *; }
`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  plugins: [
    ...(config.plugins ?? []),
    ["react-native-google-mobile-ads", {
      androidAppId: process.env.ADMOB_ANDROID_APP_ID || GOOGLE_TEST_APP.android,
      iosAppId: process.env.ADMOB_IOS_APP_ID || GOOGLE_TEST_APP.ios,
      delayAppMeasurementInit: true, // nothing is measured before the consent answer (lib/ads.ts)
    }],
    // R8 shrinks and obfuscates release builds (Play Console flags DEX obfuscation under 25%). It once removed
    // WorkManager's database class, which Room finds by name (the app closed at start), so that class is kept, and
    // so are the classes reached from native code (ONNX Runtime, the Shubix video module).
    ["expo-build-properties", { android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true, extraProguardRules: PROGUARD } }],
    "./plugins/with-local-engine", // the hidden engine page on http://127.0.0.1 (only that address)
    "./plugins/with-upload-key", // the Play upload key in release builds (plugins/with-upload-key.js)
  ],
});
