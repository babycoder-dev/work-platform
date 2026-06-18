import type { MenuDto } from '@work/platform-contract';
import type { WorkWebModule, WorkWebModuleRoute } from '@work/platform-sdk';

export interface NavigationItem {
  id?: string;
  title: string;
  path: string;
  moduleName: string;
  permissionCode?: string;
  parentId?: string;
  sortOrder?: number;
}

export interface NavigationGroup {
  id: string;
  title: string;
  moduleName: string;
  items: NavigationItem[];
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

export function buildNavigationGroups(menus: MenuDto[]): NavigationGroup[] {
  const activeMenus = [...menus]
    .filter((menu) => menu.status === 'active')
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title));

  const menuById = new Map(activeMenus.map((menu) => [menu.id, menu]));
  const childrenByParent = new Map<string, MenuDto[]>();
  for (const menu of activeMenus) {
    if (menu.parentId && menuById.has(menu.parentId)) {
      const siblings = childrenByParent.get(menu.parentId) ?? [];
      siblings.push(menu);
      childrenByParent.set(menu.parentId, siblings);
    }
  }

  const groupedChildIds = new Set(
    Array.from(childrenByParent.values()).flatMap((children) => children.map((child) => child.id)),
  );
  const groups: NavigationGroup[] = [];
  const fallbackGroups = new Map<string, NavigationGroup>();

  for (const menu of activeMenus) {
    const children = childrenByParent.get(menu.id);
    if (children?.length) {
      groups.push({
        id: menu.id,
        title: menu.title,
        moduleName: menu.moduleName,
        items: children.map(toNavigationItem),
      });
      continue;
    }

    if (!groupedChildIds.has(menu.id) && (!menu.parentId || !menuById.has(menu.parentId))) {
      const group = fallbackGroups.get(menu.moduleName);
      if (group) {
        group.items.push(toNavigationItem(menu));
      } else {
        const nextGroup = {
          id: `ungrouped-${menu.moduleName}`,
          title: menu.moduleName,
          moduleName: menu.moduleName,
          items: [toNavigationItem(menu)],
        };
        fallbackGroups.set(menu.moduleName, nextGroup);
        groups.push(nextGroup);
      }
    }
  }

  return groups;
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

function toNavigationItem(menu: MenuDto): NavigationItem {
  return {
    id: menu.id,
    title: menu.title,
    path: normalizePath(menu.path),
    moduleName: menu.moduleName,
    permissionCode: menu.permissionCode,
    parentId: menu.parentId,
    sortOrder: menu.sortOrder,
  };
}
