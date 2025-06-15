import { Module } from '@nestjs/common';
import { ModbusService } from './modbus.service';
import { ModbusController } from './modbus.controller';
import { ModbusSlowService } from './modbus-slow.service';

@Module({
  providers: [ModbusService, ModbusSlowService],
  controllers: [ModbusController],
  exports: [ModbusService, ModbusSlowService],
})
export class ModbusModule {}
