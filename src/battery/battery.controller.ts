import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { AcService } from './ac.service';

@Controller({
    path: 'battery/ac',
    version: '1',
})
export class BatteryController {
    constructor(private readonly acService: AcService) { }

    // 设置主供电逆变器
    @Post('main-power/:state')
    async setMainPowerInverter(@Param('state') state: 'OPEN' | 'CLOSE') {
        return this.acService.setMainPowerInverter(state);
    }

    // 设置备用电池充电逆变器
    @Post('backup-battery/:state')
    async setBackupBatteryChargeInverter(@Param('state') state: 'OPEN' | 'CLOSE') {
        return this.acService.setBackupBatteryChargeInverter(state);
    }

    // 获取主供电逆变器状态
    @Get('main-power/status')
    async getMainPowerInverterStatus() {
        return this.acService.getMainPowerInverterStatus();
    }

    // 获取备用电池充电逆变器状态
    @Get('backup-battery/status')
    async getBackupBatteryChargeInverterStatus() {
        return this.acService.getBackupBatteryChargeInverterStatus();
    }

}
