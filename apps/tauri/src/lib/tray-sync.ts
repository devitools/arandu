import en from "@/locales/en.json";
import ptBR from "@/locales/pt-BR.json";

const { invoke } = window.__TAURI__.core;

const translations: Record<string, typeof en> = {
  en,
  "pt-BR": ptBR,
};

export function updateTrayLabels(lng: string) {
  const t = translations[lng] ?? translations["pt-BR"];
  invoke("update_tray_labels", {
    show: t.tray.show,
    record: t.tray.record,
    settings: t.tray.settings,
    quit: t.tray.quit,
  }).catch(console.error);
}

export function updateMenuLabels(lng: string) {
  const t = translations[lng] ?? translations["pt-BR"];
  invoke("update_menu_labels", {
    settings: t.menu.arandu.settings,
    installCli: t.menu.arandu.installCli,
    fileMenu: t.menu.file.title,
    openFile: t.menu.file.open,
  }).catch(console.error);
}
