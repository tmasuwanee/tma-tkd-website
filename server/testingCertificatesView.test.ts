import { describe, it, expect, afterEach } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const KEY = "tma_testing_certificates_v2";
const g = globalThis as any;
// The test runner compiles JSX the classic way (the site build uses the automatic runtime), so give it React.
g.React = React;
const load = async () => (await import("../client/src/components/admin/TestingCertificates")).default;

function withStorage(value: unknown) {
  g.localStorage = { getItem: (k: string) => (k === KEY && value ? JSON.stringify(value) : null), setItem() {}, removeItem() {} };
}

describe("Testing Certificates page (first render)", () => {
  afterEach(() => { delete g.localStorage; });

  it("renders the tabs, every belt button in TMA's order, and the look options, with no localStorage at all", async () => {
    const Page = await load();
    delete g.localStorage;
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("Testing Certificates");
    expect(html).toContain("One by one");
    expect(html).toContain("Paste a list");
    expect(html).toContain("1. Tap a belt");
    // belts appear in order
    const order = ["White", "Yellow", "Orange", "Green", "Purple", "Blue", "Brown", "Red", "High-Red", "Pre-Black", "Black", "Other"];
    let at = html.indexOf("1. Tap a belt");
    for (const b of order) {
      const next = html.indexOf(`</span>${b}`, at);
      expect(next, b).toBeGreaterThan(-1);
      at = next;
    }
    expect(html).toContain("No White belt students yet");
    expect(html).toContain("Pick a look");
    for (const look of ["Calligraphy", "Copperplate", "Brush", "Old English", "Classic serif"]) expect(html).toContain(look);
    expect(html).toContain("Print all 0 certificates");
  });

  it("opens the first belt that has students and lists them in that belt's table", async () => {
    const Page = await load();
    withStorage({
      testDate: "2026-11-19", layout: "portrait-a", style: "brush",
      rows: [
        { name: "Tyler Le", rank: "Yellow Belt", date: "2026-11-19" },
        { name: "Mia Park", rank: "Yellow Belt", date: "2026-11-19" },
        { name: "Alex Coronado Luna", rank: "1st Dan Black Belt Lvl 3", date: "2026-11-19" },
      ],
    });
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("Yellow belt students (2)");
    expect(html).toContain('value="Tyler Le"');
    expect(html).toContain('value="Mia Park"');
    expect(html).not.toContain('value="Alex Coronado Luna"');     // that is on the Black belt table
    expect(html).toContain("Yellow 2, Black 1");                    // the summary line
    expect(html).toContain("3</p>");                                // the big "students added" number
    expect(html).toContain("Remove all");
    expect(html).toContain('value="2026-11-19"');
  });

  it("a black belt student shows their Dan and Level, and the Dan and Level pickers", async () => {
    const Page = await load();
    withStorage({ testDate: "2026-11-19", rows: [{ name: "Alex Coronado Luna", rank: "2nd Dan Black Belt Lvl 4", date: "2026-11-19" }] });
    const html = renderToStaticMarkup(createElement(Page));
    expect(html).toContain("Black belt students (1)");
    expect(html).toContain("2nd Dan Black Belt Lvl 4");
    expect(html).toContain("1st Dan");
    expect(html).toContain("Level 5");
  });

  it("falls back cleanly when the saved data is garbage or from an unknown look", async () => {
    const Page = await load();
    g.localStorage = { getItem: () => "{not json", setItem() {}, removeItem() {} };
    expect(renderToStaticMarkup(createElement(Page))).toContain("1. Tap a belt");
    withStorage({ rows: [], style: "does-not-exist", testDate: "" });
    expect(renderToStaticMarkup(createElement(Page))).toContain("1. Tap a belt");
  });
});
