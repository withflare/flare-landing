"use client";

import { useEffect, useRef, useState } from "react";

const CHARS =
  "[](){}<>/\\|*+-=#$%&@^~?!:;,.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const rc = () => CHARS[(Math.random() * CHARS.length) | 0];

type Rocket = {
  ch: string;
  x: number;
  y: number;
  vy: number;
  targetY: number;
};

type Spark = {
  ch: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  accent: boolean;
};

type WaitlistStatus = "idle" | "loading" | "success" | "error";

export default function FlareLanding() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasClicked, setHasClicked] = useState(false);

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading" || status === "success") return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "flare" }),
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
    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;
    let last = performance.now();

    function resize() {
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function burst(x: number, y: number) {
      const n = 55 + ((Math.random() * 40) | 0);
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * Math.random() * 13 + 1;
        const accent = Math.random() < 0.14;
        sparks.push({
          ch: rc(),
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - Math.random() * 2,
          alpha: 0.9 + Math.random() * 0.1,
          size: accent ? 16 + ((Math.random() * 6) | 0) : 8 + ((Math.random() * 8) | 0),
          accent,
        });
      }
    }

    function launch() {
      const count = 2 + ((Math.random() * 3) | 0);
      for (let i = 0; i < count; i++) {
        const x = width * 0.1 + Math.random() * width * 0.8;
        const speed = 10 + Math.random() * 8;
        // explode somewhere between 15% and 72% from top
        const targetY = height * (0.15 + Math.random() * 0.57);
        rockets.push({
          ch: rc(),
          x,
          y: height + 10,
          vy: -speed,
          targetY,
        });
      }
    }

    function frame() {
      const now = performance.now();
      const dt = Math.min(40, now - last) / 16;
      last = now;

      ctx!.clearRect(0, 0, width, height);
      ctx!.font = `12px ui-monospace, "JetBrains Mono", Menlo, monospace`;
      ctx!.textBaseline = "middle";

      // rockets rising from bottom
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt;

        if (r.y <= r.targetY) {
          burst(r.x, r.y);
          rockets.splice(i, 1);
          continue;
        }

        // trail: draw ghost copies below the head
        for (let t = 5; t >= 1; t--) {
          ctx!.globalAlpha = (1 - t / 6) * 0.45;
          ctx!.fillStyle = "#18181f";
          ctx!.fillText(r.ch, r.x, r.y + t * 7);
        }
        ctx!.globalAlpha = 0.88;
        ctx!.fillStyle = "#18181f";
        ctx!.fillText(r.ch, r.x, r.y);
      }

      // explosion sparks
      ctx!.textBaseline = "middle";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vy += 0.22 * dt;
        s.vx *= Math.pow(0.974, dt);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.alpha -= 0.017 * dt;
        if (s.alpha <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx!.globalAlpha = Math.max(0, s.alpha);
        ctx!.font = `${s.size}px ui-monospace, "JetBrains Mono", Menlo, monospace`;
        ctx!.fillStyle = s.accent ? "#dc3c28" : "#18181f";
        ctx!.fillText(s.ch, s.x, s.y);
      }

      ctx!.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);

    function onPointerDown() {
      launch();
      setHasClicked(true);
    }

    canvas.addEventListener("pointerdown", onPointerDown);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      canvas!.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div className="relative h-svh w-screen overflow-hidden bg-[#f5f5f7] select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6">
        <p
          className="mb-4 text-[11px] uppercase tracking-[0.28em] transition-opacity duration-700"
          style={{
            color: "rgba(0,0,0,0.28)",
            opacity: hasClicked ? 0 : 1,
          }}
        >
          click anywhere
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
              boxShadow: "0 4px 24px -8px rgba(0,0,0,0.1)",
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
