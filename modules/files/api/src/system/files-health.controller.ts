import { Controller, Get } from '@nestjs/common';
import { Public } from '@work/nest-common';

@Controller('files/health')
export class FilesHealthController {
  @Public()
  @Get()
  health() {
    return {
      module: 'files',
      status: 'ok',
    };
  }
}
