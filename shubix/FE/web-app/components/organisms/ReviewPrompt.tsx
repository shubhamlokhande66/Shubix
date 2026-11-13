"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, TextArea } from "@/components/atoms";
import { useMe } from "@/hooks/useApi";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

/** After a Reel is exported (the studio sends "shubix:reel-exported" with its id), ask once for that Reel: stars, a
 * comment (Home shows it once an admin approves it), and what to improve (for the team only). Signed-in people only;
 * a Reel asked about (sent or skipped) is not asked again on this device. */

export const REEL_EXPORTED = "shubix:reel-exported";
const KEY = (id: string) => `review-asked:${id}`;
const asked = (id: string) => { try { return localStorage.getItem(KEY(id)) === "1"; } catch { return false; } };
const markAsked = (id: string) => { try { localStorage.setItem(KEY(id), "1"); if (localStorage.getItem(PENDING) === id) localStorage.removeItem(PENDING); } catch { /* private mode: asked again next time */ } };
// the Reel exported but not asked about yet (downloaded, then the tab or the app closed): asked on the next visit
const PENDING = "review-pending";
const setPending = (id: string) => { try { localStorage.setItem(PENDING, id); } catch { /* private mode */ } };
const pending = () => { try { return localStorage.getItem(PENDING) ?? ""; } catch { return ""; } };
const LABEL = ["", "Bad", "Not great", "Okay", "Good", "Loved it"];

export function Stars({ value, size = 18 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5 text-gold" aria-label={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} on={n <= value} size={size} />)}
    </span>
  );
}
function Star({ on, size }: { on: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
    </svg>
  );
}

export function ReviewPrompt() {
  const me = useMe();
  const signedIn = !!me.data?.user;
  const [reelId, setReelId] = useState<string | null>(null);
  const [rating, setRating] = useState(0), [comment, setComment] = useState(""), [improvement, setImprovement] = useState("");
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!signedIn) return;
    const onDone = (e: Event) => {
      const id = String((e as CustomEvent<{ reelId?: string }>).detail?.reelId ?? "");
      // the phone app's hidden studio (/engine) is never seen: no pop-up there
      if (!/^[A-Za-z0-9_-]{4,40}$/.test(id) || asked(id) || window.location.pathname.startsWith("/engine")) return;
      setPending(id);
      window.clearTimeout(timer.current);
      // a moment first: the finished Reel and its download/share come up before this
      timer.current = window.setTimeout(() => { setRating(0); setComment(""); setImprovement(""); setDone(false); setError(""); setReelId(id); }, 2500);
    };
    window.addEventListener(REEL_EXPORTED, onDone);
    // a Reel exported last time and never asked about (the page closed before the question came): asked now, after a
    // moment, on any page but the studio's own engine
    const left = pending();
    if (left && /^[A-Za-z0-9_-]{4,40}$/.test(left) && !asked(left) && !window.location.pathname.startsWith("/engine"))
      timer.current = window.setTimeout(() => { setRating(0); setComment(""); setImprovement(""); setDone(false); setError(""); setReelId(left); }, 2500);
    return () => { window.removeEventListener(REEL_EXPORTED, onDone); window.clearTimeout(timer.current); };
  }, [signedIn]);

  const close = useCallback(() => { if (reelId) markAsked(reelId); setReelId(null); }, [reelId]);
  useEffect(() => {
    if (!reelId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reelId, close]);

  if (!reelId) return null;
  const send = async () => {
    if (!rating) { setError("Tap the stars first."); return; }
    setBusy(true); setError("");
    try {
      await api.sendReview({ reelId, rating, comment: comment.trim(), improvement: improvement.trim() });
      markAsked(reelId); setDone(true);
      window.setTimeout(() => setReelId(null), 1600);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div data-popup className="fixed inset-0 z-[90] grid place-items-end bg-[var(--overlay)] p-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:place-items-center" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-32px)] w-full max-w-md animate-pop flex-col gap-3 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        {done ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <Stars value={rating} size={26} />
            <b className="text-[17px]">Thank you!</b>
            <p className="m-0 text-[13px] text-muted">Your review helps us make Shubix better.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <b id="review-title" className="text-[17px] leading-snug">How was your Reel?</b>
                <p className="m-0 mt-0.5 text-[12.5px] text-muted">Rate this Reel and tell us what you think.</p>
              </div>
              <button type="button" onClick={close} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-foreground">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="flex flex-col items-center gap-1 py-1" role="radiogroup" aria-label="Your rating">
              <div className="flex gap-1 text-gold">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => { setRating(n); setError(""); }}
                    className={cn("grid h-11 w-11 place-items-center rounded-full transition-transform hover:scale-110", n <= rating ? "" : "text-muted")}>
                    <Star on={n <= rating} size={30} />
                  </button>
                ))}
              </div>
              <span className="h-4 text-[12px] font-bold text-muted">{LABEL[rating]}</span>
            </div>
            <label className="flex flex-col gap-1 text-[12.5px] font-bold">
              Your review
              <TextArea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} placeholder="What did you like about Shubix?" />
              <span className="font-normal text-muted">We may show it on our Home page with your first name.</span>
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] font-bold">
              What should we improve?
              <TextArea value={improvement} onChange={(e) => setImprovement(e.target.value)} maxLength={1000} rows={3} placeholder="Anything that was slow, missing or confusing" />
              <span className="font-normal text-muted">Only our team reads this.</span>
            </label>
            {error && <p role="alert" className="m-0 text-[12.5px] font-bold text-[var(--danger)]">{error}</p>}
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={close} disabled={busy}>Not now</Button>
              <Button className="flex-1" onClick={send} loading={busy}>Send review</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
