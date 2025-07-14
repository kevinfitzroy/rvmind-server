import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RealTimeData, parseRealTimeData } from './type';
import { ModbusPort, ModbusService } from '../modbus/modbus.service';
import { Interval } from '@nestjs/schedule';


@Injectable()
export class BatteryBackupService implements OnModuleInit {
  private readonly logger = new Logger(BatteryBackupService.name);
  private latestData: RealTimeData | null = null;
  private lastUpdateTime: Date | null = null;

  constructor(private readonly modbusService: ModbusService) { }
  onModuleInit() {
    this.updateRealTimeData();
  }

  @Interval(5000)
  private async updateSummary() {
    if (this.latestData === null) {
      return;
    }
    const { data } = await this.modbusService.enqueueRequest(ModbusPort.MAIN_PORT, 0x81, async (client) => {
      return await client.readHoldingRegisters(0x38, 3)
    }, false);

    this.latestData.totalVoltage = data[0] * 0.1;
    this.latestData.current = (30000 - data[1]) * 0.1;
    this.latestData.soc =  Math.round(data[2] * 0.001 * 1000) / 1000;
  }

  @Interval(15000)
  private async updateRealTimeData(): Promise<{
    success: boolean;
    soc?: number;
    voltage?: number;
  }> {

    try {
      this.logger.debug('开始更新电池实时数据');

      const batch1 = await this.modbusService.enqueueRequest(ModbusPort.MAIN_PORT, 0x81, async (client) => {
        return await client.readHoldingRegisters(0x00, 0x20)
      }, false);

      const batch2 = await this.modbusService.enqueueRequest(ModbusPort.MAIN_PORT, 0x81, async (client) => {
        return await client.readHoldingRegisters(0x20, 0x20)
      }, false);
      const batch3 = await this.modbusService.enqueueRequest(ModbusPort.MAIN_PORT, 0x81, async (client) => {
        return await client.readHoldingRegisters(0x40, 0x20)
      }, false);
      const batch4 = await this.modbusService.enqueueRequest(ModbusPort.MAIN_PORT, 0x81, async (client) => {
        return await client.readHoldingRegisters(0x60, 0x1f)
      }, false);

      const responseData = Buffer.concat([batch1.buffer, batch2.buffer, batch3.buffer, batch4.buffer]);

      // 解析数据
      const realTimeData = parseRealTimeData(responseData);

      // 存储数据
      this.latestData = realTimeData;
      this.lastUpdateTime = new Date();

      this.logger.debug('电池实时数据更新成功');
      this.logger.debug(
        `电池电压: ${realTimeData.totalVoltage}V, 电流: ${realTimeData.current}A, SOC: ${realTimeData.soc}%`,
      );

      return {
        success: true,
        soc: realTimeData.soc,
        voltage: realTimeData.totalVoltage,
      };
    } catch (error) {
      this.logger.error(`更新电池实时数据失败: ${error.message}`);
      return { success: false };
    }
  }

  getLatestData(): { data: RealTimeData | null; updateTime: Date | null } {
    return {
      data: this.latestData,
      updateTime: this.lastUpdateTime,
    };
  }


  isDataFresh(maxAgeMs: number = 30000): boolean {
    if (!this.lastUpdateTime) {
      return false;
    }
    return Date.now() - this.lastUpdateTime.getTime() < maxAgeMs;
  }
}
