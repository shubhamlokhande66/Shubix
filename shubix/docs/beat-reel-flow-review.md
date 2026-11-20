# Beat Reel flow review with ChatGPT (2026-11-20)
ChatGPT chat: https://chatgpt.com/c/6b00374a-cba8-83e8-8914-1be94b3b0080 ("Review Beat Reel Flow")

## Found in code (me)
- Default "In my order": each clip = 1 shot (cuts inside a clip merged) -> 6 clips = 6 shots on a 22 s fast song.
- In my order: seqPick ignores the AI's clip/moment choice; "See every shot" still lists the AI's picks (clip 5 @4.2s...) -> list may not match the Reel. (verify on a Reel)
- "Start new" on the draft popup deletes the old draft (AsyncStorage.removeItem) -> data loss fear is real.
- Adjust music: tap waveform plays the part (exists). Song screen: no play.
- Song picker accepts a video's sound ("any video's sound") but no explicit WhatsApp/saved Reel button for Beat Reel.

## Part A (Home -> song) ChatGPT
Critical: explain getting the song from WhatsApp / a saved video; show song analysis status (finding beats, drops, parts, done); never silently cut a long song to 30 s (say it, preview, "Change section").
High: play the song on the song screen; "Match my clips" (Recommended) toggle, unlocks 15/30/60 when off, show resulting duration; draft safety ("Start new" must not lose the old one).
Medium: Home one-line value ("Turn your clips and favourite song into an edited Reel automatically"); "Editor" badge -> "Your plan"; recent songs: play, rename, readable names.
Wording: intro "Bring your song and video clips. Shubix will find the best moments, match your edits to the music and create your Reel."

## Part B (Clips screen) ChatGPT
Critical: In my order = keep clip order, but several beat cuts inside a long clip (its best moments, in time order), every clip once before repeats; ONE authoritative shot plan: Ask Shubix lists what the Reel really shows (In my order: AI plan obeys order); replace 15 boxes with "Your Reel needs about 15 shots · 6 clips added · good start" (clips != shots).
High: clip cards Adding -> Finding the best moments -> Ready to edit · Best moment 0:04 (no scores); failed: "Couldn't read this video - try another / MP4/MOV" + Remove; settings visible = Clip order (with 1-line explanations), Format, Opening text; More options = Pauses, Music under voice, Match my clips; picker: "selection numbers = order (Mix may rearrange)", "up to 30", formats per tab; credits: "Creation cost 10 credits · Balance 62", when charged, failure = no charge.
Medium: one Ask Shubix brief shown on step 2 with Edit (not a 2nd empty box); "Adjust music" -> "Change song / music".
Principles: clips != shots; analysis = finding opportunities, not grading; never silently change user intent.

## Part C (Make Reel -> editor) ChatGPT
Critical: preflight BEFORE Make Reel (unreadable clips shown on the card + "1 clip needs attention"; not enough footage asked before; clips longer than song = NO question, pick best moments in the chosen order and say "Your song is 22 s, you gave 1:41, Shubix picks the best moments"); new version after changes ALWAYS asks ("Create a new version? Previous Reel saved in My Reels · 10 credits · balance 62" [Create new Reel · 10 credits] [Go back]); credits reserve -> charge on success -> release on fail/stop, one job id, retry never charges twice, phone-only edit = no credits; cancel rules told BEFORE start (no surprise "can't cancel now"); don't read clips twice (C3 wait).
High: progress = named stages (Finding best moments / Planning shots / Transitions & effects / Building) + real % only, show REAL discoveries ("Best moment found in clip 2" with thumbnails); one calm line "You can switch apps while Shubix makes your Reel" (no alternating credit-loss warning); error: "Your song and clips are safe. No credits were charged." [Retry] [Back to clips]; AI unreachable: "Shubix AI was unavailable, your Reel was made on your phone"; login: say project is kept; Free edit explained (AI vs phone).
Medium: notification "Your Reel is ready! Tap to preview and make changes"; My Reels always has the finished Reel; editor autoplay - consider volume.

## Part D (editor, Ask Shubix, export) ChatGPT
Critical/High: Simple editor by default (preview + "6 shots · 22 s" strip + Change song part / Swap a shot / Add text / Export + Ask Shubix), "All tools" for pros, remember choice; shot list in plain words with thumbnails ("1. Couple under the sparklers · Opening shot · quick camera move · from your wedding video"), technical details behind a toggle, and only what the Reel REALLY shows; chat change = non-blocking, before/after, Keep / Undo; charge only on Keep (reserve before) [I disagree, see below]; New mix -> "Try another mix · same song and clips · free · current version stays saved", must really differ; plan-locked features warned when applied, not at export ("Some effects aren't in your plan [See plans] [Export without them]"); music rights note first export ("Instagram may mute music not cleared... export without song and add it in Instagram") [Export with song] [Export without song]; vague "a part may not look right" -> name the shot or drop it; drafts are on this phone, exported Reels online (say so; warn on logout).
Medium: shot action labels ("Show an earlier moment", "Keep more of this moment", "Remove this shot"); export can continue in background?; Share as main action after export; start preview muted/respect preference.

## Final round (my pushback accepted by ChatGPT)
- Credits for chat changes: free changes (admin) first; paid change charged on SUCCESS; refund if failed or nothing changed; Undo never refunds. Popup says so.
- Preview plays WITH sound at media volume, clear mute, remember choice.
- ONE editor screen: preview + shot strip + Change song part / Swap a shot / Add text / Export + Ask Shubix + "All tools" expands the same editor; Undo/Redo always visible.
- Ask before a new Reel only when it costs credits.
- In my order rule: clip order kept, forward in time, each clip its share of time; keep beat cuts when distinct usable footage; minimum shot length by song: fast 0.8-1.0 s, normal 1.0-1.5, slow 1.5-2.5; no gap/black between shots (min length, not a gap); merge near-identical adjacent cuts; don't split one continuous action (entry, garland) - a scene change justifies a cut, a beat alone does not; AI moments used when they fit; list = rendered shots.

## Ranked 15 (top 5 first)
1 In my order engine (L) 2 One true shot plan (L) 3 Credit transparency (M) 4 Preflight before Make Reel (M) 5 One-screen simple editor (M)
6 Ask Shubix review flow (plain shot list, thumbnails, Keep/Undo) (L) 7 Versions never overwritten (M) 8 Reuse clip analysis + real progress (L) 9 Song import/preview/section (M) 10 Onboarding + draft safety (M) 11 Plan locks shown early (M) 12 Music rights + with/without song (S) 13 Phone drafts vs online exports (M) 14 Recovery/cancel (M) 15 Completion polish (S)
Ship together: A #1+#2+#6; B #3+#7+#14; C #4+#8; D #5+#6+#15; E #11+#12+#13; F #7+#10+#14.
