import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/lib/theme";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import { updateTrayLabels, updateMenuLabels } from "@/lib/tray-sync";
import { useState } from "react";

const COPILOT_PATH_KEY = "arandu-copilot-path";
const GH_TOKEN_KEY = "arandu-gh-token";
const PROVIDER_KEY = "arandu-provider";
const CLAUDE_PATH_KEY = "arandu-claude-path";
const CLAUDE_MODEL_KEY = "arandu-claude-model";
const CLAUDE_SKIP_PERMISSIONS_KEY = "arandu-claude-skip-permissions";
const CLAUDE_MAX_BUDGET_KEY = "arandu-claude-max-budget";

export function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const [provider, setProvider] = useState(
    () => localStorage.getItem(PROVIDER_KEY) ?? "copilot"
  );
  const [copilotPath, setCopilotPath] = useState(
    () => localStorage.getItem(COPILOT_PATH_KEY) ?? ""
  );
  const [ghToken, setGhToken] = useState(
    () => localStorage.getItem(GH_TOKEN_KEY) ?? ""
  );
  const [claudePath, setClaudePath] = useState(
    () => localStorage.getItem(CLAUDE_PATH_KEY) ?? ""
  );
  const [claudeModel, setClaudeModel] = useState(
    () => localStorage.getItem(CLAUDE_MODEL_KEY) ?? ""
  );
  const [claudeSkipPermissions, setClaudeSkipPermissions] = useState(
    () => localStorage.getItem(CLAUDE_SKIP_PERMISSIONS_KEY) === "true"
  );
  const [claudeMaxBudget, setClaudeMaxBudget] = useState(
    () => localStorage.getItem(CLAUDE_MAX_BUDGET_KEY) ?? ""
  );

  function handleProviderChange(value: string) {
    setProvider(value);
    localStorage.setItem(PROVIDER_KEY, value);
  }

  function handleCopilotPathChange(value: string) {
    setCopilotPath(value);
    if (value.trim()) {
      localStorage.setItem(COPILOT_PATH_KEY, value.trim());
    } else {
      localStorage.removeItem(COPILOT_PATH_KEY);
    }
  }

  function handleGhTokenChange(value: string) {
    setGhToken(value);
    if (value.trim()) {
      localStorage.setItem(GH_TOKEN_KEY, value.trim());
    } else {
      localStorage.removeItem(GH_TOKEN_KEY);
    }
  }

  function handleClaudePathChange(value: string) {
    setClaudePath(value);
    if (value.trim()) {
      localStorage.setItem(CLAUDE_PATH_KEY, value.trim());
    } else {
      localStorage.removeItem(CLAUDE_PATH_KEY);
    }
  }

  function handleClaudeModelChange(value: string) {
    setClaudeModel(value);
    if (value.trim()) {
      localStorage.setItem(CLAUDE_MODEL_KEY, value.trim());
    } else {
      localStorage.removeItem(CLAUDE_MODEL_KEY);
    }
  }

  function handleClaudeSkipPermissionsChange(checked: boolean) {
    setClaudeSkipPermissions(checked);
    if (checked) {
      localStorage.setItem(CLAUDE_SKIP_PERMISSIONS_KEY, "true");
    } else {
      localStorage.removeItem(CLAUDE_SKIP_PERMISSIONS_KEY);
    }
  }

  function handleClaudeMaxBudgetChange(value: string) {
    setClaudeMaxBudget(value);
    if (value.trim()) {
      localStorage.setItem(CLAUDE_MAX_BUDGET_KEY, value.trim());
    } else {
      localStorage.removeItem(CLAUDE_MAX_BUDGET_KEY);
    }
  }

  return (
    <div className="space-y-6">
      {/* AI Provider */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("settings.provider")}</Label>
        <Select value={provider} onValueChange={handleProviderChange}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="copilot">{t("settings.providerCopilot")}</SelectItem>
            <SelectItem value="claude">{t("settings.providerClaude")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {provider === "copilot" && (
        <>
          {/* GitHub Token */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("settings.ghToken")}</Label>
            <Input
              className="w-full font-mono text-sm"
              type="password"
              placeholder={t("settings.ghTokenPlaceholder")}
              value={ghToken}
              onChange={(e) => handleGhTokenChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("settings.ghTokenHint")}</p>
          </div>

          {/* Copilot Binary Path */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("settings.copilotPath")}</Label>
            <Input
              className="w-full font-mono text-sm"
              placeholder={t("settings.copilotPathPlaceholder")}
              value={copilotPath}
              onChange={(e) => handleCopilotPathChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("settings.copilotPathHint")}</p>
          </div>
        </>
      )}

      {provider === "claude" && (
        <>
          {/* Claude Binary Path */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("settings.claudePath")}</Label>
            <Input
              className="w-full font-mono text-sm"
              placeholder={t("settings.claudePathPlaceholder")}
              value={claudePath}
              onChange={(e) => handleClaudePathChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("settings.claudePathHint")}</p>
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("settings.claudeModel")}</Label>
            <Input
              className="w-full font-mono text-sm"
              placeholder={t("settings.claudeModelPlaceholder")}
              value={claudeModel}
              onChange={(e) => handleClaudeModelChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("settings.claudeModelHint")}</p>
          </div>

          {/* Max Budget */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t("settings.claudeMaxBudget")}</Label>
            <Input
              className="w-full font-mono text-sm"
              placeholder={t("settings.claudeMaxBudgetPlaceholder")}
              value={claudeMaxBudget}
              onChange={(e) => handleClaudeMaxBudgetChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("settings.claudeMaxBudgetHint")}</p>
          </div>

          {/* Skip Permissions */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="claude-skip-permissions"
                checked={claudeSkipPermissions}
                onCheckedChange={(checked) => handleClaudeSkipPermissionsChange(!!checked)}
              />
              <Label htmlFor="claude-skip-permissions" className="text-sm font-medium cursor-pointer">
                {t("settings.claudeSkipPermissions")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.claudeSkipPermissionsHint")}</p>
          </div>

          {/* Auth hint */}
          <div className="rounded-md border border-border p-3 text-xs text-muted-foreground">
            <span className="font-medium">{t("settings.claudeAuth")}:</span>{" "}
            {t("settings.claudeAuthNotLoggedIn")}
          </div>
        </>
      )}

      {/* Theme */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("settings.theme")}</Label>
        <Select value={theme} onValueChange={setTheme}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">
              <div className="flex items-center gap-2">
                <Sun className="h-3.5 w-3.5" />
                {t("theme.light")}
              </div>
            </SelectItem>
            <SelectItem value="dark">
              <div className="flex items-center gap-2">
                <Moon className="h-3.5 w-3.5" />
                {t("theme.dark")}
              </div>
            </SelectItem>
            <SelectItem value="system">
              <div className="flex items-center gap-2">
                <Monitor className="h-3.5 w-3.5" />
                {t("theme.system")}
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Language */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("settings.language")}</Label>
        <Select value={i18n.language} onValueChange={(lng) => {
          i18n.changeLanguage(lng);
          updateTrayLabels(lng);
          updateMenuLabels(lng);
        }}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pt-BR">Português (BR)</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
