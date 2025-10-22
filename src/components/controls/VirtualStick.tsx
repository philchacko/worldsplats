// VirtualStick.tsx
'use client';
import { useEffect, useRef, useState } from 'react';

export type StickVec = { x: number; y: number };

export default function VirtualStick({
  onChange,
  radius = 60,       // visual radius in px
  dead = 0.08,       // deadzone in [0..1] of full travel
  curve = 1.0,       // 1 = linear; >1 = softer near center
}: {
  onChange: (v: StickVec) => void;
  radius?: number;
  dead?: number;
  curve?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(false);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchIdRef = useRef<number | null>(null);
  const centerRef = useRef<{ cx: number; cy: number }>({ cx: 0, cy: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = () => el.getBoundingClientRect();

    const findTouch = (e: TouchEvent) => {
      if (touchIdRef.current == null) return e.touches[0] || null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchIdRef.current) return e.touches[i];
      }
      return null;
    };

    const start = (e: TouchEvent) => {
      // lock the first touch to this stick
      const t = e.touches[0];
      if (!t) return;
      touchIdRef.current = t.identifier;
      setDrag(true);

      const r = rect();
      centerRef.current.cx = r.left + r.width / 2;
      centerRef.current.cy = r.top + r.height / 2;

      move(e); // emit initial value
      e.preventDefault();
    };

    const move = (e: TouchEvent) => {
      if (!drag) return;
      const t = findTouch(e);
      if (!t) return;

      const { cx, cy } = centerRef.current;
      const dx = t.clientX - cx;
      const dy = t.clientY - cy;

      // magnitude in pixels
      const len = Math.hypot(dx, dy);
      // direction (normalized)
      const nx = len > 0 ? dx / len : 0;
      const ny = len > 0 ? dy / len : 0;

      // clamp magnitude to radius
      const m = Math.min(1, len / radius);

      // apply deadzone + optional response curve
      const mAdj = m < dead ? 0 : Math.pow((m - dead) / (1 - dead), curve);

      const x = nx * mAdj;     // [-1..1]
      const y = ny * mAdj;     // [-1..1], NOTE: up = negative y

      setKnob({ x: nx * Math.min(1, len / radius), y: ny * Math.min(1, len / radius) });
      onChange({ x, y });

      e.preventDefault();
    };

    const end = (e: TouchEvent) => {
      if (touchIdRef.current == null) return;
      // If our finger lifted, reset
      let stillDown = false;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touchIdRef.current) {
          stillDown = true;
          break;
        }
      }
      if (!stillDown) {
        touchIdRef.current = null;
        setDrag(false);
        setKnob({ x: 0, y: 0 });
        onChange({ x: 0, y: 0 });
      }
    };

    // non-passive so preventDefault works on iOS
    el.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end, { passive: false });
    window.addEventListener('touchcancel', end, { passive: false });

    return () => {
      el.removeEventListener('touchstart', start);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
    };
  }, [onChange, radius, dead, curve, drag]);

  const size = radius * 2;
  const knobPxX = knob.x * radius;
  const knobPxY = knob.y * radius;

  return (
    <div
      ref={ref}
      className="absolute bottom-6 left-6 z-10"
      style={{
        width: size,
        height: size,
        borderRadius: '9999px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        touchAction: 'none',              // disable scroll while interacting
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {/* knob */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: radius * 0.9,
          height: radius * 0.9,
          borderRadius: '9999px',
          transform: `translate(${knobPxX - (radius * 0.45)}px, ${knobPxY - (radius * 0.45)}px)`,
          background: 'rgba(255,255,255,0.18)',
          border: '1px solid rgba(255,255,255,0.22)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          transition: drag ? 'none' : 'transform 120ms ease-out',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
