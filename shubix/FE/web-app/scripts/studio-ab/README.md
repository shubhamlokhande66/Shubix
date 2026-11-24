# Blind A/B: is the new engine better?

The rebuild test says where Shubix puts shots a human had already kept. It cannot say that a Reel looks better. This does:
a person watches two Reels of the same clips and song, not knowing which engine made which, and chooses.

1. Keep 30 packs of raw clips (8 to 15 ordinary phone clips each) and a song per pack, outside the repository.
2. Make each pack's Reel with the old engine and with the new one: the same song, length, style and size, no change by
   hand. Name them `pack1.old.mp4` and `pack1.new.mp4`, in one folder.
3. `node serve.mjs`, open http://localhost:4567, write your name, choose the folder. Nothing is uploaded.
4. Save the result. A closed page goes on where it was.

Both Reels must be watched to the end before a vote. The new one is A in half of the pairs; which half is not shown.
**It passes at 20 of 30** (chance does that under 5% of the time); "No difference" is not a win, and fewer than 30 pairs
decide nothing. One person's result is that person's taste: ask someone who did not make the change.
