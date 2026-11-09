import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const at = vi.hoisted(() => ({ path: "/projects", me: { authEnabled: true, user: { id: "u", email: "me@example.com" } } as unknown }));
vi.mock("next/navigation", () => ({ usePathname: () => at.path, useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const admin = vi.hoisted(() => ({ value: false }));
const features = vi.hoisted(() => ({ value: { fastStudio: true, studioAI: true, brands: true } as Record<string, boolean> }));
vi.mock("@/hooks/useApi", async () => {
  const { defaultText } = await import("./helpers/texts");
  const { DEFAULT_ACCESS } = await import("@shubix/core/lib/access");
  return {
    useText: () => defaultText,
    useLockCheck: () => () => "",
    useAdmin: () => ({ admin: admin.value, required: true, loading: false }),
    useMe: () => ({ data: at.me }),
    useCredits: () => ({ data: { enabled: false } }),
    useFeatures: () => features.value,
    useAccess: () => ({ ...DEFAULT_ACCESS, googleReady: false }),
  };
});

vi.mock("@/lib/usePresence", () => ({ usePresence: () => {} }));

import { AppShell } from "@/components/templates/AppShell";

function renderShell() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell><p>content</p></AppShell>
    </QueryClientProvider>,
  );
  return within(screen.getByRole("navigation", { name: "Main" }));
}

beforeEach(() => { admin.value = false; at.path = "/projects"; at.me = { authEnabled: true, user: { id: "u", email: "me@example.com" } }; });

describe("AppShell: pages open before anyone is known", () => {
  it("shows Home and the guides at once, also as Vercel's server names Home (/index)", () => {
    at.me = undefined;
    for (const path of ["/", "/index", "/guides", "/guides/beat-synced-reel"]) {
      at.path = path;
      const { unmount } = render(<QueryClientProvider client={new QueryClient()}><AppShell><p>content</p></AppShell></QueryClientProvider>);
      expect(screen.getByText("content")).toBeInTheDocument();
      unmount();
    }
    at.path = "/reels";
    render(<QueryClientProvider client={new QueryClient()}><AppShell><p>content</p></AppShell></QueryClientProvider>);
    expect(screen.queryByText("content")).toBeNull(); // the app's own pages wait for the sign-in
  });
});

describe("AppShell navigation", () => {
  it("shows people the product: the ways to make a Reel, My Reels, templates and brands", () => {
    const nav = renderShell();
    for (const [name, href] of [["Beat Reel", "/create/music"], ["Talking Reel", "/create/talking"], ["Photo Reel", "/create/photo"], ["My Reels", "/reels"], ["Templates", "/templates"], ["Brands", "/brands"]]) {
      expect(nav.getByRole("link", { name: new RegExp(name) })).toHaveAttribute("href", href);
    }
    expect(screen.getAllByText("me@example.com").length).toBeGreaterThan(0); // the sidebar and the phone menu
  });

  it("gives the phone menu the sidebar's groups, Pricing & plans too", () => {
    renderShell();
    const menu = within(screen.getByRole("navigation", { name: "Pages", hidden: true }));
    for (const g of ["Studio", "Library", "Account"]) expect(menu.getByText(g)).toBeInTheDocument();
    expect(menu.getByRole("link", { name: /Pricing & plans/, hidden: true })).toHaveAttribute("href", "/pricing");
  });

  it("shows no admin tools and no Admin dashboard button to people", () => {
    const nav = renderShell();
    for (const name of ["AI Edit", "Beat Sync check", "Chat", "AI settings"]) expect(nav.queryByRole("link", { name: new RegExp(name) })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Admin dashboard/ })).toBeNull();
  });

  it("gives an administrator one Admin dashboard button (the tools live in the dashboard)", () => {
    admin.value = true;
    const nav = renderShell();
    expect(nav.queryByRole("link", { name: /AI Edit/ })).toBeNull();
    for (const link of screen.getAllByRole("link", { name: /Admin dashboard/ })) expect(link).toHaveAttribute("href", "/admin"); // the sidebar and the phone menu
  });
});

describe("AppShell: the Create flow in the menu", () => {
  it("lists Music, Talking and Photo Reel instead of Fast Studio, and no Story Maker", () => {
    const nav = renderShell();
    expect(nav.queryByRole("link", { name: /Fast Studio/ })).toBeNull();
    expect(nav.queryByRole("link", { name: /Story Maker/ })).toBeNull();
  });

});

describe("AppShell: parts the administrator turned off", () => {
  it("leaves them out of the menu", () => {
    features.value = { ...features.value, brands: false };
    renderShell();
    const nav = screen.getAllByRole("navigation", { name: "Main" })[0];
    expect(within(nav).queryByRole("link", { name: /Brands/ })).toBeNull();
    expect(within(nav).getByRole("link", { name: /Templates/ })).toBeInTheDocument();
    features.value = { ...features.value, brands: true };
  });
});

describe("AppShell: Back on every page", () => {
  it("shows Back beside the menu on every page but Home", () => {
    at.path = "/pricing";
    render(<QueryClientProvider client={new QueryClient()}><AppShell><p>content</p></AppShell></QueryClientProvider>);
    expect(screen.getAllByRole("button", { name: "Back" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /menu/i }).length).toBeGreaterThan(0);
  });
  it("has no Back on Home", () => {
    at.path = "/";
    render(<QueryClientProvider client={new QueryClient()}><AppShell><p>content</p></AppShell></QueryClientProvider>);
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  });
});
