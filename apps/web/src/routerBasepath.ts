const DESKTOP_ROUTE_BASEPATH_PATTERN = /^\/desktop\/([^/]+)(?:\/|$)/;

export function resolveRouterBasepath(pathname: string): string {
  const match = pathname.match(DESKTOP_ROUTE_BASEPATH_PATTERN);
  return match ? `/desktop/${match[1]}` : "/";
}
