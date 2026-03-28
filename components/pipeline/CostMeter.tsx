'use client';

import { useEffect, useRef, useState } from 'react';
import { DollarSign } from 'lucide-react';

interface CostMeterProps {
  totalCostUsd: number;
  isActive: boolean;
}

export function CostMeter({ totalCostUsd, isActive }: CostMeterProps) {
  const [displayCost, setDisplayCost] = useState(totalCostUsd);
  const displayCostRef = useRef(totalCostUsd);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    displayCostRef.current = displayCost;
  }, [displayCost]);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const start = displayCostRef.current;
    const end = totalCostUsd;
    if (start === end) {
      return;
    }

    const duration = 500;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = start + (end - start) * eased;
      setDisplayCost(nextValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [totalCostUsd]);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-card/50 px-4 py-2.5">
      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${isActive ? 'bg-green-500/20 animate-pulse' : 'bg-muted'}`}>
        <DollarSign className={`h-4 w-4 ${isActive ? 'text-green-400' : 'text-muted-foreground'}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Total Cost</p>
        <p className="text-lg font-mono font-bold tabular-nums">
          ${displayCost.toFixed(4)}
        </p>
      </div>
    </div>
  );
}
