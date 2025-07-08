import { Module } from '@nestjs/common';
import { BatteryBackupService } from './batteryBackup.service';
import { ModbusModule } from '../modbus/modbus.module';
import { BatteryBackupController } from './batteryBackup.controller';
import { AcService } from './ac.service';
import { BatteryController } from './battery.controller';
import { CanReceiverService } from '../lcwlan/canReceiver.service';
import { BatteryService } from './battery.service';

@Module({
  imports: [ModbusModule],
  controllers: [BatteryBackupController, BatteryController],
  providers: [BatteryBackupService, AcService, CanReceiverService, BatteryService],
  exports: [BatteryBackupService, AcService, BatteryService],
})
export class BatteryModule { }
