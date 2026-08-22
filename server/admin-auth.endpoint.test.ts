import { describe, expect, it } from "vitest";

const baseUrl = process.env.TEST_SERVER_URL ?? "http://127.0.0.1:3000";
const adminPassword = process.env.ADMIN_PASSWORD;

describe("admin password endpoint", () => {
  it("accepts the configured secret through the server-side login route", async () => {
    expect(adminPassword).toBeTruthy();

    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "tmasuwanee@gmail.com",
        password: adminPassword,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true });
    expect(response.headers.get("set-cookie")).toContain("tma_admin");
  });
});
