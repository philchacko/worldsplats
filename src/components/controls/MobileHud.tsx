'use client';
import VirtualStick from '@/components/controls/VirtualStick';
import { usePointerLock } from '@/providers/pointerLock';

export default function MobileHud({
  mobileInputRef
}: {
  mobileInputRef: React.MutableRefObject<{x:number;y:number}>
}) {
  const { isLocked } = usePointerLock();

  // Check if device is touch-capable
  const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  if (!isTouch || !isLocked) return null;

  return (
    <VirtualStick
      onChange={(v) => {
        mobileInputRef.current.x = v.x;
        mobileInputRef.current.y = v.y;
      }}
    />
  );
}
