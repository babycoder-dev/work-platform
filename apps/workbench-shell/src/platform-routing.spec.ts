import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('production workbench API routing', () => {
  it('routes platform requests through the gateway composition host', async () => {
    const config = await readFile(
      path.resolve(process.cwd(), 'infra/nginx/workbench-shell.conf'),
      'utf8',
    );

    expect(config).not.toContain('location /api/platform/');
    expect(config).not.toContain('proxy_pass http://platform-api:3001');
    expect(config).toContain('location /api/');
    expect(config).toContain('proxy_pass http://gateway-api:3000/api/');
  });
});
