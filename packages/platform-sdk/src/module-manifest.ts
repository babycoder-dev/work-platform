export interface PermissionDefinition {
  code: string;
  name: string;
  description?: string;
}

export interface ModuleMenu {
  title: string;
  path: string;
  permission: string;
  icon?: string;
  children?: ModuleMenu[];
}

export interface ModuleRoute {
  path: string;
  permission?: string;
}

export interface WorkModuleManifest {
  name: string;
  title: string;
  basePath: string;
  apiPrefix: string;
  menus: ModuleMenu[];
  permissions: PermissionDefinition[];
  routes: ModuleRoute[];
}
