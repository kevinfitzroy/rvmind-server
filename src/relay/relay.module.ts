import { Module } from '@nestjs/common';
import { RelayController } from './relay.controller';
import { RelayService } from './relay.service';
import { RelayGateway } from './relay.gateway';
import { RelayEventService } from './relay-event.service';
import { ModbusModule } from '../modbus/modbus.module';

@Module({
  imports: [ModbusModule], // 导入 ModbusModule 而不是直接提供 ModbusService
  controllers: [RelayController],
  providers: [RelayService, RelayGateway, RelayEventService],
  exports: [RelayService, RelayEventService],
})
export class RelayModule {}
