import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Download, Keyboard, Loader2, Mic, Shield, Trash2 } from "lucide-react";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

interface ModelInfo {
  id: string;
  filename: string;
  url: string;
  size_bytes: number;
  description: string;
}

interface ModelStatus {
  info: ModelInfo;
  downloaded: boolean;
  path: string | null;
}

interface WhisperSettingsData {
  active_model: string | null;
  language: string;
  shortcut: string;
  cancel_shortcut: string;
  selected_device: string | null;
  long_recording_threshold: number;
}

interface AudioDevice {
  name: string;
  is_default: boolean;
}

interface DownloadProgress {
  model_id: string;
  downloaded: number;
  total: number;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  return `${Math.round(bytes / 1_000_000)} MB`;
}

export function WhisperSettings() {
  const { t } = useTranslation();
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [settings, setSettings] = useState<WhisperSettingsData | null>(null);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [shortcutEditing, setShortcutEditing] = useState(false);
  const [shortcutValue, setShortcutValue] = useState("");
  const [cancelShortcutEditing, setCancelShortcutEditing] = useState(false);
  const [cancelShortcutValue, setCancelShortcutValue] = useState("");

  const loadData = async () => {
    try {
      const [modelsData, settingsData, devicesData] = await Promise.all([
        invoke<ModelStatus[]>("list_models"),
        invoke<WhisperSettingsData>("get_whisper_settings"),
        invoke<AudioDevice[]>("list_audio_devices"),
      ]);
      setModels(modelsData);
      setSettings(settingsData);
      setDevices(devicesData);
      setShortcutValue(settingsData.shortcut);
      setCancelShortcutValue(settingsData.cancel_shortcut);
    } catch (err) {
      console.error("Failed to load whisper settings:", err);
    }
  };

  useEffect(() => {
    loadData();

    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      const { total, downloaded } = event.payload;
      if (total > 0) {
        setDownloadProgress(Math.round((downloaded / total) * 100));
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleDownload = async (modelId: string) => {
    setDownloading(modelId);
    setDownloadProgress(0);
    try {
      await invoke("download_model", { modelId });
      await loadData();
      toast.success(t("whisper.downloadComplete", { defaultValue: "Download complete" }));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setDownloading(null);
      setDownloadProgress(0);
    }
  };

  const handleDelete = async (modelId: string) => {
    try {
      await invoke("delete_model", { modelId });
      await loadData();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleActivate = async (modelId: string) => {
    try {
      await invoke("set_active_model", { modelId });
      await loadData();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleDeviceChange = async (value: string) => {
    const deviceName = value === "__default__" ? null : value;
    try {
      await invoke("set_audio_device", { deviceName });
      await loadData();
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleThresholdChange = async (value: string) => {
    if (!settings) return;
    const threshold = parseInt(value, 10);
    if (isNaN(threshold) || threshold < 10) return;
    const updated = { ...settings, long_recording_threshold: threshold };
    try {
      await invoke("set_whisper_settings", { settings: updated });
      setSettings(updated);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleShortcutSave = async () => {
    if (!shortcutValue.trim()) return;
    try {
      await invoke("set_shortcut", { shortcut: shortcutValue });
      setShortcutEditing(false);
      await loadData();
      toast.success(t("whisper.shortcutSaved", { defaultValue: "Shortcut saved" }));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleCancelShortcutSave = async () => {
    if (!cancelShortcutValue.trim()) return;
    try {
      await invoke("set_cancel_shortcut", { shortcut: cancelShortcutValue });
      setCancelShortcutEditing(false);
      await loadData();
      toast.success(t("whisper.shortcutSaved", { defaultValue: "Shortcut saved" }));
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleCheckPermissions = async () => {
    try {
      await invoke("check_audio_permissions");
      toast.success(t("whisper.permissionsOk"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Models */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">{t("whisper.models")}</Label>
        <div className="space-y-2">
          {models.map((model) => {
            const isActive = settings.active_model === model.info.id;
            const isDownloading = downloading === model.info.id;

            return (
              <div
                key={model.info.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{model.info.description}</span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                        {t("whisper.active")}
                      </span>
                    )}
                  </div>
                  {isDownloading && (
                    <Progress value={downloadProgress} className="mt-2 h-1.5" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 ml-3">
                  {isDownloading ? (
                    <Button size="sm" variant="ghost" disabled className="h-7 text-xs">
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      {downloadProgress}%
                    </Button>
                  ) : model.downloaded ? (
                    <>
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleActivate(model.info.id)}
                        >
                          {t("whisper.use")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(model.info.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => handleDownload(model.info.id)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" />
                      {t("whisper.download")} ({formatSize(model.info.size_bytes)})
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Microphone */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("whisper.audioDevice")}</Label>
        <div className="flex items-center gap-2">
          <Select
            value={settings.selected_device ?? "__default__"}
            onValueChange={handleDeviceChange}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">{t("whisper.defaultDevice")}</SelectItem>
              {devices.map((d) => (
                <SelectItem key={d.name} value={d.name}>
                  {d.name} {d.is_default ? `(${t("whisper.defaultDevice")})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleCheckPermissions}
            title={t("whisper.checkPermissions")}
          >
            <Shield className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Long Recording Alert */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("whisper.longRecordingAlert")}</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={10}
            max={600}
            value={settings.long_recording_threshold}
            onChange={(e) => handleThresholdChange(e.target.value)}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">{t("whisper.seconds")}</span>
        </div>
      </div>

      {/* Shortcut */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          <Keyboard className="h-3.5 w-3.5 inline mr-1.5" />
          {t("whisper.shortcut")}
        </Label>
        <div className="flex items-center gap-2">
          {shortcutEditing ? (
            <>
              <Input
                value={shortcutValue}
                onChange={(e) => setShortcutValue(e.target.value)}
                placeholder="Alt+Space"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleShortcutSave();
                  if (e.key === "Escape") {
                    setShortcutEditing(false);
                    setShortcutValue(settings.shortcut);
                  }
                }}
              />
              <Button size="sm" className="h-9" onClick={handleShortcutSave}>
                Save
              </Button>
            </>
          ) : (
            <>
              <code className="px-2 py-1.5 rounded bg-muted text-sm font-mono">
                {settings.shortcut}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShortcutEditing(true)}
              >
                {t("whisper.changeShortcut")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Cancel Shortcut */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">
          <Keyboard className="h-3.5 w-3.5 inline mr-1.5" />
          {t("whisper.cancelShortcut")}
        </Label>
        <div className="flex items-center gap-2">
          {cancelShortcutEditing ? (
            <>
              <Input
                value={cancelShortcutValue}
                onChange={(e) => setCancelShortcutValue(e.target.value)}
                placeholder="Alt+Shift+Space"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCancelShortcutSave();
                  if (e.key === "Escape") {
                    setCancelShortcutEditing(false);
                    setCancelShortcutValue(settings.cancel_shortcut);
                  }
                }}
              />
              <Button size="sm" className="h-9" onClick={handleCancelShortcutSave}>
                Save
              </Button>
            </>
          ) : (
            <>
              <code className="px-2 py-1.5 rounded bg-muted text-sm font-mono">
                {settings.cancel_shortcut}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCancelShortcutEditing(true)}
              >
                {t("whisper.changeShortcut")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Check Permissions */}
      <div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={handleCheckPermissions}
        >
          <Mic className="h-3.5 w-3.5 mr-1.5" />
          {t("whisper.checkPermissions")}
        </Button>
      </div>
    </div>
  );
}
