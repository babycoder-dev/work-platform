import type { WorkWebModule } from '@work/platform-sdk';

export interface RemoteModuleDescriptor {
  name: string;
  entry: string;
}

export async function loadRemoteModule(_descriptor: RemoteModuleDescriptor): Promise<WorkWebModule> {
  throw new Error('Remote module loading is reserved for the micro-frontend phase.');
}
