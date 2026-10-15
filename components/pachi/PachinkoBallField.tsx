"use client";

import { useEffect, useRef } from "react";
import type { Ball } from "./pachinko-game";
import { BALL_RADIUS, BOARD_HEIGHT, BOARD_PINS, BOARD_WIDTH, sampleBallFlight, type BallPoint } from "./pachinko-physics";

interface Props {
  balls: readonly Ball[];
  reducedMotion: boolean;
  paused: boolean;
  className?: string;
  onImpact?: () => void;
}
interface LiveBall {
  ball: Ball;
  age: number;
  reducedMotion: boolean;
  lastPin: number;
}
interface Spark extends BallPoint { age: number; direction: number }

/** A single canvas/RAF draws the entire ball field without React frame updates. */
export function PachinkoBallField({ balls, reducedMotion, paused, className, onImpact }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ balls, reducedMotion, paused, onImpact });
  const runtime = useRef<{ sync: () => void } | null>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d", { alpha: true });
    if (!element || !context) return;
    const live = new Map<number, LiveBall>();
    const sparks: Spark[] = [];
    let frame = 0;
    let lastTime = performance.now();
    let lastImpact = -Infinity;
    let visible = !document.hidden;
    let disposed = false;
    // This records the *previous* interval's clock state. Reading only the
    // latest paused prop when resuming would charge the entire pause as age.
    let advancing = false;

    const paintBall = (record: LiveBall, position: BallPoint, progress: number) => {
      const flight = record.ball.flight;
      if (record.reducedMotion) {
        // Preference is captured at launch. Existing balls never jump when an
        // OS setting changes; low-motion balls use a gentle arrival indicator.
        if (progress < .8) return;
        position = sampleBallFlight(flight, 1);
        context.globalAlpha = Math.min(1, (progress - .8) * 5);
      } else {
        for (let index = 3; index > 0; index--) {
          const previous = sampleBallFlight(flight, Math.max(0, progress - index * 7 / flight.durationMs));
          context.beginPath();
          context.arc(previous.x, previous.y, BALL_RADIUS * (1 - index * .1), 0, Math.PI * 2);
          context.fillStyle = `rgba(211,238,255,${.07 - index * .012})`;
          context.fill();
        }
      }
      context.save();
      context.translate(position.x, position.y);
      // Canvas gradients retain the transform used at creation. Construct it
      // after translation so every ball carries its own highlight.
      const metal = context.createRadialGradient(-1.8, -2.2, .25, .2, .4, BALL_RADIUS + .2);
      metal.addColorStop(0, "#ffffff");
      metal.addColorStop(.22, "#f2fcff");
      metal.addColorStop(.43, "#b7c8d2");
      metal.addColorStop(.57, "#f5ffff");
      metal.addColorStop(.76, "#627381");
      metal.addColorStop(1, "#152633");
      context.beginPath();
      context.arc(.8, 1.3, BALL_RADIUS + .7, 0, Math.PI * 2);
      context.fillStyle = "rgba(0,8,18,.35)";
      context.fill();
      context.beginPath();
      context.arc(0, 0, BALL_RADIUS, 0, Math.PI * 2);
      context.fillStyle = metal;
      context.fill();
      context.strokeStyle = "rgba(235,252,255,.85)";
      context.lineWidth = .55;
      context.stroke();
      context.rotate(record.age * .016 + record.ball.id);
      context.beginPath();
      context.ellipse(0, 0, BALL_RADIUS * .68, BALL_RADIUS * .28, .35, .2, Math.PI * .95);
      context.strokeStyle = "rgba(255,255,255,.56)";
      context.lineWidth = .55;
      context.stroke();
      context.restore();
      context.globalAlpha = 1;
    };

    const paint = (now: number, advance: boolean) => {
      const delta = advance ? Math.max(0, now - lastTime) : 0;
      lastTime = now;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, element.width, element.height);
      context.setTransform(element.width / BOARD_WIDTH, 0, 0, element.height / BOARD_HEIGHT, 0, 0);
      for (const record of live.values()) {
        record.age += delta;
        const progress = Math.min(1, record.age / record.ball.flight.durationMs);
        const point = sampleBallFlight(record.ball.flight, progress);
        paintBall(record, point, progress);
        if (!advance || progress >= 1) continue;
        const touching = BOARD_PINS.findIndex(pin => Math.hypot(point.x - pin.x, point.y - pin.y) < BALL_RADIUS + pin.r + 2.6);
        if (touching >= 0 && touching !== record.lastPin) {
          const pin = BOARD_PINS[touching];
          if (!record.reducedMotion && sparks.length < 18) sparks.push({ x: (point.x + pin.x) / 2, y: (point.y + pin.y) / 2, age: 0, direction: record.ball.id % 7 });
          if (now - lastImpact > 75) { latest.current.onImpact?.(); lastImpact = now; }
        }
        record.lastPin = touching;
      }
      for (let index = sparks.length - 1; index >= 0; index--) {
        const spark = sparks[index];
        spark.age += delta;
        if (spark.age > 105) { sparks.splice(index, 1); continue; }
        const strength = 1 - spark.age / 105;
        context.globalAlpha = strength * .7;
        context.strokeStyle = "#d5f7ff";
        context.lineWidth = .7;
        for (let ray = 0; ray < 3; ray++) {
          const angle = spark.direction + ray * Math.PI * 2 / 3;
          context.beginPath();
          context.moveTo(spark.x + Math.cos(angle) * 2, spark.y + Math.sin(angle) * 2);
          context.lineTo(spark.x + Math.cos(angle) * (3 + 3 * strength), spark.y + Math.sin(angle) * (3 + 3 * strength));
          context.stroke();
        }
        context.globalAlpha = 1;
      }
    };

    const tick = (now: number) => {
      frame = 0;
      if (!advancing || disposed) return;
      paint(now, true);
      frame = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      lastTime = performance.now();
      paint(lastTime, false);
      advancing = !disposed && visible && !latest.current.paused && live.size > 0;
      if (advancing) frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      // Account for the fraction of the previous frame before a React update
      // wakes the loop; rapid reel/UI updates must not slow ball arrivals.
      if (advancing) paint(performance.now(), true);
      const visibleBalls = latest.current.balls.slice(-16);
      const incoming = new Set(visibleBalls.map(ball => ball.id));
      for (const id of live.keys()) if (!incoming.has(id)) live.delete(id);
      // An upper bound also protects the renderer if an older saved session
      // contains more balls than today's controller allows.
      for (const ball of visibleBalls) {
        const record = live.get(ball.id);
        if (record) record.ball = ball;
        else live.set(ball.id, { ball, age: 0, reducedMotion: latest.current.reducedMotion, lastPin: -1 });
      }
      wake();
    };
    const resize = () => {
      if (advancing) paint(performance.now(), true);
      const box = element.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(box.width * ratio));
      const height = Math.max(1, Math.round(box.height * ratio));
      if (element.width !== width || element.height !== height) { element.width = width; element.height = height; }
      paint(performance.now(), false);
    };
    const visibility = () => {
      if (advancing) paint(performance.now(), true);
      visible = !document.hidden;
      wake();
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(element);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    runtime.current = { sync };
    resize();
    sync();
    return () => {
      disposed = true;
      advancing = false;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      runtime.current = null;
      live.clear();
      sparks.length = 0;
    };
  }, []);

  useEffect(() => {
    latest.current = { balls, reducedMotion, paused, onImpact };
    runtime.current?.sync();
  }, [balls, reducedMotion, paused, onImpact]);

  return <canvas ref={canvas} className={className} width={600} height={620} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }} />;
}
