// The Shubix logo with its name (Shared/ui-core/assets → public/brand, scripts/brand-assets.mjs): SHUBIX STUDIO in gold
// with the purple swoosh and play button (2026-11-13), as designed, on its clear ground. The browser tab uses the S emblem alone.
export const LOGO_RATIO = 2.65;   // width / height of the logo picture
/* eslint-disable @next/next/no-img-element -- a small static picture; no image optimisation needed */
export function Logo({ height = 40, className = "" }: { height?: number; className?: string }) {
  return (
    <img
      src={height > 60 ? "/brand/shubix-studio.webp" : "/brand/shubix-studio-sm.webp"}
      alt="Shubix · Reels video studio"
      height={height}
      width={Math.round(height * LOGO_RATIO)}
      className={`block select-none ${className}`}
      style={{ height, width: "auto", maxWidth: "100%", objectFit: "contain" }}
      draggable={false}
    />
  );
}

/** The logo on its own dark tile, for a page of its own (sign-in, Contact) in the light look too. */
export function LogoTile({ height = 64 }: { height?: number }) {
  return (
    <span className="inline-flex rounded-2xl bg-[#10100f] px-4 py-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,.6)]">
      <Logo height={height} />
    </span>
  );
}
