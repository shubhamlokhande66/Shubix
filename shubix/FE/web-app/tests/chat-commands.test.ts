import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHAT_COMMANDS, COMMAND_EFFECTS, COMMAND_TRANSITIONS, choicesFor, commandsFor } from "@shubix/core/lib/chatCommands";
import { parseDirectorVisualIntent } from "../components/studio/visualIntent";

// Ask Shubix's "/" commands: a choice's sentence does exactly that choice (the transition or the effect it names, on
// every clip), and every name is one the studio has, on the website and in the app.
const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");
const keysOf = (src: string, name: string) => {
  const s = src.indexOf(`const ${name} = {`), e = src.indexOf("};", s);
  return new Set([...src.slice(s, e).matchAll(/(?:^|[{,\s])'?([a-z0-9-]+)'?\s*:/g)].map((m) => m[1]));
};

describe("Ask Shubix commands", () => {
  it("each transition choice puts that transition on every clip", () => {
    for (const t of COMMAND_TRANSITIONS) {
      const say = CHAT_COMMANDS.find((c) => c.cmd === "/transition")!.choices.find((c) => c.label === t.label)!.say;
      expect(parseDirectorVisualIntent(say), say).toMatchObject({ transitionAll: true, transitionType: t.id });
      expect(parseDirectorVisualIntent(say).effectsAll).toBeFalsy();
    }
  });
  it("each effect choice puts that effect on every clip, never a transition", () => {
    for (const f of COMMAND_EFFECTS) {
      const say = CHAT_COMMANDS.find((c) => c.cmd === "/effect")!.choices.find((c) => c.label === f.label)!.say;
      expect(parseDirectorVisualIntent(say), say).toMatchObject({ effectsAll: true, effectType: f.id });
      expect(parseDirectorVisualIntent(say).transitionAll, say).toBeFalsy();
    }
  });
  it("the words people use for the panels", () => {
    expect(parseDirectorVisualIntent("all clips la 5 box transition lav")).toMatchObject({ transitionAll: true, transitionType: "panels" });
    expect(parseDirectorVisualIntent("use row panels on every clip")).toMatchObject({ transitionType: "hpanels" });
    expect(parseDirectorVisualIntent("sliding window transition on all clips")).toMatchObject({ transitionType: "window" });
  });
  it("every id is one the website and the app have", () => {
    for (const src of [read("../components/studio/engine.ts")]) {
      const tr = keysOf(src, "TR_NAME"), fx = keysOf(src, "FX_NAME");
      for (const t of COMMAND_TRANSITIONS) expect(tr.has(t.id), t.id).toBe(true);
      for (const f of COMMAND_EFFECTS) expect(fx.has(f.id), f.id).toBe(true);
    }
  });
  it('"/" lists the commands, a command its choices', () => {
    expect(commandsFor("/").list.length).toBe(CHAT_COMMANDS.length);
    expect(commandsFor("/tr").list.map((c) => c.cmd)).toEqual(["/transition"]);
    const r = commandsFor("/transition box");
    expect(r.cmd?.cmd).toBe("/transition");
    expect(choicesFor(r.cmd!, "/transition box").map((c) => c.label)).toContain("Box panels");
    expect(commandsFor("make it faster").list).toEqual([]);
  });
});
