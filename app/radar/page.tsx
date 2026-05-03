"use client";

import { useEffect, useRef, useState } from "react";

const CHARS =
  "[](){}<>/\\|*+-=#$%&@^~?!:;,.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const rc = () => CHARS[(Math.random() * CHARS.length) | 0];

type RadarChar = {
  ch: string;
  x: number;
  y: number;
  angle: number;
  dist: number;
  glow: number;
  size: number;
  signal: boolean;
};

type WaitlistStatus = "idle" | "loading" | "success" | "error";

const SIGNAL_WORDS = [
  "signal", "noise", "data", "found", "locked",
  "detect", "decode", "source", "target",
];

export default function RadarLanding() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "radar" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: unknown;
      };
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMsg(
          typeof data.error === "string" ? data.error : "Could not save email",
        );
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("Network error");
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    let chars: RadarChar[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = performance.now();
    let sweepAngle = 0;

    const SWEEP_SPEED = 0.65;
    const TRAIL_WIDTH = Math.PI / 5;
    const BASE_GLOW = 0.06;
    const GLOW_DECAY = 0.00045;

    function buildChars(w: number, h: number) {
      const cx = w / 2;
      const cy = h / 2;
      const minDist = 170;
      const density = Math.floor((w * h) / 7500);
      const next: RadarChar[] = [];

      for (let i = 0; i < density; i++) {
        let x: number, y: number, dist: number;
        let tries = 0;
        do {
          x = Math.random() * w;
          y = Math.random() * h;
          dist = Math.hypot(x - cx, y - cy);
          tries++;
        } while (dist < minDist && tries < 20);
        if (dist < minDist) continue;
        next.push({
          ch: rc(),
          x, y,
          angle: Math.atan2(y - cy, x - cx),
          dist,
          glow: BASE_GLOW,
          size: 11 + ((Math.random() * 4) | 0),
          signal: false,
        });
      }

      const wordCount = 3 + ((Math.random() * 4) | 0);
      for (let w2 = 0; w2 < wordCount; w2++) {
        const word = SIGNAL_WORDS[(Math.random() * SIGNAL_WORDS.length) | 0];
        let sx: number, sy: number, sdist: number;
        let tries = 0;
        do {
          sx = minDist + Math.random() * (w - minDist * 2);
          sy = minDist + Math.random() * (h - minDist * 2);
          sdist = Math.hypot(sx - cx, sy - cy);
          tries++;
        } while (sdist < minDist && tries < 30);
        if (sdist < minDist) continue;
        const charW = 8;
        for (let j = 0; j < word.length; j++) {
          next.push({
            ch: word[j],
            x: sx + j * charW,
            y: sy,
            angle: Math.atan2(sy - cy, sx + j * charW - cx),
            dist: Math.hypot(sx + j * charW - cx, sy - cy),
            glow: BASE_GLOW,
            size: 13,
            signal: true,
          });
        }
      }

      return next;
    }

    function resize() {
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      chars = buildChars(width, height);
    }

    function frame() {
      const now = performance.now();
      const dt = Math.min(40, now - last);
      last = now;

      sweepAngle = (sweepAngle + SWEEP_SPEED * (dt / 1000)) % (Math.PI * 2);

      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.hypot(cx, cy);

      ctx!.clearRect(0, 0, width, height);

      // range rings
      ctx!.strokeStyle = "rgba(0,0,0,0.08)";
      ctx!.lineWidth = 1;
      for (const r of [0.28, 0.55, 0.82]) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, maxR * r, 0, Math.PI * 2);
        ctx!.stroke();
      }

      // crosshair
      ctx!.strokeStyle = "rgba(0,0,0,0.14)";
      ctx!.lineWidth = 0.5;
      ctx!.beginPath();
      ctx!.moveTo(cx - 12, cy);
      ctx!.lineTo(cx + 12, cy);
      ctx!.moveTo(cx, cy - 12);
      ctx!.lineTo(cx, cy + 12);
      ctx!.stroke();

      // sweep trail wedge
      ctx!.save();
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.arc(cx, cy, maxR, sweepAngle - TRAIL_WIDTH, sweepAngle);
      ctx!.closePath();
      ctx!.fillStyle = "rgba(0,0,0,0.04)";
      ctx!.fill();
      ctx!.restore();

      // sweep arm
      const grad = ctx!.createLinearGradient(
        cx, cy,
        cx + Math.cos(sweepAngle) * maxR,
        cy + Math.sin(sweepAngle) * maxR,
      );
      grad.addColorStop(0, "rgba(20,20,30,0.85)");
      grad.addColorStop(0.55, "rgba(20,20,30,0.3)");
      grad.addColorStop(1, "rgba(20,20,30,0.02)");
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.lineTo(
        cx + Math.cos(sweepAngle) * maxR,
        cy + Math.sin(sweepAngle) * maxR,
      );
      ctx!.strokeStyle = grad;
      ctx!.lineWidth = 1.5;
      ctx!.stroke();

      // center dot
      const cDot = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 5);
      cDot.addColorStop(0, "rgba(20,20,30,0.85)");
      cDot.addColorStop(1, "rgba(20,20,30,0)");
      ctx!.fillStyle = cDot;
      ctx!.beginPath();
      ctx!.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx!.fill();

      // chars
      ctx!.textBaseline = "middle";

      for (const c of chars) {
        const behind =
          ((sweepAngle - c.angle) % (Math.PI * 2) + Math.PI * 2) %
          (Math.PI * 2);

        let targetGlow: number;
        if (behind < TRAIL_WIDTH) {
          targetGlow = BASE_GLOW + (1 - BASE_GLOW) * (1 - behind / TRAIL_WIDTH);
        } else {
          targetGlow = BASE_GLOW;
        }

        if (targetGlow > c.glow) {
          c.glow = targetGlow;
        } else {
          c.glow = Math.max(BASE_GLOW, c.glow - GLOW_DECAY * dt);
        }

        ctx!.globalAlpha = c.glow;
        ctx!.font = `${c.size}px ui-monospace, "JetBrains Mono", Menlo, monospace`;

        // signal words flash crimson at peak glow, noise stays dark
        if (c.signal && c.glow > 0.45) {
          ctx!.fillStyle = "rgba(200,40,30,1)";
        } else {
          ctx!.fillStyle = "rgba(20,20,30,1)";
        }
        ctx!.fillText(c.ch, c.x, c.y);
      }

      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="relative h-svh w-screen overflow-hidden bg-white select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6">
        <p
          className="mb-4 text-[10px] uppercase tracking-[0.3em]"
          style={{ color: "rgba(0,0,0,0.28)" }}
        >
          scanning
        </p>
        <h1
          className="text-center font-serif italic tracking-tight"
          style={{
            fontSize: "clamp(40px, 7vw, 96px)",
            color: "rgba(0,0,0,0.88)",
          }}
        >
          Find signal from noise
        </h1>
        <p
          className="mt-5 max-w-[560px] text-center text-[15px] leading-relaxed"
          style={{ color: "rgba(0,0,0,0.5)" }}
        >
          The product signals layer for teams drowning in conversations,
          replays, and tickets.
        </p>

        <form
          onSubmit={joinWaitlist}
          className="pointer-events-auto mt-10 flex w-full max-w-[420px] flex-col items-center gap-2.5"
        >
          <div
            className="flex w-full items-center gap-1 rounded-full border bg-white/90 p-1 backdrop-blur-sm transition-colors"
            style={{
              borderColor:
                status === "error"
                  ? "rgba(220,80,80,0.55)"
                  : "rgba(0,0,0,0.13)",
              boxShadow: "0 4px 24px -8px rgba(0,0,0,0.08)",
            }}
          >
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="your@email.com"
              value={email}
              onChange={(ev) => {
                setEmail(ev.target.value);
                if (status === "error") setStatus("idle");
              }}
              disabled={status === "loading" || status === "success"}
              className="h-9 min-w-0 flex-1 bg-transparent px-4 text-[14px] text-black outline-none placeholder:text-black/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === "loading" || status === "success"}
              className="h-9 shrink-0 rounded-full bg-black px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "loading"
                ? "Joining…"
                : status === "success"
                  ? "You're in"
                  : "Join beta"}
            </button>
          </div>
          <p
            className="h-4 text-[11px] uppercase tracking-[0.22em]"
            style={{
              color:
                status === "error"
                  ? "rgba(220,80,80,0.85)"
                  : status === "success"
                    ? "rgba(30,140,30,0.85)"
                    : "rgba(0,0,0,0.3)",
            }}
          >
            {status === "error"
              ? errorMsg ?? "Something went wrong"
              : status === "success"
                ? "We'll be in touch soon"
                : "Early access"}
          </p>
        </form>
      </div>
    </div>
  );
}
