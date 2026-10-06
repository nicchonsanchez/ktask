import { Module } from '@nestjs/common';
import { BoardsModule } from '@/modules/boards/boards.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { AutomationsModule } from '@/modules/automations/automations.module';
import { ChecklistsController } from './checklists.controller';
import { ChecklistsService } from './checklists.service';

@Module({
  imports: [BoardsModule, NotificationsModule, AutomationsModule],
  controllers: [ChecklistsController],
  providers: [ChecklistsService],
  // Doc 52 (Fase 3): follow-up do registro de contato reusa addItem.
  exports: [ChecklistsService],
})
export class ChecklistsModule {}
