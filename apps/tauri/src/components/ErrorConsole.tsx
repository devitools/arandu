import { AlertCircle, X } from "lucide-react";

interface ErrorConsoleProps {
  errors: string[];
  onClear: () => void;
}

export function ErrorConsole({ errors, onClear }: ErrorConsoleProps) {
  if (errors.length === 0) return null;

  const lastError = errors[errors.length - 1];

  return (
    <div className="border-t border-destructive/20 bg-destructive/5 px-3 py-2 flex items-start gap-2">
      <AlertCircle className="h-3.5 w-3.5 text-destructive/60 mt-0.5 shrink-0" />
      <p className="flex-1 font-mono text-xs text-destructive/70 break-words leading-relaxed">
        {lastError}
        {errors.length > 1 && (
          <span className="ml-2 text-destructive/40">(+{errors.length - 1})</span>
        )}
      </p>
      <button
        onClick={onClear}
        className="shrink-0 text-muted-foreground/40 hover:text-destructive transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
