export const LAST_APP_ROUTE_STORAGE_KEY = "o5my:last-app-route";

const rememberableRoutePatterns = [
  /^\/$/,
  /^\/calendar$/,
  /^\/matches$/,
  /^\/events\/\d+$/,
  /^\/polls(?:\/\d+)?$/,
  /^\/payments(?:\/\d+)?$/,
  /^\/files(?:\/tactics\/\d+)?$/,
  /^\/organization$/,
  /^\/statistics$/,
  /^\/members$/,
  /^\/settings$/,
  /^\/admin\/(?:members|payments|bank|notifications)$/,
];

export function appRouteFromHash(hash: string) {
  const route = hash.replace(/^#/, "").split("?", 1)[0];
  return route.startsWith("/") ? route : "/";
}

export function isRememberableAppRoute(route: string) {
  return rememberableRoutePatterns.some(pattern => pattern.test(route));
}

export function getAppLaunchRoute(currentHash: string, savedRoute: string | null) {
  const currentRoute = appRouteFromHash(currentHash);
  if (currentRoute !== "/" || !savedRoute || !isRememberableAppRoute(savedRoute)) {
    return currentRoute;
  }

  return savedRoute;
}
