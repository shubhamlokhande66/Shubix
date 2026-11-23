import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ styleSuggestions: vi.fn(), learningLog: vi.fn(), useStyleSuggestion: vi.fn(), removeStyleSuggestion: vi.fn() }));
vi.mock("@/lib/api", async (orig) => ({ ...(await orig<typeof import("@/lib/api")>()), api }));

import TrendsPage from "@/app/trends/page";

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient()}><TrendsPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.styleSuggestions.mockResolvedValue({ total: 3, items: [] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ categories: { wedding: { shared: 22 } }, styles: [] }), { headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("My trends", () => {
  it("shows how many Reels of each kind Shubix learned", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: /^Wedding: 22 Reels learned\. Teach more$/ }, { timeout: 15000 })).toBeInTheDocument();
    expect(screen.getAllByText("Nothing learned yet").length).toBeGreaterThan(0);
  });

  it("Learn a new trend opens the many-Reels teacher", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("button", { name: /Learn a new trend/ }));
    expect(await screen.findByRole("dialog", { name: /Learn a new trend/ })).toBeInTheDocument();
  });
});
