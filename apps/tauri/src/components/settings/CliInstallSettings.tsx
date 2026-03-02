import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Circle } from "lucide-react";

const { invoke } = window.__TAURI__.core;

interface CliStatus {
  installed: boolean;
  dismissed: boolean;
}

interface InstallResult {
  success: boolean;
  path: string;
  error: string;
}

export function CliInstallSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [suggestedPaths, setSuggestedPaths] = useState<string[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<InstallResult | null>(null);

  useEffect(() => {
    invoke<CliStatus>("check_cli_status")
      .then(setStatus)
      .catch(console.error);

    invoke<string[]>("get_cli_suggested_paths")
      .then((paths) => {
        setSuggestedPaths(paths);
        if (paths.length > 0) setSelectedPath(paths[0]);
      })
      .catch(console.error);
  }, []);

  async function handleInstall() {
    if (!selectedPath.trim()) return;
    setInstalling(true);
    setResult(null);
    try {
      const r = await invoke<InstallResult>("install_cli_to_path", { path: selectedPath.trim() });
      setResult(r);
      if (r.success) {
        setStatus((prev) => prev ? { ...prev, installed: true } : { installed: true, dismissed: false });
      }
    } catch (e) {
      setResult({ success: false, path: "", error: String(e) });
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="flex items-center gap-2">
        {status?.installed ? (
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="text-sm text-muted-foreground">
          {status?.installed
            ? t("settings.cliStatusInstalled")
            : t("settings.cliStatusNotInstalled")}
        </span>
      </div>

      {/* Suggested paths */}
      {suggestedPaths.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("settings.cliSuggestedPaths")}</Label>
          <div className="flex flex-wrap gap-2">
            {suggestedPaths.map((p) => (
              <Badge
                key={p}
                variant={selectedPath === p ? "default" : "outline"}
                className="cursor-pointer font-mono text-xs"
                onClick={() => { setSelectedPath(p); setResult(null); }}
              >
                {p}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Custom path input */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("settings.cliCustomPath")}</Label>
        <Input
          className="font-mono text-sm"
          placeholder={t("settings.cliCustomPathPlaceholder")}
          value={selectedPath}
          onChange={(e) => { setSelectedPath(e.target.value); setResult(null); }}
        />
      </div>

      {/* Install button */}
      <Button
        onClick={handleInstall}
        disabled={installing || !selectedPath.trim()}
        size="sm"
      >
        {installing ? t("settings.cliInstalling") : t("settings.cliInstall")}
      </Button>

      {/* Feedback */}
      {result && (
        <p className={`text-xs ${result.success ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
          {result.success
            ? t("settings.cliSuccess", { path: result.path })
            : t("settings.cliError", { error: result.error })}
        </p>
      )}

      {/* Hint */}
      <p className="text-xs text-muted-foreground">{t("settings.cliHint")}</p>
    </div>
  );
}
