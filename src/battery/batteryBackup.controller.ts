import {
  Controller,
  Get,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { BatteryBackupService } from './batteryBackup.service';

@Controller({
  path: 'battery',
  version: '1',
})
export class BatteryBackupController {
  private readonly logger = new Logger(BatteryBackupController.name);

  constructor(private readonly batteryService: BatteryBackupService) {}

  // @Get('realtime')
  // async getRealTimeData(): Promise<RealTimeData> {
  //     try {
  //         return await this.batteryService.getRealTimeData();
  //     } catch (error) {
  //         this.logger.error('获取实时数据失败', error.stack);
  //         throw new HttpException('获取实时数据失败', HttpStatus.INTERNAL_SERVER_ERROR);
  //     }
  // }

  @Get('latest')
  getLatestData() {
    const result = this.batteryService.getLatestData();
    return {
      data: result.data,
      updateTime: result.updateTime,
      isFresh: this.batteryService.isDataFresh(),
    };
  }

  @Get('soc')
  getSoc() {
    const { data } = this.batteryService.getLatestData();
    if (!data) {
      throw new HttpException('暂无电池数据', HttpStatus.NOT_FOUND);
    }
    return {
      soc: data.soc * 100,
      remainingCapacity: data.remainingCapacity,
      timestamp: data.timestamp,
    };
  }

  @Get('voltage')
  getVoltage() {
    const { data } = this.batteryService.getLatestData();
    if (!data) {
      throw new HttpException('暂无电池数据', HttpStatus.NOT_FOUND);
    }
    return {
      totalVoltage: data.totalVoltage,
      averageVoltage: data.averageVoltage,
      maxCellVoltage: data.maxCellVoltage,
      minCellVoltage: data.minCellVoltage,
      cellVoltageDifference: data.cellVoltageDifference,
      maxCellVoltageIndex: data.maxCellVoltageIndex,
      minCellVoltageIndex: data.minCellVoltageIndex,
      timestamp: data.timestamp,
    };
  }

  @Get('current')
  getCurrent() {
    const { data } = this.batteryService.getLatestData();
    if (!data) {
      throw new HttpException('暂无电池数据', HttpStatus.NOT_FOUND);
    }
    return {
      current: data.current,
      chargeDischargeStatus: data.chargeDischargeStatus,
      chargerStatus: data.chargerStatus,
      loadStatus: data.loadStatus,
      heatingCurrent: data.heatingCurrent,
      currentLimitingStatus: data.currentLimitingStatus,
      currentLimitingCurrent: data.currentLimitingCurrent,
      timestamp: data.timestamp,
    };
  }

  @Get('power')
  getPower() {
    const { data } = this.batteryService.getLatestData();
    if (!data) {
      throw new HttpException('暂无电池数据', HttpStatus.NOT_FOUND);
    }
    return {
      power: data.power,
      energy: data.energy,
      voltage: data.totalVoltage,
      current: data.current,
      timestamp: data.timestamp,
    };
  }

  @Get('temperature')
  getTemperature() {
    const { data } = this.batteryService.getLatestData();
    if (!data) {
      throw new HttpException('暂无电池数据', HttpStatus.NOT_FOUND);
    }
    return {
      maxCellTemperature: data.maxCellTemperature,
      minCellTemperature: data.minCellTemperature,
      temperatureDifference: data.temperatureDifference,
      maxCellTemperatureIndex: data.maxCellTemperatureIndex,
      minCellTemperatureIndex: data.minCellTemperatureIndex,
      mosTemperature: data.mosTemperature,
      ambientTemperature: data.ambientTemperature,
      heatingTemperature: data.heatingTemperature,
      batteryTemperatures: data.batteryTemperatures,
      timestamp: data.timestamp,
    };
  }

  @Get('status')
  getStatus() {
    const { data } = this.batteryService.getLatestData();
    if (!data) {
      throw new HttpException('暂无电池数据', HttpStatus.NOT_FOUND);
    }
    return {
      chargeDischargeStatus: data.chargeDischargeStatus,
      chargerStatus: data.chargerStatus,
      loadStatus: data.loadStatus,
      balancingStatus: data.balancingStatus,
      chargeMosStatus: data.chargeMosStatus,
      dischargeMosStatus: data.dischargeMosStatus,
      prechargeMosStatus: data.prechargeMosStatus,
      heaterMosStatus: data.heaterMosStatus,
      fanMosStatus: data.fanMosStatus,
      currentLimitingStatus: data.currentLimitingStatus,
      cycleCount: data.cycleCount,
      timestamp: data.timestamp,
    };
  }

  @Get('summary')
  getSummary() {
    const { data, updateTime } = this.batteryService.getLatestData();
    if (!data) {
      throw new HttpException('暂无电池数据', HttpStatus.NOT_FOUND);
    }

    const getChargeDischargeStatusText = (status: number) => {
      switch (status) {
        case 0:
          return '静止';
        case 1:
          return '充电';
        case 2:
          return '放电';
        default:
          return '未知';
      }
    };

    return {
      // 核心数据
      soc: data.soc * 100,
      totalVoltage: data.totalVoltage,
      current: data.current,
      power: data.power,

      // 状态信息
      chargeDischargeStatus: data.chargeDischargeStatus,
      chargeDischargeStatusText: getChargeDischargeStatusText(
        data.chargeDischargeStatus,
      ),

      // 温度信息
      maxCellTemperature: data.maxCellTemperature,
      minCellTemperature: data.minCellTemperature,
      temperatureDifference: data.temperatureDifference,

      // 电压信息
      cellVoltageDifference: data.cellVoltageDifference,
      maxCellVoltage: data.maxCellVoltage,
      minCellVoltage: data.minCellVoltage,

      // 其他关键信息
      remainingCapacity: data.remainingCapacity,
      cycleCount: data.cycleCount,

      // 时间信息
      timestamp: data.timestamp,
      updateTime: updateTime,
      isFresh: this.batteryService.isDataFresh(),
    };
  }
}
