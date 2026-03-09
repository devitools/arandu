import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, RefreshCw, Loader2 } from "lucide-react";
import type { AcpSessionMode, AcpSessionConfigOption } from "@/types/acp";

interface AcpSessionControlsProps {
  disabled: boolean;
  currentModeId: string | null;
  availableModes: AcpSessionMode[];
  configOptions: AcpSessionConfigOption[];
  selectedConfigOptions: Record<string, string>;
  onSelectMode: (modeId: string) => void;
  onSelectConfigOption: (configId: string, optionId: string) => void;
  onRefresh?: () => void | Promise<void>;
}

function extractModeName(mode: AcpSessionMode): string {
  if (mode.name) return mode.name;
  const parts = mode.id.split("#");
  const slug = parts[parts.length - 1];
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

function currentModeName(modes: AcpSessionMode[], currentId: string | null): string {
  if (!currentId) return "—";
  const found = modes.find((m) => m.id === currentId);
  return found ? extractModeName(found) : currentId.split("#").pop() ?? currentId;
}

export function AcpSessionControls({
  disabled,
  currentModeId,
  availableModes,
  configOptions,
  selectedConfigOptions,
  onSelectMode,
  onSelectConfigOption,
  onRefresh,
}: AcpSessionControlsProps) {
  const { t } = useTranslation();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh, refreshing]);

  const { modelOption, agentOption, advancedOptions } = useMemo(() => {
    let model: AcpSessionConfigOption | undefined;
    let agent: AcpSessionConfigOption | undefined;
    const advanced: AcpSessionConfigOption[] = [];

    for (const opt of configOptions) {
      const id = opt.id.toLowerCase();
      const cat = (opt.category ?? "").toLowerCase();
      if (cat === "model" || id.includes("model")) {
        model = opt;
      } else if (cat === "agent" || id.includes("agent")) {
        agent = opt;
      } else {
        advanced.push(opt);
      }
    }

    return { modelOption: model, agentOption: agent, advancedOptions: advanced };
  }, [configOptions]);

  const hasContent = availableModes.length > 0 || configOptions.length > 0;

  if (!hasContent) {
    return (
      <button
        className="flex items-center gap-1 text-[10px] text-muted-foreground/40 px-1 hover:text-muted-foreground transition-colors disabled:opacity-50"
        onClick={() => void handleRefresh()}
        disabled={!onRefresh || refreshing}
        title={onRefresh ? t("acp.refreshInfo") : undefined}
      >
        {t("acp.unavailableFromAcp")}
        {onRefresh && (refreshing
          ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
          : <RefreshCw className="h-2.5 w-2.5" />
        )}
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {availableModes.length > 0 && (
        <ControlDropdown
          label={t("acp.modeLabel")}
          value={currentModeName(availableModes, currentModeId)}
          options={availableModes.map((m) => ({ id: m.id, label: extractModeName(m) }))}
          selectedId={currentModeId}
          onSelect={onSelectMode}
        />
      )}

      {modelOption && (
        <ConfigOptionDropdown
          label={t("acp.modelLabel")}
          option={modelOption}
          selectedValue={selectedConfigOptions[modelOption.id]}
          onSelect={(optionId) => onSelectConfigOption(modelOption.id, optionId)}
        />
      )}

      {agentOption && (
        <ConfigOptionDropdown
          label={t("acp.agentLabel")}
          option={agentOption}
          selectedValue={selectedConfigOptions[agentOption.id]}
          onSelect={(optionId) => onSelectConfigOption(agentOption.id, optionId)}
        />
      )}

      {advancedOptions.length > 0 && (
        <AdvancedDropdown
          label={t("acp.advancedLabel")}
          count={advancedOptions.length}
          options={advancedOptions}
          selectedConfigOptions={selectedConfigOptions}
          onSelect={onSelectConfigOption}
          t={t}
        />
      )}
    </div>
  );
}

interface ControlDropdownProps {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ControlDropdown({ label, value, options, selectedId, onSelect }: ControlDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <span className="text-muted-foreground/60">{label}:</span>
          <span className="font-medium">{value}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            className={`text-xs ${opt.id === selectedId ? "font-semibold" : ""}`}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ConfigOptionDropdownProps {
  label: string;
  option: AcpSessionConfigOption;
  selectedValue?: string;
  onSelect: (optionId: string) => void;
}

function ConfigOptionDropdown({ label, option, selectedValue, onSelect }: ConfigOptionDropdownProps) {
  const items = (option.options ?? []).map((o) => {
    if (typeof o === "string") return { id: o, label: o };
    return { id: o.id ?? o.value ?? "", label: o.label ?? o.name ?? o.id ?? o.value ?? "" };
  });

  const currentLabel = items.find((i) => i.id === selectedValue)?.label ?? selectedValue ?? "—";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <span className="text-muted-foreground/60">{label}:</span>
          <span className="font-medium truncate max-w-[100px]">{currentLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {items.map((item) => (
          <DropdownMenuItem
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`text-xs ${item.id === selectedValue ? "font-semibold" : ""}`}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AdvancedDropdownProps {
  label: string;
  count: number;
  options: AcpSessionConfigOption[];
  selectedConfigOptions: Record<string, string>;
  onSelect: (configId: string, optionId: string) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

function AdvancedDropdown({ label, count, options, selectedConfigOptions, onSelect, t }: AdvancedDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <span className="text-muted-foreground/60">{label}</span>
          <span className="text-[10px] text-muted-foreground/40">
            ({t("acp.advancedAvailable", { count })})
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px] max-h-[300px] overflow-y-auto">
        {options.map((opt) => {
          const items = (opt.options ?? []).map((o) => {
            if (typeof o === "string") return { id: o, label: o };
            return { id: o.id ?? o.value ?? "", label: o.label ?? o.name ?? o.id ?? o.value ?? "" };
          });
          const selected = selectedConfigOptions[opt.id];
          return (
            <DropdownMenu key={opt.id}>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-muted rounded transition-colors">
                  <span>{opt.name ?? opt.id}</span>
                  <span className="text-[10px] text-muted-foreground/60 ml-2">
                    {items.find((i) => i.id === selected)?.label ?? selected ?? "—"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" className="min-w-[120px]">
                {items.map((item) => (
                  <DropdownMenuItem
                    key={item.id}
                    onClick={() => onSelect(opt.id, item.id)}
                    className={`text-xs ${item.id === selected ? "font-semibold" : ""}`}
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
