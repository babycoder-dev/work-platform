import type { MenuDto } from '@work/platform-contract';
import type { WorkWebModule, WorkWebModuleRoute } from '@work/platform-sdk';

export interface NavigationItem {
  title: string;
  path: string;
  moduleName: string;
  permissionCode?: string;
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

export function buildModuleRouteTable(modules: WorkWebModule[]): WorkWebModuleRoute[] {
  const seen = new Set<string>();
  const table: WorkWebModuleRoute[] = [];
  for (const module of modules) {
    for (const route of module.routes) {
      const path = normalizePath(route.path);
      if (seen.has(path)) {
        throw new Error(`Duplicate module route path: ${path}`);
      }
      seen.add(path);
      table.push({ path, permission: route.permission, load: route.load });
    }
  }

  return table;
}

export function normalizePath(path: string): string {
  if (!path || path === '/') {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
}
