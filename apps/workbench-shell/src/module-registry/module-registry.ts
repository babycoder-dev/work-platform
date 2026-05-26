import type { WorkWebModule, WorkWebModuleRuntime } from '@work/platform-sdk';
import { platformWebModule } from '@work/platform-web';
import { presenceWebModule } from '@work/presence-web';

class ModuleRegistry {
  private readonly modules = new Map<string, WorkWebModule>();

  register(module: WorkWebModule) {
    this.modules.set(module.manifest.name, module);
  }

  getModules(): WorkWebModule[] {
    return Array.from(this.modules.values());
  }

  applyRuntime(runtime: WorkWebModuleRuntime) {
    for (const module of this.modules.values()) {
      module.setRuntime?.(runtime);
    }
  }
}

export const moduleRegistry = new ModuleRegistry();

moduleRegistry.register(platformWebModule);
moduleRegistry.register(presenceWebModule);
