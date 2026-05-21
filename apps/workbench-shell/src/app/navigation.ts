import type { MenuDto } from '@work/platform-contract';
import type { WorkWebModule, WorkWebModuleRoute } from '@work/platform-sdk';

export interface NavigationItem {
  title: string;
  path: string;
  moduleName: string;
  permissionCode?: string;
}

export interface RouteMatch {
  module: WorkWebModule;
  route: WorkWebModuleRoute;
}

export type ShellRouteResolution =
  | { kind: 'home' }
  | { kind: 'loadable'; match: RouteMatch }
  | { kind: 'forbidden'; path: string }
  | { kind: 'coming-soon'; item: NavigationItem }
  | { kind: 'not-found'; path: string };

export function buildNavigationItems(menus: MenuDto[]): NavigationItem[] {
  return [...menus]
    .filter((menu) => menu.status === 'active')
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title))
    .map((menu) => ({
      title: menu.title,
      path: normalizePath(menu.path),
      moduleName: menu.moduleName,
      permissionCode: menu.permissionCode,
    }));
}

export function findRouteMatch(
  modules: WorkWebModule[],
  path: string,
  permissionCodes: string[],
): RouteMatch | undefined {
  const normalizedPath = normalizePath(path);
  const granted = new Set(permissionCodes);

  for (const module of modules) {
    const route = module.routes.find((candidate) => normalizePath(candidate.path) === normalizedPath);
    if (route && (!route.permission || granted.has(route.permission))) {
      return {
        module,
        route,
      };
    }
  }

  return undefined;
}

export function resolveShellRoute(
  modules: WorkWebModule[],
  navigationItems: NavigationItem[],
  path: string,
  permissionCodes: string[],
): ShellRouteResolution {
  const normalizedPath = normalizePath(path);
  if (normalizedPath === '/') {
    return { kind: 'home' };
  }

  const routeMatch = findRouteMatch(modules, normalizedPath, permissionCodes);
  if (routeMatch) {
    return {
      kind: 'loadable',
      match: routeMatch,
    };
  }

  const deniedRoute = findAnyRoute(modules, normalizedPath);
  if (deniedRoute) {
    return {
      kind: 'forbidden',
      path: normalizedPath,
    };
  }

  const navigationItem = navigationItems.find((item) => item.path === normalizedPath);
  if (navigationItem) {
    return {
      kind: 'coming-soon',
      item: navigationItem,
    };
  }

  return {
    kind: 'not-found',
    path: normalizedPath,
  };
}

export function normalizePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}

function findAnyRoute(modules: WorkWebModule[], path: string): RouteMatch | undefined {
  const normalizedPath = normalizePath(path);

  for (const module of modules) {
    const route = module.routes.find((candidate) => normalizePath(candidate.path) === normalizedPath);
    if (route) {
      return {
        module,
        route,
      };
    }
  }

  return undefined;
}
