import { Module } from '@nestjs/common';

import { ListsModule } from '@/modules/lists/lists.module';
import { AutomationsModule } from '@/modules/automations/automations.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [ListsModule, AutomationsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
