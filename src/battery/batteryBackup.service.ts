import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModbusSlowService } from '../modbus/modbus-slow.service';
import { RealTimeData, parseRealTimeData } from './type';


@Injectable()
export class BatteryBackupService implements OnModuleInit {
  private readonly logger = new Logger(BatteryBackupService.name);
  private latestData: RealTimeData | null = null;
  private lastUpdateTime: Date | null = null;

  constructor(private readonly modbusService: ModbusSlowService) { }


  onModuleInit() {
    // 注册定时任务到ModbusSlowService
    this.modbusService.registerScheduledTask('电池实时数据更新', async () => {
      return await this.updateRealTimeData();
    });
  }

  private async updateRealTimeData(): Promise<{
    success: boolean;
    soc?: number;
    voltage?: number;
  }> {
    try {
      this.logger.debug('开始更新电池实时数据');

      // 发送读取实时数据的请求
      const responseData =
        await this.modbusService.sendRequest('81030000007f1bea');

      // 检查数据长度
      if (responseData.length !== 254) {
        throw new Error(`数据长度不正确: ${responseData.length}, 期望254字节`);
      }

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

  // async getRealTimeData(): Promise<RealTimeData> {
  //     try {
  //         this.logger.debug('手动获取电池实时数据');

  //         const responseData = await this.modbusService.sendRequest('81030000007f1bea');

  //         if (responseData.length !== 254) {
  //             throw new Error(`数据长度不正确: ${responseData.length}, 期望254字节`);
  //         }

  //         const realTimeData = parseRealTimeData(responseData);

  //         // 更新缓存的数据
  //         this.latestData = realTimeData;
  //         this.lastUpdateTime = new Date();

  //         this.logger.debug('手动获取电池实时数据成功');
  //         return realTimeData;

  //     } catch (error) {
  //         this.logger.error(`手动获取电池实时数据失败: ${error.message}`);
  //         throw error;
  //     }
  // }

  isDataFresh(maxAgeMs: number = 30000): boolean {
    if (!this.lastUpdateTime) {
      return false;
    }
    return Date.now() - this.lastUpdateTime.getTime() < maxAgeMs;
  }
}
