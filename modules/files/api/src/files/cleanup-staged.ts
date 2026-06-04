import { NestFactory } from '@nestjs/core';
import { FilesModule } from '../files.module';
import { FilesService } from './files.service';

async function main() {
  const app = await NestFactory.createApplicationContext(FilesModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const service = app.get(FilesService);
    const result = await service.cleanupExpiredStaged();
    console.log(
      JSON.stringify({
        cleaned: result.cleaned,
        failed: result.failed,
        releasedBytes: result.releasedBytes,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown cleanup failure';
  console.error(message);
  process.exitCode = 1;
});
