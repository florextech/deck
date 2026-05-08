import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeckAction } from "@open-deck/shared";

const configPath = resolve(__dirname, "../deck.config.json");

describe("deck.config.json", () => {
  it("is valid JSON with actions array", () => {
    const raw = readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw) as { actions: DeckAction[] };
    expect(Array.isArray(config.actions)).toBe(true);
    expect(config.actions.length).toBeGreaterThan(0);
  });

  it("each action has required fields", () => {
    const raw = readFileSync(configPath, "utf-8");
    const { actions } = JSON.parse(raw) as { actions: DeckAction[] };
    for (const action of actions) {
      expect(action.id).toBeDefined();
      expect(action.label).toBeDefined();
      expect(action.type).toBeDefined();
      expect(["url", "copy", "command"]).toContain(action.type);
      expect(action.payload).toBeDefined();
      expect(action.payload.type).toBe(action.type);
    }
  });

  it("payload matches type", () => {
    const raw = readFileSync(configPath, "utf-8");
    const { actions } = JSON.parse(raw) as { actions: DeckAction[] };
    for (const action of actions) {
      if (action.payload.type === "url") expect(action.payload.url).toBeDefined();
      if (action.payload.type === "copy") expect(action.payload.text).toBeDefined();
      if (action.payload.type === "command") expect(action.payload.command).toBeDefined();
    }
  });
});

describe("index.html", () => {
  it("exists and contains socket.io", () => {
    const html = readFileSync(resolve(__dirname, "../apps/server/public/index.html"), "utf-8");
    expect(html).toContain("socket.io");
    expect(html).toContain("lucide");
  });

  it("contains i18n translations", () => {
    const html = readFileSync(resolve(__dirname, "../apps/server/public/index.html"), "utf-8");
    expect(html).toContain("const i18n");
    expect(html).toContain("es:");
    expect(html).toContain("en:");
  });

  it("contains all themes", () => {
    const html = readFileSync(resolve(__dirname, "../apps/server/public/index.html"), "utf-8");
    expect(html).toContain("midnight");
    expect(html).toContain("ocean");
    expect(html).toContain("ember");
    expect(html).toContain("forest");
    expect(html).toContain("rose");
    expect(html).toContain("ice");
    expect(html).toContain("gold");
    expect(html).toContain("crimson");
  });
});
