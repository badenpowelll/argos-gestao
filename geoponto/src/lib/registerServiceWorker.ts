import { registerSW } from "virtual:pwa-register";

const isLovablePreviewHost = (hostname: string) =>
  hostname.startsWith("id-preview--") ||
  hostname.startsWith("preview--") ||
  hostname === "lovableproject.com" ||
  hostname.endsWith(".lovableproject.com") ||
  hostname === "lovableproject-dev.com" ||
  hostname.endsWith(".lovableproject-dev.com") ||
  hostname === "beta.lovable.dev" ||
  hostname.endsWith(".beta.lovable.dev");

const unregisterAppShellWorkers = async () => {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => registration.active?.scriptURL.endsWith("/sw.js"))
      .map((registration) => registration.unregister()),
  );
};

export const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;

  const searchParams = new URLSearchParams(window.location.search);
  const isBlockedContext =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    isLovablePreviewHost(window.location.hostname) ||
    searchParams.get("sw") === "off";

  if (isBlockedContext) {
    void unregisterAppShellWorkers();
    return;
  }

  registerSW({ immediate: true });
};