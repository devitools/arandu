import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import type { AcpSessionConfigOption, AcpSessionMode } from "@/types/acp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AcpSessionControlsProps {
  disabled: boolean;
  currentModeId: string | null;
  availableModes: AcpSessionMode[];
  configOptions: AcpSessionConfigOption[];
  selectedConfigOptions: Record<string, string>;
  onSelectMode: (modeId: string) => void;
  onSelectConfigOption: (configId: string, optionId: string) => void;
}

interface ResolvedOption {
  id: string;
  label: string;
}

const CHIP_CLASS =
  "flex items-center gap-1 px-2 py-0.5 rounded hover:bg-muted transition-colors flex-shrink-0 disabled:opacity-50 disabled:pointer-events-none";

function normalizeModeSlug(modeId: string): string {
  const hash = modeId.split("#").pop();
  if (hash) return hash.toLowerCase();
  const parts = modeId.split("/");
  return parts[parts.length - 1]?.toLowerCase() ?? modeId.toLowerCase();
}

function normalizeSearch(value: string | undefined | null): string {
  return (value ?? "").toLowerCase();
}

function resolveOptionId(option: unknown): string | null {
  if (typeof option === "string") return option;
  if (!option || typeof option !== "object") return null;
  const optionRecord = option as Record<string, unknown>;
  return (
    (typeof optionRecord.optionId === "string" && optionRecord.optionId) ||
    (typeof optionRecord.id === "string" && optionRecord.id) ||
    (typeof optionRecord.value === "string" && optionRecord.value) ||
    null
  );
}

function resolveOptionLabel(option: unknown, fallbackId: string): string {
  if (typeof option === "string") return option;
  if (!option || typeof option !== "object") return fallbackId;
  const optionRecord = option as Record<string, unknown>;
  return (
    (typeof optionRecord.label === "string" && optionRecord.label) ||
    (typeof optionRecord.name === "string" && optionRecord.name) ||
    (typeof optionRecord.description === "string" && optionRecord.description) ||
    fallbackId
  );
}

function getConfigChoices(config: AcpSessionConfigOption): ResolvedOption[] {
  const options = config.options ?? [];
  const choices: ResolvedOption[] = [];
  for (const option of options) {
    const id = resolveOptionId(option);
    if (!id) continue;
    choices.push({
      id,
      label: resolveOptionLabel(option, id),
    });
  }
  return choices;
}

function getConfigLabel(config: AcpSessionConfigOption): string {
  return config.name || config.id;
}

function findModeLabel(mode: AcpSessionMode, t: (key: string) => string): string {
  if (mode.name?.trim()) return mode.name;
  const slug = normalizeModeSlug(mode.id);
  switch (slug) {
    case "ask":
      return t("acp.modeAsk");
    case "plan":
      return t("acp.modePlan");
    case "code":
      return t("acp.modeCode");
    case "autopilot":
      return t("acp.modeAutopilot");
    case "agent":
      return t("acp.modeAgent");
    case "edit":
      return t("acp.modeEdit");
    default:
      return mode.id;
  }
}

function isModelConfig(option: AcpSessionConfigOption): boolean {
  if (normalizeSearch(option.category) === "model") return true;
  const haystack = [option.id, option.name, option.description].map(normalizeSearch).join(" ");
  return haystack.includes("model");
}

function isAgentConfig(option: AcpSessionConfigOption): boolean {
  const haystack = [option.id, option.name, option.description, option.category]
    .map(normalizeSearch)
    .join(" ");
  return haystack.includes("agent");
}

export function AcpSessionControls({
  disabled,
  currentModeId,
  availableModes,
  configOptions,
  selectedConfigOptions,
  onSelectMode,
  onSelectConfigOption,
}: AcpSessionControlsProps) {
  const { t } = useTranslation();

  const modeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const mode of availableModes) {
      map.set(mode.id, findModeLabel(mode, t));
    }
    return map;
  }, [availableModes, t]);

  const currentModeLabel = currentModeId
    ? modeLabelMap.get(currentModeId) ?? currentModeId
    : t("acp.unavailableFromAcp");

  const modeDisabled = disabled || availableModes.length === 0;

  const { modelConfig, agentConfig, advancedConfigs } = useMemo(() => {
    const model = configOptions.find((option) => isModelConfig(option)) ?? null;
    const withoutModel = model
      ? configOptions.filter((option) => option.id !== model.id)
      : [...configOptions];
    const agent = withoutModel.find((option) => isAgentConfig(option)) ?? null;
    const advanced = withoutModel.filter((option) => option.id !== agent?.id);
    return {
      modelConfig: model,
      agentConfig: agent,
      advancedConfigs: advanced,
    };
  }, [configOptions]);

  const modelChoices = modelConfig ? getConfigChoices(modelConfig) : [];
  const agentChoices = agentConfig ? getConfigChoices(agentConfig) : [];
  const advancedSelectable = useMemo(
    () =>
      advancedConfigs
        .map((config) => ({ config, choices: getConfigChoices(config) }))
        .filter((entry) => entry.choices.length > 0),
    [advancedConfigs]
  );

  const modelUnavailable = !modelConfig || modelChoices.length === 0;
  const agentUnavailable = !agentConfig || agentChoices.length === 0;
  const advancedUnavailable = advancedSelectable.length === 0;

  const modelSelected = modelConfig
    ? selectedConfigOptions[modelConfig.id]
    : undefined;
  const modelSelectedLabel =
    modelChoices.find((choice) => choice.id === modelSelected)?.label ??
    t("acp.unavailableFromAcp");

  const agentSelected = agentConfig
    ? selectedConfigOptions[agentConfig.id]
    : undefined;
  const agentSelectedLabel =
    agentChoices.find((choice) => choice.id === agentSelected)?.label ??
    t("acp.unavailableFromAcp");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={CHIP_CLASS} disabled={modeDisabled}>
            <span className="text-xs text-muted-foreground">
              {t("acp.modeLabel")}: {currentModeLabel}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {availableModes.map((mode) => (
            <DropdownMenuItem
              key={mode.id}
              onClick={() => onSelectMode(mode.id)}
              className="text-xs"
            >
              {modeLabelMap.get(mode.id) ?? mode.id}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={CHIP_CLASS} disabled={disabled || modelUnavailable}>
            <span className="text-xs text-muted-foreground">
              {t("acp.modelLabel")}: {modelSelectedLabel}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {modelConfig &&
            modelChoices.map((choice) => (
              <DropdownMenuItem
                key={choice.id}
                onClick={() => onSelectConfigOption(modelConfig.id, choice.id)}
                className="text-xs"
              >
                {choice.label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={CHIP_CLASS} disabled={disabled || agentUnavailable}>
            <span className="text-xs text-muted-foreground">
              {t("acp.agentLabel")}: {agentSelectedLabel}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {agentConfig &&
            agentChoices.map((choice) => (
              <DropdownMenuItem
                key={choice.id}
                onClick={() => onSelectConfigOption(agentConfig.id, choice.id)}
                className="text-xs"
              >
                {choice.label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={CHIP_CLASS} disabled={disabled || advancedUnavailable}>
            <span className="text-xs text-muted-foreground">
              {t("acp.advancedLabel")}:{" "}
              {advancedUnavailable
                ? t("acp.unavailableFromAcp")
                : t("acp.advancedAvailable", { count: advancedSelectable.length })}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {advancedSelectable.map(({ config, choices }) => {
            const selectedOptionId = selectedConfigOptions[config.id];
            const selectedLabel =
              choices.find((choice) => choice.id === selectedOptionId)?.label ?? null;
            return (
              <DropdownMenuSub key={config.id}>
                <DropdownMenuSubTrigger className="text-xs">
                  {selectedLabel
                    ? `${getConfigLabel(config)}: ${selectedLabel}`
                    : getConfigLabel(config)}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {choices.map((choice) => (
                    <DropdownMenuItem
                      key={choice.id}
                      onClick={() => onSelectConfigOption(config.id, choice.id)}
                      className="text-xs"
                    >
                      {choice.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
          {advancedUnavailable && (
            <DropdownMenuItem disabled className="text-xs">
              {t("acp.unavailableFromAcp")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
