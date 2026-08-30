// Register install-time service worker (manifest is linked from layouts).
if ("serviceWorker" in navigator) {
  const register = () => {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });

  window.addEventListener("appinstalled", () => {
    document.documentElement.dataset.pwaInstalled = "true";
    try {
      window.sessionStorage.setItem("crawlbench:pwa-installed", "1");
    } catch (_) {
      // Ignore storage failures.
    }
  });
}
