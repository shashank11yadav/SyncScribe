import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { buildCsp } from "./src/csp.ts";

/**
 * Adds the CSP meta tag to the production build only. The dev server injects
 * styles and an HMR client inline, which a strict policy would block.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: "syncscribe:csp-meta",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: () => [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: buildCsp() },
          injectTo: "head-prepend",
        },
      ],
    },
  };
}

export default defineConfig({
  // The project site lives at https://shashank11yadav.github.io/collaborative-editor/.
  base: "/collaborative-editor/",
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    // A data: URI would need img-src data:, so every asset stays a file.
    assetsInlineLimit: 0,
    target: "es2022",
  },
  server: { port: 5210, strictPort: true },
  preview: { port: 5211, strictPort: true },
});
