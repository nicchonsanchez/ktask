import { Module } from '@nestjs/common';

import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { SupportBootstrapService } from './support-bootstrap.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, SupportBootstrapService],
})
export class SupportModule {}
