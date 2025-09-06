
import { Module } from '@nestjs/common';
import { CanReceiverService } from './canReceiver.service';

@Module({
  providers: [CanReceiverService],
  exports: [CanReceiverService],
})
export class LcwlanModule {}