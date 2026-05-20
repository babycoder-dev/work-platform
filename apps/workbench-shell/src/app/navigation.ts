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

export function normalizePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}
