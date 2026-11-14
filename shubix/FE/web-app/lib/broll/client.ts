/** Fast Studio's AI pictures (B-roll) on the website: /api/studio/broll in the shape the studio takes (`aiPicture` in
 * components/studio/engine.ts): its styles, and make → a JPEG file the studio puts on the Reel like any photo. */

export type AiPicture = {
  styles: { id: string; name: string }[];
  hd: boolean;
  make: (prompt: string, o: { style: string; aspect: string; hd?: boolean }) => Promise<{ file: File; charged: number }>;
};

/** The service, or null when this server makes no pictures (or cannot be reached quickly). */
export async function loadAiPicture(): Promise<AiPicture | null> {
  let info: { available?: boolean; hd?: boolean; styles?: { id: string; name: string }[] } = {};
  try {
    const r = await fetch("/api/studio/broll", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    info = await r.json();
  } catch { return null; }
  if (!info.available) return null;
  return {
    styles: info.styles ?? [],
    hd: !!info.hd,
    async make(prompt, o) {
      let r: Response | null = null;
      for (let n = 1; n <= 2; n++) {
        try { r = await fetch("/api/studio/broll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, style: o.style, aspect: o.aspect, hd: !!o.hd }) }); }
        catch { r = null; }
        if (r && r.status < 500) break;
        if (n < 2) await new Promise((ok) => setTimeout(ok, 2000));
      }
      if (!r) throw new Error("No connection. Check your internet and try again.");
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error?.message || (r.status === 402 ? "AI pictures are part of the Editor and Pro plans, or use credits." : `The picture could not be made (${r.status}). Please try again.`));
      const bytes = Uint8Array.from(atob(String(j.image).split(",")[1] ?? ""), (c) => c.charCodeAt(0));
      const name = "AI " + prompt.replace(/[^\p{L}\p{N} ]/gu, "").trim().slice(0, 40) + ".jpg";
      return { file: new File([bytes], name, { type: "image/jpeg", lastModified: Date.now() }), charged: Number(j.charged) || 0 };
    },
  };
}
