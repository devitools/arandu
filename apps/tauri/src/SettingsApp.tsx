import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WhisperSettings } from "@/components/settings/WhisperSettings";
import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { Toaster } from "@/components/ui/sonner";
import { useTranslation } from "react-i18next";
import { Mic, Settings } from "lucide-react";

const { getCurrentWindow } = window.__TAURI__.window;

export function SettingsApp() {
  const { t } = useTranslation();

  useEffect(() => {
    const currentWindow = getCurrentWindow();
    if (currentWindow.label !== "settings") return;

    currentWindow.setTitle(t("settings.title")).catch(console.error);

    const handleClose = currentWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await currentWindow.hide();
    });

    return () => {
      handleClose.then((fn) => fn());
    };
  }, [t]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="arandu-theme">
      <TooltipProvider>
        <div className="h-screen overflow-hidden bg-background text-foreground flex flex-col">
          <div className="p-6 flex-1 overflow-y-auto">
            <h1 className="text-lg font-semibold mb-4">{t("settings.title")}</h1>
            <Tabs defaultValue="whisper">
              <TabsList className="mb-4">
                <TabsTrigger value="whisper" className="gap-1.5">
                  <Mic className="h-3.5 w-3.5" />
                  {t("settings.whisper")}
                </TabsTrigger>
                <TabsTrigger value="general" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  {t("settings.general")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="whisper">
                <WhisperSettings />
              </TabsContent>
              <TabsContent value="general">
                <GeneralSettings />
              </TabsContent>
            </Tabs>
          </div>
          <Toaster position="bottom-center" />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}
