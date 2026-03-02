import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { Monitor, Moon, Sun } from "lucide-react";
import { updateTrayLabels, updateMenuLabels } from "@/lib/tray-sync";
import { useState } from "react";

const COPILOT_PATH_KEY = "arandu-copilot-path";
const GH_TOKEN_KEY = "arandu-gh-token";

export function GeneralSettings() {
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const [copilotPath, setCopilotPath] = useState(
    () => localStorage.getItem(COPILOT_PATH_KEY) ?? ""
  );
  const [ghToken, setGhToken] = useState(
    () => localStorage.getItem(GH_TOKEN_KEY) ?? ""
  );

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

  return (
    <div className="space-y-6">
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
