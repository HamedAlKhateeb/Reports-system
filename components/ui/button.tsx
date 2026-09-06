import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

export const variantStyles: Record<string, string> = {
  default: "bg-[#2E4034] text-white hover:bg-[#24382F] shadow-xs",
  destructive: "bg-red-600 text-white hover:bg-red-700 shadow-xs",
  outline: "border border-border bg-background text-foreground hover:bg-muted/80 shadow-2xs",
  secondary: "bg-muted text-foreground hover:bg-muted/80",
  ghost: "hover:bg-muted/80 text-foreground",
  link: "text-olive-700 dark:text-olive-400 underline-offset-4 hover:underline",
};

export const sizeStyles: Record<string, string> = {
  default: "h-9 px-4 py-2 text-xs",
  sm: "h-8 rounded-lg px-2.5 text-xs",
  lg: "h-10 rounded-lg px-6 text-sm",
  icon: "h-8 w-8 rounded-lg p-0",
};

export function buttonVariants({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-olive-600 disabled:pointer-events-none disabled:opacity-50 select-none",
    variantStyles[variant],
    sizeStyles[size],
    className
  );
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={buttonVariants({ variant, size, className })}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
