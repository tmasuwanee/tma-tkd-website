import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Loader2, Volume2 } from "lucide-react";

/**
 * Voice assistant (OpenAI Realtime, speech-to-speech). Bilingual English + Korean.
 * The browser opens a WebRTC session to OpenAI using an ephemeral token minted by
 * /api/admin/voice/session; the model's single tool `run_assistant` posts to
 * /api/admin/voice/run, which executes the existing text assistant (all tools +
 * the propose->Approve confirm-flow). So voice can look things up and QUEUE changes
 * as Approve cards, but never executes a write on its own. Tap-to-approve safety.
 */

export type VoiceStatus = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
export type VoiceLine = { role: "user" | "assistant"; text: string };

function useRealtimeVoice(onToolRun?: () => void) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    dcRef.current?.close(); dcRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    micRef.current?.getTracks().forEach(t => t.stop()); micRef.current = null;
    if (audioRef.current) { audioRef.current.srcObject = null; audioRef.current = null; }
  }, []);

  const stop = useCallback(() => { cleanup(); setStatus("idle"); }, [cleanup]);

  const handleEvent = useCallback(async (ev: MessageEvent) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.type) {
      case "input_audio_buffer.speech_started": setStatus("listening"); break;
      case "response.created": setStatus("thinking"); break;
      case "output_audio_buffer.started": case "response.audio.delta": setStatus("speaking"); break;
      case "conversation.item.input_audio_transcription.completed":
        if (msg.transcript?.trim()) setLines(l => [...l, { role: "user", text: msg.transcript.trim() }]);
        break;
      case "response.audio_transcript.done":
        if (msg.transcript?.trim()) setLines(l => [...l, { role: "assistant", text: msg.transcript.trim() }]);
        setStatus("listening");
        break;
      case "response.function_call_arguments.done": {
        // The only tool is run_assistant → execute the text assistant server-side.
        setStatus("thinking");
        let request = "";
        try { request = JSON.parse(msg.arguments || "{}").request ?? ""; } catch { /* ignore */ }
        let text = "Sorry, I couldn't complete that.";
        try {
          const r = await fetch("/api/admin/voice/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request }) });
          const data = await r.json().catch(() => ({}));
          if (data?.text) text = data.text;
        } catch { /* keep fallback */ }
        onToolRun?.(); // let the panel refresh pending approvals
        const dc = dcRef.current;
        if (dc && dc.readyState === "open") {
          dc.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: msg.call_id, output: text } }));
          dc.send(JSON.stringify({ type: "response.create" }));
        }
        break;
      }
      case "error":
        setErrorMsg(msg.error?.message ?? "Voice error"); setStatus("error"); break;
    }
  }, [onToolRun]);

  const start = useCallback(async () => {
    setErrorMsg(null); setLines([]); setStatus("connecting");
    try {
      const sess = await fetch("/api/admin/voice/session", { method: "POST" }).then(r => r.json());
      if (!sess?.clientSecret) throw new Error(sess?.error || "Voice is not configured on the server.");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      const audioEl = new Audio(); audioEl.autoplay = true; audioRef.current = audioEl;
      pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };
      pc.onconnectionstatechange = () => { if (["failed", "disconnected", "closed"].includes(pc.connectionState)) { cleanup(); setStatus("idle"); } };

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      mic.getTracks().forEach(t => pc.addTrack(t, mic));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = handleEvent;
      dc.onopen = () => setStatus("listening");

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(sess.model)}`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${sess.clientSecret}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) throw new Error("Could not connect to the voice service.");
      const answer = { type: "answer" as const, sdp: await sdpRes.text() };
      await pc.setRemoteDescription(answer);
    } catch (e) {
      setErrorMsg((e as Error).message || "Could not start voice."); setStatus("error"); cleanup();
    }
  }, [cleanup, handleEvent]);

  useEffect(() => () => cleanup(), [cleanup]);
  return { status, lines, errorMsg, start, stop };
}

const STATUS_LABEL: Record<VoiceStatus, string> = {
  idle: "Voice off", connecting: "Connecting…", listening: "Listening…", thinking: "Working…", speaking: "Speaking…", error: "Voice error",
};

export function VoiceBar({ onToolRun }: { onToolRun?: () => void }) {
  const { status, lines, errorMsg, start, stop } = useRealtimeVoice(onToolRun);
  const active = status !== "idle" && status !== "error";
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [lines]);

  return (
    <div className="border-b border-gray-100 bg-[#1a2d5a]/[0.03]">
      <div className="flex items-center gap-2 px-4 py-2">
        <button
          onClick={active ? stop : start}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 ${active ? "bg-red-600 text-white hover:bg-red-700" : "bg-[#1a2d5a] text-white hover:bg-[#142347]"}`}>
          {status === "connecting" || status === "thinking" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : active ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
          {active ? "Stop voice" : "Talk"}
        </button>
        <span className="text-[11px] text-gray-500 flex items-center gap-1">
          {status === "speaking" && <Volume2 className="w-3 h-3" />} {STATUS_LABEL[status]}
        </span>
        {active && <span className="ml-auto text-[10px] text-gray-400">English & 한국어 · changes need your approval</span>}
      </div>
      {errorMsg && <div className="px-4 pb-2 text-[11px] text-red-600">{errorMsg}</div>}
      {lines.length > 0 && (
        <div ref={scrollRef} className="max-h-28 overflow-y-auto px-4 pb-2 space-y-1">
          {lines.slice(-6).map((l, i) => (
            <div key={i} className={`text-[11px] ${l.role === "user" ? "text-gray-700" : "text-[#1a2d5a] font-medium"}`}>
              <span className="text-gray-400">{l.role === "user" ? "You" : "Assistant"}:</span> {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
