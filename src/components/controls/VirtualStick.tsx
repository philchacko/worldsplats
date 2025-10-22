'use client';
import { useEffect, useRef, useState } from 'react';

export type StickVec = { x: number; y: number };

export default function VirtualStick({
  onChange,
  radius = 60,
  dead = 0.08,
}: { onChange: (v: StickVec) => void; radius?: number; dead?: number; }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cx = 0, cy = 0;
    const rect = () => el.getBoundingClientRect();

    const start = (e: TouchEvent) => {
      const t = e.touches[0]; if (!t) return;
      setDrag(true);
      const r = rect();
      cx = r.left + r.width/2;
      cy = r.top + r.height/2;
      move(e);
    };

    const move = (e: TouchEvent) => {
      if (!drag && e.type === 'touchmove') return;
      const t = e.touches[0]; if (!t) return;
      const dx = t.clientX - cx, dy = t.clientY - cy;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(1, len / radius);
      let x = (dx / radius) * clamped;
      let y = (dy / radius) * clamped;
      const mag = Math.hypot(x, y);
      if (mag < dead) { x = 0; y = 0; }
      onChange({ x: x, y: y });
    };

    const end = () => { setDrag(false); onChange({ x: 0, y: 0 }); };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [onChange, radius, dead, drag]);

  return (
    <div
      ref={ref}
      className="absolute bottom-6 left-6 z-10"
      style={{
        width: radius*2,
        height: radius*2,
        borderRadius: '9999px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)'
      }}
    />
  );
}
