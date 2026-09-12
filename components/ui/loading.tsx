import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

interface PageLoadingProps {
  label?: string;
  className?: string;
  spinnerClassName?: string;
}

/**
 * Shared full-area loading indicator (shadcn Spinner, semantic color,
 * screen-reader label). Replaces the 11 hand-rolled
 * `animate-spin rounded-full border-*-* border-t-transparent` divs that
 * drifted in color/size across pages.
 */
export function PageLoading({ label, className, spinnerClassName }: PageLoadingProps) {
  return (
    <div className={cn('flex items-center justify-center gap-2.5', className)} role="status">
      <Spinner className={cn('size-8 text-primary', spinnerClassName)} />
      {label ? (
        <span className="text-sm text-muted-foreground">{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}
