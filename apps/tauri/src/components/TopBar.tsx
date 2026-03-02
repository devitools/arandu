import logoSvg from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MicButton } from "@/components/MicButton";
import { Monitor, Moon, Settings, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

const { invoke } = window.__TAURI__.core;

export function TopBar () {
  const { theme, setTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <div
      className="topbar relative py-1 px-3 flex items-center justify-between select-none"
      style={{ paddingLeft: "90px" }}
      data-tauri-drag-region="true"
    >
      <div
        className="flex items-center gap-3"
        data-tauri-drag-region="true"
      >
        <div
          className="flex items-center gap-2"
          data-tauri-drag-region="true"
        >
          <img
            src={logoSvg}
            alt="Arandu Logo"
            className="w-4 h-4 rounded pointer-events-none"
          />
          <span className="font-semibold text-xs text-muted-foreground">Arandu</span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <MicButton />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => invoke("show_settings_window")}
          title={t("settings.openSettings")}
        >
          <Settings className="h-4 w-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
            >
              {theme === "light" && <Sun className="h-4 w-4" />}
              {theme === "dark" && <Moon className="h-4 w-4" />}
              {theme === "system" && <Monitor className="h-4 w-4" />}
              <span className="sr-only">{t('theme.toggle')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="mr-2 h-4 w-4" />
              {t('theme.light')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" />
              {t('theme.dark')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="mr-2 h-4 w-4" />
              {t('theme.system')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
