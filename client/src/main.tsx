import { createRoot } from "react-dom/client";
import App from "./App";
import {
  LAST_APP_ROUTE_STORAGE_KEY,
  appRouteFromHash,
  getAppLaunchRoute,
  isRememberableAppRoute,
} from "./lib/last-app-route";
import "./index.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    }).catch(error => {
      console.error("Service worker registration failed", error);
    });
  });
}

let savedAppRoute: string | null = null;
try {
  savedAppRoute = localStorage.getItem(LAST_APP_ROUTE_STORAGE_KEY);
} catch {
  // The app still works when browser storage is unavailable.
}
const launchRoute = getAppLaunchRoute(window.location.hash, savedAppRoute);

if (!window.location.hash || appRouteFromHash(window.location.hash) !== launchRoute) {
  window.location.hash = `#${launchRoute}`;
}

const rememberCurrentAppRoute = () => {
  const route = appRouteFromHash(window.location.hash);
  if (isRememberableAppRoute(route)) {
    try {
      localStorage.setItem(LAST_APP_ROUTE_STORAGE_KEY, route);
    } catch {
      // Ignore private-mode and storage-quota failures.
    }
  }
};

rememberCurrentAppRoute();
window.addEventListener("hashchange", rememberCurrentAppRoute);

createRoot(document.getElementById("root")!).render(<App />);
