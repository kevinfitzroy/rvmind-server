import { Module } from '@nestjs/common';
import { BatteryService } from './battery.service';
import { ModbusModule } from '../modbus/modbus.module';
import { BatteryBackupController } from './batteryBackup.controller';
import { AcService } from './ac.service';

@Module({
  imports: [ModbusModule],
  controllers: [BatteryBackupController],
  providers: [BatteryService, AcService],
  exports: [BatteryService, AcService],
})
export class BatteryModule { }
