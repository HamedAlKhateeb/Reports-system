import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning";
}

const badgeVariants: Record<string, string> = {
  default: "border-transparent bg-[#2E4034] text-white",
  secondary: "border-transparent bg-[#F4F6F4] dark:bg-[#282827] text-[#6B6964] dark:text-[#9E9C96]",
  destructive: "border-transparent bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300",
  success: "border-transparent bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800",
  warning: "border-transparent bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
  outline: "border-[#E7E6E2] dark:border-[#2B2B29] text-[#202020] dark:text-[#F2F2EE]",
};

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-olive-600",
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
