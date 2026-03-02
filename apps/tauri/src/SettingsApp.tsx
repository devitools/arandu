import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WhisperSettings } from "@/components/settings/WhisperSettings";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { CliInstallSettings } from "@/components/settings/CliInstallSettings";
import { Toaster } from "@/components/ui/sonner";
import { useTranslation } from "react-i18next";
import { Mic, Settings, Terminal } from "lucide-react";

const { getCurrentWindow } = window.__TAURI__.window;
const { listen } = window.__TAURI__.event;

export function SettingsApp() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("whisper");

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    if (currentWindow.label !== "settings") return;

    const handleClose = currentWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await currentWindow.hide();
    });

    return () => {
      handleClose.then((fn) => fn());
    };
  }, [t]);

  useEffect(() => {
    const unlisten = listen<string>("open-settings-tab", (event) => {
      setActiveTab(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="arandu-theme">
      <TooltipProvider>
        <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
          <div className="p-6 flex-1 overflow-y-auto">
            <h1 className="text-lg font-semibold mb-4">{t("settings.title")}</h1>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="whisper" className="gap-1.5">
                  <Mic className="h-3.5 w-3.5" />
                  {t("settings.whisper")}
                </TabsTrigger>
                <TabsTrigger value="general" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  {t("settings.general")}
                </TabsTrigger>
                <TabsTrigger value="cli" className="gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  {t("settings.cli")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="whisper">
                <WhisperSettings />
              </TabsContent>
              <TabsContent value="general">
                <GeneralSettings />
              </TabsContent>
              <TabsContent value="cli">
                <CliInstallSettings />
              </TabsContent>
            </Tabs>
          </div>
          <Toaster position="bottom-center" />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
