import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DeckAction } from "@open-deck/shared";

describe("deck.config.json", () => {
  const configPath = resolve(__dirname, "../deck.config.json");

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
      expect(action.payload).toBeDefined();
      expect(action.payload.type).toBeDefined();
    }
  });
});
