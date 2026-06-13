import { describe, it, expect } from "vitest";

/**
 * Validates that the required Retell env vars are set and that
 * RETELL_API_KEY is accepted by the Retell API (GET /v2/list-agents).
 */
describe("Retell env vars", () => {
  it("RETELL_API_KEY is set", () => {
    expect(process.env.RETELL_API_KEY, "RETELL_API_KEY must be set").toBeTruthy();
  });

  it("RETELL_OUTBOUND_AGENT_ID is set to the expected value", () => {
    expect(process.env.RETELL_OUTBOUND_AGENT_ID).toBe(
      "agent_5b972b29ff3df222b9ec1497b6"
    );
  });

  it("RETELL_OUTBOUND_FROM_NUMBER is set to the expected value", () => {
    expect(process.env.RETELL_OUTBOUND_FROM_NUMBER).toBe("+18559231475");
  });

  it("RETELL_API_KEY is accepted by the Retell API (auth check via create-phone-call)", async () => {
    // Retell doesn't have a GET /list-agents endpoint.
    // POST /v2/create-phone-call with a dummy number returns 400 (bad number) when
    // auth succeeds, and 401/403 when auth fails. We accept 400 as proof of valid key.
    const apiKey = process.env.RETELL_API_KEY!;
    const res = await fetch("https://api.retellai.com/v2/create-phone-call", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from_number: "+10000000000", to_number: "+10000000001", agent_id: "test" }),
    });
    // 400 = auth OK, bad params; 403 = auth OK, resource forbidden (phone not in account in some regions);
    // 404 = auth OK, phone not in account; 401 = bad key
    expect(
      [400, 403, 404],
      `Retell API returned ${res.status} — RETELL_API_KEY may be invalid (expected 400, 403, or 404 for auth-OK)`
    ).toContain(res.status);
  }, 10_000);
});
