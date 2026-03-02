/// <reference types="vite/client" />
/// <reference types="@tauri-apps/api" />

interface Window {
  __TAURI__: {
    core: import("@tauri-apps/api/core")
    window: import("@tauri-apps/api/window")
    dialog: {
      open(options?: {
        multiple?: boolean
        directory?: boolean
        filters?: Array<{ name: string; extensions: string[] }>
      }): Promise<string | string[] | null>
    }
    event: {
      listen<T = unknown>(
        event: string,
        handler: (event: { payload: T }) => void
      ): Promise<() => void>
    }
  }
}
