const { invoke } = window.__TAURI__.core;

let cachedHome: string | undefined;

export async function initHomeDir() {
  if (cachedHome !== undefined) return;
  cachedHome = (await invoke<string | null>("get_home_dir")) ?? "";
}

export function shortenPath(path: string): string {
  let p = path;
  if (cachedHome && p.startsWith(cachedHome)) {
    p = "~" + p.slice(cachedHome.length);
  }
  return p;
}
