import React from "react";
import { motion } from "framer-motion";

interface CircularProgressProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  colorClass?: string;
}

export function CircularProgress({
  value,
  size = 120,
  strokeWidth = 8,
  label,
  sublabel,
  colorClass = "text-primary",
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg className="absolute inset-0 w-full h-full transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="text-secondary stroke-current"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`${colorClass} stroke-current transition-all duration-500 ease-out`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
        />
      </svg>
      
      {/* Center text */}
      <div className="flex flex-col items-center justify-center text-center absolute inset-0 z-10">
        {label ? (
          <>
            <span className="text-3xl font-bold tracking-tighter text-foreground">
              {label}
            </span>
            {sublabel && (
              <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
                {sublabel}
              </span>
            )}
          </>
        ) : (
          <span className="text-2xl font-bold tracking-tighter text-foreground">
            {Math.round(value)}%
          </span>
        )}
      </div>
    </div>
  );
}
