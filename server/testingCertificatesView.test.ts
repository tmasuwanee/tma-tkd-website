import { describe, it, expect, beforeEach, afterEach } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const KEY = "tma_testing_certificates_v1";
const g = globalThis as any;
// The test runner compiles JSX the classic way (the site build uses the automatic runtime), so give it React.
g.React = React;
const load = async () => (await import("../client/src/components/admin/TestingCertificates")).default;

function withStorage(value: unknown) {
  g.localStorage = { getItem: (k: string) => (k === KEY && value ? JSON.stringify(value) : null), setItem() {}, removeItem() {} };
}

describe("Testing Certificates page (first render)", () => {
  afterEach(() => { delete g.localStorage; });

  it("renders an empty state with no crash and no localStorage at all", async () => {
    const TestingCertificates = await load();
    delete g.localStorage;
    const html = renderToStaticMarkup(createElement(TestingCertificates));
    expect(html).toContain("Testing Certificates");
    expect(html).toContain("No students yet");
    expect(html).toContain("0</p>");
  });

  it("shows each saved student with its number, a page count, and the right buttons", async () => {
    const TestingCertificates = await load();
    withStorage({
      testDate: "2026-11-19", layout: "portrait-a",
      rows: [
        { name: "Tyler Le", rank: "Yellow Belt", date: "2026-11-19" },
        { name: "Alex Coronado Luna", rank: "1st Degree Black Belt", date: "2026-11-19" },
        { name: "Sam Ng", rank: "", date: "2026-11-19" },
      ],
    });
    const html = renderToStaticMarkup(createElement(TestingCertificates));
    expect(html).toContain("Students (3)");
    expect(html).toContain('value="Tyler Le"');
    expect(html).toContain('value="Alex Coronado Luna"');
    expect(html).toContain('text-[#1a2d5a]">2</p>');
    expect(html).toContain("certificates = 2 pages");      // Sam has no rank, so he is not counted
    expect(html).toContain("Needs a rank");
    expect(html).toContain("1 row still needs something");                // left out of the PDF, said plainly
    expect(html).toContain("Download all 2 certificates");
    expect(html).toContain("Alignment test sheet");
    expect(html).toContain("Preview the first one");
  });

  it("falls back cleanly when the saved data is garbage", async () => {
    const TestingCertificates = await load();
    g.localStorage = { getItem: () => "{not json", setItem() {}, removeItem() {} };
    expect(renderToStaticMarkup(createElement(TestingCertificates))).toContain("No students yet");
  });
});
