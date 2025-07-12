import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ModbusSlowService } from '../modbus/modbus-slow.service';

// 传感器数据基础接口
interface BaseSensorData {
  timestamp: Date;
}

// 温度传感器数据
interface TemperatureSensorData extends BaseSensorData {
  temperature: number;
  humidity?: number;
}

// 液位传感器数据
export interface LevelSensorData extends BaseSensorData {
  level: number;
  levelPercentage?: number;
}

// 传感器配置接口
interface SensorConfig<T extends BaseSensorData> {
  name: string;
  command: string;
  expectedDataLength: number;
  parseFunction: (data: Buffer) => Omit<T, 'timestamp'>;
  updateInterval?: number; // 可选的更新间隔
}

type SensorDataMap = {
  temperature: TemperatureSensorData;
  level: LevelSensorData;
};

@Injectable()
export class SensorService implements OnModuleInit {
  private readonly logger = new Logger(SensorService.name);
  private sensorData: Map<string, BaseSensorData> = new Map();
  private lastUpdateTimes: Map<string, Date> = new Map();

  // 传感器配置
  private sensorConfigs: Map<string, SensorConfig<any>> = new Map();

  constructor(private readonly modbusService: ModbusSlowService) {
    this.initializeSensorConfigs();
  }

  private initializeSensorConfigs() {
    // 温度传感器配置
    // this.sensorConfigs.set('temperature', {
    //   name: '温度传感器',
    //   command: '8103000000041bea',
    //   expectedDataLength: 8,
    //   parseFunction: this.parseTemperatureData.bind(this),
    // });

    // 液位传感器配置
    // this.sensorConfigs.set('level', {
    //   name: '灰水液位传感器',
    //   command: '0b030000000184a0',
    //   expectedDataLength: 8,
    //   parseFunction: this.parseLevelData.bind(this),
    // });

    this.sensorConfigs.set('level', {
      name: '清水液位传感器',
      command: '0c03000000018517',
      expectedDataLength: 2,
      parseFunction: this.parseLevelData.bind(this),
    });

    // 可以继续添加其他传感器配置...
  }

  onModuleInit() {
    // 为每个传感器注册定时任务
    this.sensorConfigs.forEach((config, sensorType) => {
      this.modbusService.registerScheduledTask(`${config.name}数据更新`, async () => {
        return await this.updateSensorData(sensorType);
      });
    });
  }

  private async updateSensorData(sensorType: string): Promise<{
    success: boolean;
    data?: any;
  }> {
    const config = this.sensorConfigs.get(sensorType);
    if (!config) {
      this.logger.error(`未找到传感器配置: ${sensorType}`);
      return { success: false };
    }

    try {
      // this.logger.debug(`开始更新${config.name}数据`);

      // 发送请求
      const responseData = await this.modbusService.sendRequest(config.command);

      // 检查数据长度
      if (responseData.length < config.expectedDataLength) {
        throw new Error(
          `${config.name}数据长度不正确: ${responseData.length}, 期望至少${config.expectedDataLength}字节`
        );
      }

      // 解析数据
      const parsedData = config.parseFunction(responseData);
      const sensorData = {
        ...parsedData,
        timestamp: new Date(),
      };

      // 存储数据
      this.sensorData.set(sensorType, sensorData);
      this.lastUpdateTimes.set(sensorType, new Date());

      // this.logger.debug(`${config.name}数据更新成功`);
      this.logger.debug(`${config.name}数据:`, parsedData);

      return {
        success: true,
        data: parsedData,
      };
    } catch (error) {
      this.logger.error(`更新${config.name}数据失败: ${error.message}`);
      return { success: false };
    }
  }

  // 温度传感器数据解析
  private parseTemperatureData(data: Buffer): Omit<TemperatureSensorData, 'timestamp'> {
    const temperature = data.readInt16BE(0) / 100; // 假设前2字节是温度*100
    const humidity = data.readInt16BE(2) / 100;    // 假设接下来2字节是湿度*100

    return {
      temperature,
      humidity,
    };
  }

  // 液位传感器数据解析
  private parseLevelData(data: Buffer): Omit<LevelSensorData, 'timestamp'> {
    const level = data.readUint16BE(0) / 10; // 假设前2字节是液位*10 (单位: cm)
    const levelPercentage = parseInt(Math.min(100, (level / 190) * 100).toString());// data.readInt16BE(2) / 100; // 假设接下来2字节是液位百分比*100
    this.logger.debug(`液位传感器数据解析: level=${level}, levelPercentage=${levelPercentage}`);
    return {
      level,
      levelPercentage,
    };
  }

  // 获取特定类型传感器的最新数据
  getLatestData<K extends keyof SensorDataMap>(
    sensorType: K
  ): { data: SensorDataMap[K] | null; updateTime: Date | null } {
    const data = this.sensorData.get(sensorType) as SensorDataMap[K] | undefined;
    const updateTime = this.lastUpdateTimes.get(sensorType) || null;

    return {
      data: data || null,
      updateTime,
    };
  }

  // 获取所有传感器数据
  getAllLatestData(): Map<string, { data: BaseSensorData; updateTime: Date }> {
    const result = new Map();

    this.sensorData.forEach((data, sensorType) => {
      const updateTime = this.lastUpdateTimes.get(sensorType);
      if (updateTime) {
        result.set(sensorType, { data, updateTime });
      }
    });

    return result;
  }

  // 检查特定传感器数据是否新鲜
  isDataFresh(sensorType: string, maxAgeMs: number = 30000): boolean {
    const lastUpdate = this.lastUpdateTimes.get(sensorType);
    if (!lastUpdate) {
      return false;
    }
    return Date.now() - lastUpdate.getTime() < maxAgeMs;
  }

  // 手动更新特定传感器数据
  async manualUpdate(sensorType: string): Promise<{ success: boolean; data?: any }> {
    return await this.updateSensorData(sensorType);
  }

  // 添加新的传感器配置
  addSensorConfig<T extends BaseSensorData>(
    sensorType: string,
    config: SensorConfig<T>
  ): void {
    this.sensorConfigs.set(sensorType, config);

    // 立即注册定时任务
    this.modbusService.registerScheduledTask(`${config.name}数据更新`, async () => {
      return await this.updateSensorData(sensorType);
    });
  }
}
