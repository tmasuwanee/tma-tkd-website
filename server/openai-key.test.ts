import { describe, expect, it } from "vitest";

describe("OPENAI_API_KEY", () => {
  it("authenticates with the OpenAI models endpoint", async () => {
    const apiKey = process.env.OPENAI_API_KEY;
    expect(apiKey, "OPENAI_API_KEY must be configured").toBeTruthy();

    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status, "OpenAI key must authenticate successfully").toBe(200);
  }, 20_000);
});
