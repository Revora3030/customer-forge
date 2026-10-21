import { useEffect, useRef } from "react";

/**
 * Luminous gold particle field for the marketing hero. Decorative only:
 * client-side canvas, paused when off-screen or tab hidden, and rendered
 * as a single static frame when the visitor prefers reduced motion.
 */
export function ParticleField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim() || "oklch(0.76 0.14 85)";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let raf = 0;
    let visible = true;
    type P = { x: number; y: number; vx: number; vy: number; r: number; a: number };
    let ps: P[] = [];

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(90, (w * h) / 9000));
      ps = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: -0.05 - Math.random() * 0.22,
        r: 0.4 + Math.random() * 1.6,
        a: 0.15 + Math.random() * 0.6,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = gold;
      for (const p of ps) {
        if (!reduce) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
          if (p.x < -4) p.x = w + 4;
          if (p.x > w + 4) p.x = -4;
        }
        ctx.globalAlpha = p.a;
        ctx.shadowBlur = p.r * 6;
        ctx.shadowColor = gold;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e?.isIntersecting ?? true;
      cancelAnimationFrame(raf);
      if (visible && !reduce) raf = requestAnimationFrame(draw);
    });
    io.observe(canvas);
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && visible && !reduce) raf = requestAnimationFrame(draw); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
