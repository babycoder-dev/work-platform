import { Controller, Get, Inject, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { PlatformAuthGuard } from '../auth/platform-auth.guard';
import type { PlatformRequest } from '../auth/request-user';
import { RbacService } from './rbac.service';

@Controller('menus')
@UseGuards(PlatformAuthGuard)
export class MenuController {
  constructor(@Inject(RbacService) private readonly rbacService: RbacService) {}

  @Get('my')
  listMyMenus(@Req() request: PlatformRequest) {
    const currentUser = request.currentUser;
    if (!currentUser) {
      throw new UnauthorizedException('未登录');
    }

    return this.rbacService.listCurrentUserMenus(currentUser);
  }
}
