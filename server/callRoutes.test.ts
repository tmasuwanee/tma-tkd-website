import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";

// The signing secret is read when env.ts loads, so it must be set before any import runs.
// (Plain statements run AFTER hoisted imports; vi.hoisted runs before them.)
vi.hoisted(() => { process.env.JWT_SECRET = "route-test-secret"; });

const db = vi.hoisted(() => ({
  getLeadById: vi.fn(),
  getLeadsByStages: vi.fn(),
  updateLeadStage: vi.fn(),
  getAutomationControls: vi.fn(),
  isAutomationEnabled: vi.fn(),
  createLeadActivity: vi.fn(),
  getLeadActivities: vi.fn(),
  setLeadFollowUp: vi.fn(),
}));
vi.mock("./db", () => db);
vi.mock("./facebook-ads", () => ({ getAdInsights: vi.fn(), syncAdInsights: vi.fn() }));

import { registerApiRoutes } from "./api-routes";
import { signCallToken } from "./callConsole";

const SECRET = "route-test-secret";
const lead = (over: Record<string, unknown> = {}) => ({
  id: 41, parentName: "Dana Ruiz", kidName: "", kidAge: "", phone: "770-555-1212",
  programInterest: "taekwondo", pipelineStage: "new_lead", tags: JSON.stringify(["facebook_lead"]),
  utmSource: "facebook", utmCampaign: "Nov Trial", trialClassDate: null, trialClassTime: null,
  trialClassDay: null, additionalNotes: null, smsConsent: 0, createdAt: new Date(), ...over,
});

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  await new Promise<void>(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => {
  Object.values(db).forEach(f => f.mockReset());
  db.getLeadById.mockResolvedValue(lead());
  db.getLeadActivities.mockResolvedValue([]);
  db.createLeadActivity.mockResolvedValue({ id: 1 });
});

const tok = (id = 41) => signCallToken(id, SECRET);
const get = (id: number, t: string) => fetch(`${base}/api/call/${id}?t=${encodeURIComponent(t)}`);
const post = (id: number, path: string, t: string, body: unknown) =>
  fetch(`${base}/api/call/${id}/${path}?t=${encodeURIComponent(t)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

describe("call routes: access", () => {
  it("rejects a missing, forged, or wrong-lead token before touching the database", async () => {
    expect((await get(41, "")).status).toBe(401);
    expect((await get(41, "abc.def")).status).toBe(401);
    expect((await get(42, tok(41))).status).toBe(401);
    expect((await post(41, "finish", "", { outcome: "answered" })).status).toBe(401);
    expect(db.getLeadById).not.toHaveBeenCalled();
    expect(db.createLeadActivity).not.toHaveBeenCalled();
  });
  it("404s for a lead that no longer exists", async () => {
    db.getLeadById.mockResolvedValue(null);
    expect((await get(41, tok())).status).toBe(404);
  });
});

describe("call routes: GET", () => {
  it("returns the lead, dial link, templates and no email or internal fields", async () => {
    const r = await get(41, tok());
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const j = await r.json();
    expect(j.lead.parentName).toBe("Dana Ruiz");
    expect(j.lead.fromFacebook).toBe(true);
    expect(j.tel).toBe("tel:+17705551212");
    expect(j.fromNumber).toBe("(770) 277-3009");
    expect(j.templates.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining(["free_trial", "near_suwanee"]));
    expect(j.outcomes).toHaveLength(5);
    expect(Object.keys(j.lead)).not.toEqual(expect.arrayContaining(["email"]));
    expect(j.lead).not.toHaveProperty("email");
    expect(j.lead).not.toHaveProperty("internalNotes");
  });
});

describe("call routes: start (who we called)", () => {
  it("logs one outbound call row per dial", async () => {
    const r = await post(41, "start", tok(), {});
    expect((await r.json()).logged).toBe(true);
    expect(db.createLeadActivity).toHaveBeenCalledWith(expect.objectContaining({
      leadId: 41, type: "call", direction: "outbound", status: "dialed", sentBy: "staff:call_link",
    }));
  });
  it("does not double-log a second tap within two minutes", async () => {
    db.getLeadActivities.mockResolvedValue([{ type: "call", status: "dialed", createdAt: new Date() }]);
    const r = await post(41, "start", tok(), {});
    expect((await r.json()).logged).toBe(false);
    expect(db.createLeadActivity).not.toHaveBeenCalled();
  });
  it("logs again once the earlier dial is old", async () => {
    db.getLeadActivities.mockResolvedValue([{ type: "call", status: "dialed", createdAt: new Date(Date.now() - 10 * 60 * 1000) }]);
    expect((await (await post(41, "start", tok(), {})).json()).logged).toBe(true);
  });
});

describe("call routes: finish (notes after hang up)", () => {
  it("saves notes, moves a new lead to contacted when they answered, and sets the reminder", async () => {
    const r = await post(41, "finish", tok(), { outcome: "answered", notes: "Wants Tuesdays", followUp: "2026-11-19" });
    expect(r.status).toBe(200);
    expect((await r.json()).stageChangedTo).toBe("contacted");
    expect(db.createLeadActivity).toHaveBeenCalledWith(expect.objectContaining({
      type: "call", status: "answered", body: "Wants Tuesdays", subject: "Call: Spoke with them",
    }));
    expect(db.updateLeadStage).toHaveBeenCalledWith(41, "contacted");
    expect(db.setLeadFollowUp).toHaveBeenCalledWith(41, "2026-11-19", "Wants Tuesdays");
  });
  it("a voicemail is logged but leaves the stage alone", async () => {
    await post(41, "finish", tok(), { outcome: "voicemail" });
    expect(db.createLeadActivity).toHaveBeenCalledWith(expect.objectContaining({ status: "voicemail", body: null }));
    expect(db.updateLeadStage).not.toHaveBeenCalled();
    expect(db.setLeadFollowUp).not.toHaveBeenCalled();
  });
  it("never moves a lead that is already further along", async () => {
    db.getLeadById.mockResolvedValue(lead({ pipelineStage: "trial_scheduled" }));
    await post(41, "finish", tok(), { outcome: "answered" });
    expect(db.updateLeadStage).not.toHaveBeenCalled();
  });
  it("rejects a bad outcome or a bad follow-up date without writing anything", async () => {
    expect((await post(41, "finish", tok(), { outcome: "hacked" })).status).toBe(400);
    expect((await post(41, "finish", tok(), { outcome: "answered", followUp: "tomorrow" })).status).toBe(400);
    expect(db.createLeadActivity).not.toHaveBeenCalled();
  });
  it("caps very long notes", async () => {
    await post(41, "finish", tok(), { outcome: "answered", notes: "x".repeat(5000) });
    const body = db.createLeadActivity.mock.calls[0][0].body as string;
    expect(body.length).toBe(2000);
  });
});

describe("call routes: texted", () => {
  it("logs the chosen template as an outbound text", async () => {
    const r = await post(41, "texted", tok(), { templateId: "near_suwanee" });
    expect(r.status).toBe(200);
    expect(db.createLeadActivity).toHaveBeenCalledWith(expect.objectContaining({
      type: "sms", direction: "outbound", subject: "Text: Do you live near Suwanee?",
    }));
  });
  it("rejects a template id that does not exist", async () => {
    expect((await post(41, "texted", tok(), { templateId: "nope" })).status).toBe(400);
  });
});
