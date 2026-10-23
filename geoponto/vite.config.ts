import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  // Publicação (Railway): `vite preview` serve o dist em 0.0.0.0 e aceita o domínio público.
  preview: {
    host: "0.0.0.0",
    allowedHosts: true,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // PWA: gera service worker que faz cache do app shell (JS/CSS/HTML/imagens),
    // permitindo abrir o app em modo avião. Estratégia NetworkFirst para o HTML
    // (sempre pega versão nova quando online) e CacheFirst para assets estáticos.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      includeAssets: ["favicon.jpg", "placeholder.svg", "robots.txt"],
      manifest: false, // usamos o /manifest.json existente
      devOptions: {
        enabled: false,
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,jpg,jpeg,svg,webp,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//, /^\/~oauth/],
        runtimeCaching: [
          {
            // App shell / navegação SPA
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "app-shell",
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Assets estáticos versionados do próprio app
            urlPattern: ({ sameOrigin, request }) =>
              sameOrigin &&
              ["style", "script", "worker", "image", "font"].includes(request.destination),
            handler: "CacheFirst",
            options: {
              cacheName: "assets",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
