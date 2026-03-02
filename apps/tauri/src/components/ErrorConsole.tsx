import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorConsoleProps {
  errors: string[];
  onClear: () => void;
}

export function ErrorConsole({ errors, onClear }: ErrorConsoleProps) {
  const [expanded, setExpanded] = useState(true);

  if (errors.length === 0) return null;

  return (
    <div className="border-t border-destructive/30 bg-destructive/5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-1.5 text-xs font-mono text-destructive hover:bg-destructive/10 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>Errors ({errors.length})</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 ml-auto text-destructive/60 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </button>
      {expanded && (
        <div className="px-4 py-2 max-h-[120px] overflow-y-auto">
          {errors.map((error, i) => (
            <div key={i} className="font-mono text-xs text-destructive/80 py-0.5 break-words">
              {error}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
