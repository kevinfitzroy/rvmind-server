import { Module } from '@nestjs/common';
import { BatteryBackupService } from './batteryBackup.service';
import { ModbusModule } from '../modbus/modbus.module';
import { BatteryBackupController } from './batteryBackup.controller';
import { AcService } from './ac.service';
import { BatteryController } from './battery.controller';
import { BatteryService } from './battery.service';
import { LcwlanModule } from '../lcwlan/lcwlan.module';

@Module({
  imports: [ModbusModule, LcwlanModule],
  controllers: [BatteryBackupController, BatteryController],
  providers: [BatteryBackupService, AcService, BatteryService],
  exports: [BatteryBackupService, AcService, BatteryService],
})
export class BatteryModule { }
