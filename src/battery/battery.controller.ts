import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { AcService } from './ac.service';
import { BatteryService } from './battery.service';

@Controller({
    path: 'battery',
    version: '1',
})
export class BatteryController {
    constructor(
        private readonly acService: AcService,
        private readonly batteryService: BatteryService
    ) { }

    // 获取原始CAN报文数据
    @Get('raw-can-frames')
    async getRawCanFrames() {
        return this.batteryService.getRawCanFrames();
    }

    // 获取汇总状态信息
    @Get('pms-status')
    async getPMSStatus() {
        return this.batteryService.getPMSStatus();
    }

    // 设置主供电逆变器
    @Post('ac/main-power/:state')
    async setMainPowerInverter(@Param('state') state: 'OPEN' | 'CLOSE') {
        return this.acService.setMainPowerInverter(state);
    }

    // 设置备用电池充电逆变器
    @Post('ac/backup-battery/:state')
    async setBackupBatteryChargeInverter(@Param('state') state: 'OPEN' | 'CLOSE') {
        return this.acService.setBackupBatteryChargeInverter(state);
    }

    // 获取主供电逆变器状态
    @Get('ac/main-power/status')
    async getMainPowerInverterStatus() {
        return this.acService.getMainPowerInverterStatus();
    }

    // 获取备用电池充电逆变器状态
    @Get('ac/backup-battery/status')
    async getBackupBatteryChargeInverterStatus() {
        return this.acService.getBackupBatteryChargeInverterStatus();
    }
}
