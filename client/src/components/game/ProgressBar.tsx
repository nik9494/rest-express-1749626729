import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  labelValue?: string | number;
  color?: "primary" | "secondary" | "success" | "warning" | "danger" | "gray";
  height?: "small" | "medium" | "large";
  className?: string;
  animate?: boolean;
}

export function ProgressBar({
  value,
  max,
  label,
  labelValue,
  color = "primary",
  height = "small",
  className,
  animate = true
}: ProgressBarProps) {
  // Calculate percentage
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  // Color mapping
  const colorClasses = {
    primary: "bg-[#0088CC]",
    secondary: "bg-[#6C757D]",
    success: "bg-[#4CD964]",
    warning: "bg-[#FF9500]",
    danger: "bg-[#FF3B30]",
    gray: "bg-telegram-gray-500"
  };
  
  // Height mapping
  const heightClasses = {
    small: "h-1.5",
    medium: "h-2",
    large: "h-3"
  };

  return (
    <div className={className}>
      {(label || labelValue !== undefined) && (
        <div className="flex justify-between text-xs mb-1">
          {label && <span className="font-medium">{label}</span>}
          {labelValue !== undefined && <span className="font-bold">{labelValue}</span>}
        </div>
      )}
      <div className={cn("bg-telegram-gray-200 rounded-full w-full", heightClasses[height])}>
        <div 
          className={cn(
            "rounded-full transition-all",
            heightClasses[height],
            colorClasses[color],
            animate && "player-progress"
          )}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    </div>
  );
}
