import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { AlertCircle, X } from "lucide-react";

interface ErrorConsoleProps {
  errors: string[];
  onClear: () => void;
}

export function ErrorConsole ({ errors, onClear }: ErrorConsoleProps) {
  const { t } = useTranslation();
  if (errors.length === 0) return null;

  const lastError = errors[errors.length - 1];

  return (
    <div className="border-t border-destructive/20 bg-destructive/20 px-3 py-2 flex items-start gap-2">
      <AlertCircle className="h-3.5 w-3.5 text-foreground/60 mt-0.5 shrink-0" />
      <p className="flex-1 font-mono text-xs text-foreground/70 break-words leading-relaxed">
        {lastError}
        {errors.length > 1 && (
          <span className="ml-2 text-foreground/40">(+{errors.length - 1})</span>
        )}
      </p>
      <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="h-6 w-6 shrink-0 text-muted-foreground/40 hover:text-foreground"
          aria-label={t("common.dismiss")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
    </div>
  );
}
