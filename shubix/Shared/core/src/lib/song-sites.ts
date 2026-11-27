/**
 * "Get songs": where Shubix sends a person for a song (the website and the Android app show the same list). Shubix
 * downloads nothing and keeps nothing: the person gets the song on their own device, comes back and picks it with
 * "Add your song". Only places that are allowed: free songs with a licence for Reels, or Instagram itself (its songs
 * are added in Instagram, where they are licensed: export "Without the song"). No downloader sites (Google Play
 * removes apps that lead to unlicensed downloads, and Instagram mutes such Reels).
 */
export type SongSite = {
  id: string;
  name: string;
  url: string;
  /** one line under its name */
  note: string;
  /** the songs here are free to use in Reels (else: only to find a trending one, added in Instagram) */
  free: boolean;
};

export const SONG_SITES: SongSite[] = [
  { id: "instagram", name: "Instagram trending", url: "https://www.instagram.com/reels/", free: false,
    note: "Find a trending song. Use your own copy of it here, then export \"Without the song\" and add the song in Instagram." },
  { id: "ytcharts", name: "YouTube trending songs", url: "https://charts.youtube.com/charts/TopSongs/in/weekly", free: false,
    note: "See what is trending this week in India. Add the song in Instagram after you export." },
  { id: "pixabay", name: "Pixabay Music", url: "https://pixabay.com/music/", free: true,
    note: "Free songs for Reels, no sign-in. Download, come back, tap Add your song." },
  { id: "uppbeat", name: "Uppbeat", url: "https://uppbeat.io/", free: true,
    note: "Free songs made for creators (free account)." },
  { id: "fma", name: "Free Music Archive", url: "https://freemusicarchive.org/", free: true,
    note: "Free songs by independent artists. Check each song's licence." },
  { id: "ytlibrary", name: "YouTube Audio Library", url: "https://studio.youtube.com/channel/UC/music", free: true,
    note: "Free songs and sounds (sign in with your YouTube channel)." },
];

/** the line the popup ends with */
export const SONG_SITES_HOW = "The page opens in a new tab. Download the song to your device, come back to Shubix and tap Add your song.";
