/**
 * Voice assistant (OpenAI Realtime, speech-to-speech) — 2026-08-21
 *
 * Bilingual (English + Korean) front-desk voice agent. The browser opens a WebRTC
 * connection to OpenAI Realtime using an EPHEMERAL token minted here (the real
 * OPENAI_API_KEY never reaches the client). The Realtime model has ONE tool,
 * `run_assistant`, which posts back to /api/admin/voice/run and executes the
 * existing text assistant (all 26 tools + the propose->Approve confirm-flow), so
 * voice reuses every lookup and every safety guard. Voice never executes a write
 * directly: a change becomes an Approve card the staff taps, exactly like chat.
 *
 * No PHI here (martial-arts school), so OpenAI direct needs no BAA — unlike the
 * ARFA clinical stack.
 */
import type { Request, Response } from "express";
import { ENV } from "./_core/env";
import { adminEmailFromRequest } from "./admin-auth";
import { runAssistantText } from "./assistant";

const VOICE_INSTRUCTIONS = `You are the friendly front-desk voice assistant for Top Martial Arts (TMA), a martial-arts school. You are fluent in English and Korean and ALWAYS reply in the SAME language the speaker is using, switching seamlessly if they switch mid-conversation. Keep replies short, warm, and natural, like a helpful coworker, not a robot.

For ANY request about members, students, payments, tuition, waivers, belts, trials, or leads, or to make a change (create / change / pause / cancel a membership, adjust a charge, apply a discount, promote a belt, update a student, draft an email), you MUST call the run_assistant tool. Pass the user's request as a clear, complete instruction in ENGLISH (translate it if they spoke Korean). Then speak the tool's result back in the user's language.

You cannot make changes yourself. run_assistant queues any change as an approval in the dashboard, so when the user asks for a change, tell them it is ready and they need to tap Approve in the dashboard. Never invent names, numbers, dates, or statuses: only say what the tool returns. If a request is ambiguous, ask one short clarifying question first.`;

const RUN_ASSISTANT_TOOL = {
  type: "function" as const,
  name: "run_assistant",
  description: "Look up TMA data or queue an administrative change. Pass a clear ENGLISH instruction describing exactly what the user wants (e.g. 'who is past due on tuition', 'change Elias Gray to 3 day per week', 'is Steven Charlton's waiver on file', 'promote Mia to the next belt'). Returns the assistant's answer text to read back to the user.",
  parameters: {
    type: "object",
    properties: {
      request: { type: "string", description: "The user's request as a clear, complete English instruction." },
    },
    required: ["request"],
  },
};

/** Mint an ephemeral Realtime session token for the browser. Admin-gated. */
export async function handleVoiceSession(req: Request, res: Response): Promise<void> {
  if (!adminEmailFromRequest(req)) { res.status(401).json({ error: "unauthorized" }); return; }
  if (!ENV.openaiApiKey) { res.status(503).json({ error: "voice not configured (set OPENAI_API_KEY)" }); return; }
  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ENV.realtimeModel,
        voice: ENV.realtimeVoice,
        modalities: ["audio", "text"],
        instructions: VOICE_INSTRUCTIONS,
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: { type: "server_vad" },
        tools: [RUN_ASSISTANT_TOOL],
        tool_choice: "auto",
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("[voice] session mint failed:", r.status, data);
      res.status(502).json({ error: `Realtime session failed (${r.status}). Check OPENAI_REALTIME_MODEL / account access.`, detail: (data as { error?: { message?: string } })?.error?.message ?? null });
      return;
    }
    // client_secret.value is the ephemeral key the browser uses for the WebRTC SDP.
    res.json({ clientSecret: (data as { client_secret?: { value?: string } })?.client_secret?.value ?? null, model: ENV.realtimeModel });
  } catch (e) {
    console.error("[voice] session error:", e);
    res.status(500).json({ error: "voice session error" });
  }
}

/** Execute the text assistant for a voice tool call and return its answer. */
export async function handleVoiceRun(req: Request, res: Response): Promise<void> {
  if (!adminEmailFromRequest(req)) { res.status(401).json({ error: "unauthorized" }); return; }
  const request = String((req.body ?? {}).request ?? "").trim();
  if (!request) { res.status(400).json({ error: "no request" }); return; }
  try {
    const proto = String((req.headers["x-forwarded-proto"] as string) || "https").split(",")[0];
    const host = req.headers.host || "tmatkd.com";
    const text = await runAssistantText(request, `${proto}://${host}`);
    res.json({ text });
  } catch (e) {
    console.error("[voice] run error:", e);
    res.status(500).json({ error: "voice run error", text: "Sorry, something went wrong on my side." });
  }
}
