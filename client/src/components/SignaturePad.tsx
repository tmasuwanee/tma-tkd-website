import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

/**
 * Finger / stylus / mouse signature pad. Fires onChange(dataUrl) when a stroke
 * finishes, or onChange(null) when cleared. Backing store is sized to DPR so the
 * captured PNG is crisp on a Retina iPad. touch-none keeps the page from scrolling
 * while someone signs.
 */
export default function SignaturePad({
  onChange,
  height = 170,
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1a2d5a";
      }
    };
    setup();
    window.addEventListener("resize", setup);
    return () => window.removeEventListener("resize", setup);
  }, []);

  const point = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    drawing.current = true;
    last.current = point(e);
    try { canvasRef.current?.setPointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    const p = point(e);
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    last.current = p;
    inked.current = true;
    if (!hasInk) setHasInk(true);
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && inked.current) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden" style={{ height }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {!hasInk ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-300 text-sm select-none">
            Sign here
          </div>
        ) : null}
        {/* signature line */}
        <div className="absolute left-4 right-4 bottom-7 border-b border-gray-200 pointer-events-none" />
      </div>
      <div className="flex justify-end mt-1">
        <Button type="button" variant="ghost" size="sm" onClick={clear}
          className="text-gray-400 hover:text-gray-700 h-7 text-xs">
          <Eraser className="w-3.5 h-3.5 mr-1" /> Clear
        </Button>
      </div>
    </div>
  );
}
