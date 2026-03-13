type InvokeResult =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, unknown>
  | Array<unknown>;

const noopAsync = async () => {};

function getBrowserInvokeFallback(command: string): InvokeResult {
  switch (command) {
    case "workspace_list":
    case "session_list":
    case "load_history":
      return [];
    case "plan_path":
    case "get_initial_file":
    case "get_home_dir":
      return null;
    case "render_markdown":
      return "";
    case "hash_file":
      return "";
    case "count_unresolved_comments":
      return 0;
    default:
      return null;
  }
}

if (typeof window !== "undefined" && !window.__TAURI__) {
  const browserTauriShim = {
    core: {
      invoke: async <T = unknown>(command: string) =>
        getBrowserInvokeFallback(command) as T,
    },
    window: {
      getCurrentWindow: () =>
        ({
          label: "main",
          hide: noopAsync,
          show: noopAsync,
          setFocus: noopAsync,
        }) as unknown,
    },
    dialog: {
      open: async () => null,
    },
    event: {
      listen: async () => () => {},
      emit: noopAsync,
    },
  } as Window["__TAURI__"];

  window.__TAURI__ = browserTauriShim;
}
