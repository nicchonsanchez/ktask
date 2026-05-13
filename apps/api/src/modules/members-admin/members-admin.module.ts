import { forwardRef, Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { AuthModule } from '@/modules/auth/auth.module';

import { MembersAdminService } from './members-admin.service';
import { MembersAdminController } from './members-admin.controller';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [MembersAdminController],
  providers: [MembersAdminService, TenantGuard],
  exports: [MembersAdminService],
})
export class MembersAdminModule {}
