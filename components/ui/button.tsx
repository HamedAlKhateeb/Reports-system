import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantStyles: Record<string, string> = {
  default: "bg-[#2E4034] text-white hover:bg-[#24382F] shadow-sm",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  outline: "border border-[#E7E6E2] dark:border-[#2B2B29] bg-white dark:bg-[#20201F] text-[#202020] dark:text-[#F2F2EE] hover:bg-[#F4F6F4] dark:hover:bg-[#282827]",
  secondary: "bg-olive-100 dark:bg-olive-900/30 text-olive-900 dark:text-olive-200 hover:bg-olive-200 dark:hover:bg-olive-900/50",
  ghost: "hover:bg-[#F4F6F4] dark:hover:bg-[#282827] text-[#202020] dark:text-[#F2F2EE]",
  link: "text-olive-700 dark:text-olive-400 underline-offset-4 hover:underline",
};

const sizeStyles: Record<string, string> = {
  default: "h-9 px-4 py-2 text-xs",
  sm: "h-8 rounded-lg px-3 text-xs",
  lg: "h-10 rounded-xl px-6 text-sm",
  icon: "h-9 w-9 rounded-xl",
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive-600 disabled:pointer-events-none disabled:opacity-50 select-none",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
