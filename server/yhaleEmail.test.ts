import { describe, it, expect, vi, beforeEach } from "vitest";

// YHALE registrations belong to Master Jo: the email must go to his inbox only,
// never to the TMA Suwanee staff address.
describe("sendYhaleRegistration", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.RESEND_API_KEY = "re_test_key";
    delete process.env.YHALE_NOTIFY_EMAIL;
    delete process.env.LEAD_NOTIFICATION_EMAIL;
  });

  it("sends only to Master Jo, replies go to the parent, and user text is escaped", async () => {
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ id: "x" }), text: async () => "" };
    }));
    const { sendYhaleRegistration } = await import("./integrations");
    await sendYhaleRegistration({
      id: 1, parentName: "Pat <b>Lee</b>", kidName: "Sam Lee", kidAge: "Grade 2",
      programInterest: "YHALE Taekwondo Enrichment", email: "pat@example.com", phone: "5551234567",
      additionalNotes: "Line one\nLine two", createdAt: new Date(),
    } as any);
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("tkdtma@gmail.com");
    expect(JSON.stringify(calls[0])).not.toMatch(/tmasuwanee@gmail\.com/);
    expect(calls[0].reply_to).toBe("pat@example.com");
    expect(calls[0].subject).toContain("Sam Lee");
    expect(calls[0].html).toContain("Line one<br>Line two");
    expect(calls[0].html).not.toContain("<b>Lee</b>");
  }, 60000);
});
