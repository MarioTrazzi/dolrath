'use client';

import { motion } from 'framer-motion';

interface StatBarProps {
  value: number;
  max: number;
  color: string;
}

export function StatBar({ value, max, color }: StatBarProps) {
  const percentage = (value / max) * 100;

  return (
    <div className="w-full bg-background/50 rounded-full h-2">
      <motion.div
        className={`h-2 rounded-full bg-gradient-to-r ${color}`}
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}
