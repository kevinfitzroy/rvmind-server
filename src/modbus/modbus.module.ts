import { Module } from '@nestjs/common';
import { ModbusService } from './modbus.service';
import { ModbusController } from './modbus.controller';

@Module({
    providers: [ModbusService],
    controllers: [ModbusController],
    exports: [ModbusService],
})
export class ModbusModule {}
