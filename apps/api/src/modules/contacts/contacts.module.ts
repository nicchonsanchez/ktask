import { Module } from '@nestjs/common';

import { TenantGuard } from '@/common/tenant/tenant.guard';
import { BoardsModule } from '@/modules/boards/boards.module';

import { ContactsService } from './contacts.service';
import { ContactsController } from './contacts.controller';

@Module({
  imports: [BoardsModule],
  controllers: [ContactsController],
  providers: [ContactsService, TenantGuard],
  exports: [ContactsService],
})
export class ContactsModule {}
