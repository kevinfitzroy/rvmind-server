import { Module } from '@nestjs/common';
import { BatteryService } from './battery.service';
import { ModbusModule } from '../modbus/modbus.module';
import { BatteryBackupController } from './batteryBackup.controller';

@Module({
  imports: [ModbusModule],
  controllers: [BatteryBackupController],
  providers: [BatteryService],
  exports: [BatteryService],
})
export class BatteryModule {}
