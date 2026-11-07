import { defineConfig } from "vitest/config";

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export default defineConfig({
  plugins: [
    {
      // CSP only on the production build: the dev server needs inline scripts and a websocket.
      name: "flechettes-csp",
      apply: "build",
      transformIndexHtml: () => [
        { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
      ],
    },
  ],
  build: { target: "es2022", assetsInlineLimit: 0 },
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
});
