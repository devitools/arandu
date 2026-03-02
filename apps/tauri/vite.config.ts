import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

function componentTagger(): Plugin {
  return {
    name: "component-tagger",
    enforce: "pre",
    apply: "serve",
    transform(code, id) {
      if (
        !id.endsWith(".tsx") ||
        id.includes("node_modules") ||
        id.includes("__tests__")
      )
        return;

      const match = id.match(/\/([A-Z][a-zA-Z0-9]*)\.tsx$/);
      if (!match) return;

      const srcIdx = id.indexOf("/src/");
      const filePath =
        srcIdx !== -1 ? id.slice(srcIdx + 1) : match[1] + ".tsx";
      const componentName = match[1];

      const lines = code.split("\n");
      let changed = false;
      let returnPending = false;

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trimStart();

        if (
          trimmed.startsWith("//") ||
          trimmed.startsWith("*") ||
          trimmed.startsWith("/*")
        )
          continue;

        let isReturnRoot = false;
        if (returnPending && trimmed !== "") {
          isReturnRoot = trimmed.startsWith("<");
          returnPending = false;
        }

        if (/return\s*\(\s*$/.test(trimmed)) {
          returnPending = true;
        }

        const original = lines[i];
        const lineNum = i + 1;

        lines[i] = lines[i].replace(
          /(?<!\w)<([a-zA-Z][a-zA-Z0-9.]*)([\s/>])/g,
          (m, tag, after, offset) => {
            const before = lines[i].slice(0, offset);
            const quotes = (before.match(/"/g) || []).length;
            if (quotes % 2 !== 0) return m;
            return `<${tag} data-id="${filePath}:${lineNum}"${after}`;
          }
        );

        if (isReturnRoot) {
          lines[i] = lines[i].replace(
            /<([A-Za-z][A-Za-z0-9.]*)/,
            `<$1 data-component="${componentName}"`
          );
        }

        if (lines[i] !== original) changed = true;
      }

      if (!changed) return;
      return { code: lines.join("\n"), map: null };
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [mode === "development" && componentTagger(), react()].filter(
    Boolean
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "localhost",
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "esnext",
    minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        settings: path.resolve(__dirname, "settings.html"),
        whisper: path.resolve(__dirname, "whisper.html"),
      },
    },
  },
}));
