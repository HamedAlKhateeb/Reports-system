'use client';

import * as React from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  type?: 'default' | 'success' | 'destructive' | 'info';
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function notify() {
  listeners.forEach((listener) => listener([...toasts]));
}

export function toast(opts: string | Omit<ToastItem, 'id'>) {
  const item: ToastItem =
    typeof opts === 'string'
      ? { id: 't_' + Math.random().toString(36).slice(2), title: opts, type: 'success' }
      : { id: 't_' + Math.random().toString(36).slice(2), type: 'default', ...opts };

  toasts.push(item);
  notify();

  const duration = item.duration || 4000;
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    notify();
  }, duration);

  return item.id;
}

toast.success = (title: string, opts?: string | { description?: string }) => {
  const description = typeof opts === 'string' ? opts : opts?.description;
  return toast({ title, description, type: 'success' });
};

toast.error = (title: string, opts?: string | { description?: string }) => {
  const description = typeof opts === 'string' ? opts : opts?.description;
  return toast({ title, description, type: 'destructive' });
};

toast.info = (title: string, opts?: string | { description?: string }) => {
  const description = typeof opts === 'string' ? opts : opts?.description;
  return toast({ title, description, type: 'info' });
};

export function Toaster() {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    const handleUpdate: ToastListener = (updated) => setItems(updated);
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none p-4"
    >
      {items.map((item) => {
        const isSuccess = item.type === 'success';
        const isError = item.type === 'destructive';
        const isInfo = item.type === 'info';

        return (
          <div
            key={item.id}
            role={isError ? "alert" : "status"}
            aria-live={isError ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-lg transition-all animate-in slide-in-from-bottom-5 duration-200",
              isSuccess && "bg-background border-emerald-500/30 text-foreground",
              isError && "bg-destructive text-destructive-foreground border-destructive",
              isInfo && "bg-background border-blue-500/30 text-foreground",
              !isSuccess && !isError && !isInfo && "bg-background border-border text-foreground"
            )}
          >
            {isSuccess && <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
            {isError && <AlertCircle className="size-5 shrink-0 mt-0.5" />}
            {isInfo && <Info className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />}

            <div className="flex-1 flex flex-col gap-1">
              {item.title && <div className="text-xs font-bold leading-none">{item.title}</div>}
              {item.description && <div className="text-xs text-muted-foreground leading-relaxed">{item.description}</div>}
            </div>

            <button
              type="button"
              onClick={() => {
                toasts = toasts.filter((t) => t.id !== item.id);
                notify();
              }}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
