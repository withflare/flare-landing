"use client";

import { useEffect, useRef, useState } from "react";
import {
  prepareWithSegments,
  layoutWithLines,
} from "@chenglou/pretext";

const CHARSET =
  "[](){}<>/\\|*+-=#$%&@^~?!:;,.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randChar() {
  return CHARSET[(Math.random() * CHARSET.length) | 0];
}

function randToken() {
  const n = 2 + ((Math.random() * 7) | 0);
  let s = "";
  for (let i = 0; i < n; i++) s += randChar();
  return s;
}

function buildCorpus(length: number) {
  const out: string[] = [];
  for (let i = 0; i < length; i++) out.push(randToken());
  return out.join(" ");
}

type Particle = {
  ch: string;
  rx: number;
  ry: number;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  w: number;
  cellIdx: number;
  red: boolean;
};

type Stroke = {
  x: number;
  y: number;
  age: number;
  life: number;
};

type WaitlistStatus = "idle" | "loading" | "success" | "error";

export default function SignalLanding() {
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
        body: JSON.stringify({ email, source: "signal" }),
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
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const ctxNullable = canvasEl.getContext("2d");
    if (!ctxNullable) return;
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = ctxNullable;

    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));

    const FONT_SIZE = 14;
    const LINE_HEIGHT = 18;
    const FONT = `${FONT_SIZE}px ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace`;

    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let raf = 0;

    const strokes: Stroke[] = [];
    let pressing = false;
    let lastDrawAt = { x: 0, y: 0, t: 0 };

    const CELL = 80;
    let cols = 0;
    let rows = 0;
    let grid: number[][] = [];
    let awake = new Uint8Array(0);
    let offscreen: HTMLCanvasElement | null = null;
    let offCtx: CanvasRenderingContext2D | null = null;

    function paintRest(c: CanvasRenderingContext2D, p: Particle, x: number, y: number) {
      c.fillStyle = p.red
        ? "rgba(200, 30, 30, 0.55)"
        : "rgba(30, 30, 40, 0.32)";
      c.fillText(p.ch, x, y);
    }

    function eraseAt(c: CanvasRenderingContext2D, p: Particle, x: number, y: number) {
      c.clearRect(x - 1, y - 1, p.w + 2, LINE_HEIGHT);
    }

    function cellOf(x: number, y: number) {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(x / CELL)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(y / CELL)));
      return cy * cols + cx;
    }

    function build() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = FONT;
      ctx.textBaseline = "top";

      const targetLines = Math.ceil(height / LINE_HEIGHT) + 2;
      const charsPerLine = Math.ceil(width / (FONT_SIZE * 0.55));
      const corpus = buildCorpus(targetLines * Math.ceil(charsPerLine / 4));

      const prepared = prepareWithSegments(corpus, FONT);
      const { lines } = layoutWithLines(prepared, width, LINE_HEIGHT);

      const next: Particle[] = [];
      const visibleLines = Math.min(lines.length, targetLines);

      for (let li = 0; li < visibleLines; li++) {
        const line = lines[li];
        const y = li * LINE_HEIGHT;
        let x = 0;
        for (const ch of line.text) {
          if (ch === " ") {
            x += ctx.measureText(" ").width;
            continue;
          }
          const w = ctx.measureText(ch).width;
          if (x > width) break;
          next.push({
            ch,
            rx: x,
            ry: y,
            x,
            y,
            px: x,
            py: y,
            vx: 0,
            vy: 0,
            w,
            cellIdx: 0,
            red: Math.random() < 0.06,
          });
          x += w;
        }
      }
      particles = next;

      cols = Math.max(1, Math.ceil(width / CELL));
      rows = Math.max(1, Math.ceil(height / CELL));
      grid = Array.from({ length: cols * rows }, () => [] as number[]);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const idx = cellOf(p.rx, p.ry);
        p.cellIdx = idx;
        grid[idx].push(i);
      }
      awake = new Uint8Array(particles.length);

      const off = document.createElement("canvas");
      off.width = Math.floor(width * dpr);
      off.height = Math.floor(height * dpr);
      const c = off.getContext("2d");
      offCtx = c;
      if (c) {
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.font = FONT;
        c.textBaseline = "top";
        for (const p of particles) paintRest(c, p, p.rx, p.ry);
      }
      offscreen = off;
    }

    function addStroke(x: number, y: number) {
      const now = performance.now();
      const dx = x - lastDrawAt.x;
      const dy = y - lastDrawAt.y;
      const d = Math.hypot(dx, dy);
      const dt = now - lastDrawAt.t;
      if (lastDrawAt.t !== 0 && d > 4) {
        const steps = Math.min(20, Math.ceil(d / 4));
        for (let i = 1; i <= steps; i++) {
          strokes.push({
            x: lastDrawAt.x + (dx * i) / steps,
            y: lastDrawAt.y + (dy * i) / steps,
            age: 0,
            life: 1500,
          });
        }
      } else if (lastDrawAt.t === 0 || dt > 30) {
        strokes.push({ x, y, age: 0, life: 1500 });
      }
      lastDrawAt = { x, y, t: now };
    }

    function getPos(e: PointerEvent) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onDown(e: PointerEvent) {
      pressing = true;
      canvas.setPointerCapture(e.pointerId);
      const { x, y } = getPos(e);
      lastDrawAt = { x: 0, y: 0, t: 0 };
      addStroke(x, y);
    }
    function onMove(e: PointerEvent) {
      if (!pressing) return;
      const { x, y } = getPos(e);
      addStroke(x, y);
    }
    function onUp(e: PointerEvent) {
      pressing = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {}
      lastDrawAt = { x: 0, y: 0, t: 0 };
    }

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", onUp);

    let last = performance.now();
    const RADIUS = 60;
    const RADIUS_SQ = RADIUS * RADIUS;
    const PUSH = 1.3;

    function frame() {
      const now = performance.now();
      const dt = Math.min(40, now - last);
      last = now;

      for (let i = strokes.length - 1; i >= 0; i--) {
        strokes[i].age += dt;
        if (strokes[i].age >= strokes[i].life) strokes.splice(i, 1);
      }

      ctx.clearRect(0, 0, width, height);
      if (offscreen) ctx.drawImage(offscreen, 0, 0, width, height);
      ctx.font = FONT;
      ctx.textBaseline = "top";

      for (let s = 0; s < strokes.length; s++) {
        const st = strokes[s];
        const minCX = Math.max(0, Math.floor((st.x - RADIUS) / CELL));
        const maxCX = Math.min(cols - 1, Math.floor((st.x + RADIUS) / CELL));
        const minCY = Math.max(0, Math.floor((st.y - RADIUS) / CELL));
        const maxCY = Math.min(rows - 1, Math.floor((st.y + RADIUS) / CELL));
        for (let cy = minCY; cy <= maxCY; cy++) {
          for (let cx = minCX; cx <= maxCX; cx++) {
            const cell = grid[cy * cols + cx];
            for (let k = 0; k < cell.length; k++) {
              const idx = cell[k];
              if (awake[idx] === 0) {
                awake[idx] = 1;
                const p = particles[idx];
                if (offCtx) eraseAt(offCtx, p, p.px, p.py);
              }
            }
          }
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!awake[i]) continue;

        let fx = 0;
        let fy = 0;

        for (let s = 0; s < strokes.length; s++) {
          const st = strokes[s];
          const ddx = p.x - st.x;
          const ddy = p.y - st.y;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < RADIUS_SQ && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const lifeRatio = 1 - st.age / st.life;
            const falloff = (1 - d / RADIUS) * lifeRatio;
            fx += (ddx / d) * falloff * PUSH;
            fy += (ddy / d) * falloff * PUSH;
          }
        }

        const sx = (p.rx - p.x) * 0.022;
        const sy = (p.ry - p.y) * 0.022;

        p.vx = (p.vx + fx + sx) * 0.78;
        p.vy = (p.vy + fy + sy) * 0.78;

        p.x += p.vx;
        p.y += p.vy;

        if (
          Math.abs(p.x - p.rx) < 0.3 &&
          Math.abs(p.y - p.ry) < 0.3 &&
          Math.abs(p.vx) < 0.05 &&
          Math.abs(p.vy) < 0.05
        ) {
          p.x = p.rx;
          p.y = p.ry;
          p.vx = 0;
          p.vy = 0;
          awake[i] = 0;
          p.px = p.rx;
          p.py = p.ry;
          if (offCtx) paintRest(offCtx, p, p.rx, p.ry);
        }
      }

      for (let i = 0; i < particles.length; i++) {
        if (!awake[i]) continue;
        const p = particles[i];
        ctx.clearRect(p.x - 1, p.y - 1, p.w + 2, LINE_HEIGHT);
      }
      for (let i = 0; i < particles.length; i++) {
        if (!awake[i]) continue;
        const p = particles[i];
        ctx.fillStyle = p.red
          ? "rgba(200, 30, 30, 0.55)"
          : "rgba(30, 30, 40, 0.32)";
        ctx.fillText(p.ch, p.x, p.y);
      }

      raf = requestAnimationFrame(frame);
    }

    build();
    raf = requestAnimationFrame(frame);

    let resizeTimer = 0 as unknown as number;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(build, 120) as unknown as number;
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onUp);
    };
  }, []);

  return (
    <div className="relative h-svh w-screen overflow-hidden bg-white text-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6">
        <h1
          className="text-center font-serif italic tracking-tight"
          style={{
            fontSize: "clamp(40px, 7vw, 96px)",
            color: "rgba(0,0,0,0.96)",
            textShadow: "0 0 28px rgba(255,255,255,0.8), 0 0 80px rgba(255,255,255,0.6)",
            mixBlendMode: "normal",
          }}
        >
          Find signal from noise
        </h1>
        <p
          className="mt-5 max-w-[560px] text-center text-[15px] leading-relaxed"
          style={{
            color: "rgba(0,0,0,0.62)",
            textShadow: "0 0 20px rgba(255,255,255,0.85), 0 0 60px rgba(255,255,255,0.6)",
          }}
        >
          The product signals layer for teams drowning in conversations,
          replays, and tickets.
        </p>

        <form
          onSubmit={joinWaitlist}
          className="pointer-events-auto mt-10 flex w-full max-w-[420px] flex-col items-center gap-2.5"
        >
          <div
            className="flex w-full items-center gap-1 rounded-full border bg-black/4 p-1 backdrop-blur-md transition-colors focus-within:border-black/35"
            style={{
              borderColor:
                status === "error"
                  ? "rgba(220,80,80,0.55)"
                  : "rgba(0,0,0,0.18)",
              boxShadow: "0 8px 32px -12px rgba(0,0,0,0.15)",
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
              className="h-9 min-w-0 flex-1 bg-transparent px-4 text-[14px] text-black outline-none placeholder:text-black/35 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === "loading" || status === "success"}
              className="h-9 shrink-0 rounded-full bg-black px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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
                  ? "rgba(220,120,120,0.85)"
                  : status === "success"
                    ? "rgba(30,140,30,0.85)"
                    : "rgba(0,0,0,0.35)",
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
