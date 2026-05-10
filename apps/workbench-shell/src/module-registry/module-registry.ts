import type { WorkWebModule } from '@work/platform-sdk';
import { presenceWebModule } from '@work/presence-web';

class ModuleRegistry {
  private readonly modules = new Map<string, WorkWebModule>();

  register(module: WorkWebModule) {
    this.modules.set(module.manifest.name, module);
  }

  getModules(): WorkWebModule[] {
    return Array.from(this.modules.values());
  }
}

export const moduleRegistry = new ModuleRegistry();

moduleRegistry.register(presenceWebModule);
