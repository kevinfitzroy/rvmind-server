import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CanReceiverService } from '../lcwlan/canReceiver.service';
import { CanFrame, FrameFormat, FrameType } from '../lcwlan/types';

export interface DieselHeaterStatus {
  isRunning: boolean;
  isHeating: boolean;
  workStatus: number;
  workMode: number;
  ignitionStatus: number;
  workStatusText: string;
  workModeText: string;
  ignitionStatusText: string;
  inletTemperature: number;
  outletTemperature: number;
  targetTemperature: number;
  voltage: number;
  faultCode: number;
  faultText: string;
  lastUpdateTime: Date;
}

@Injectable()
export class DieselHeaterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DieselHeaterService.name);

  private status: DieselHeaterStatus = {
    isRunning: false,
    isHeating: false,
    workStatus: 0,
    workMode: 0,
    ignitionStatus: 0,
    workStatusText: '停机 Stop',
    workModeText: '加热关闭 HEAT OFF',
    ignitionStatusText: '停止 Stop',
    inletTemperature: 0,
    outletTemperature: 0,
    targetTemperature: 60,
    voltage: 0,
    faultCode: 0,
    faultText: '正常 Normal',
    lastUpdateTime: new Date(),
  };

  private heaterControlInterval: NodeJS.Timeout | undefined;
  private currentHeaterState = { on: false, heating: false };

  // 映射表
  private readonly workStatusMap = {
    0: '停机 Stop',
    1: '工作 Run',
    2: '保留 Reverse',
    3: '无效 NULL'
  };

  private readonly workModeMap = {
    0: '加热关闭 HEAT OFF',
    1: '加热工作 HEAT ON',
    2: '保留 Reverse',
    3: '无效 NULL'
  };

  private readonly ignitionStatusMap = {
    0: '停止 Stop',
    1: '点火成功 Ignition succeed',
    2: '保留 Reverse',
    3: '无效 NULL'
  };

  private readonly faultCodeMap: { [key: number]: string } = {
    0x00: '正常 Normal',
    0x01: '电压故障 Voltage Fault',
    0x02: '高温保护 High TEMP protect',
    0x03: '点火传感器故障 Ignition sensor Fault',
    0x04: '电机故障 Motor Fault',
    0x05: '电热塞故障 Glow Plug Fault',
    0x06: '出风温度传感器故障 Outlet TEMP fault',
    0x07: '油泵故障 Pump fault',
    0x08: '进风温度传感器故障 Inlet TEMP fault',
    0x09: '二次点火失败 Second Ignition failure',
    0x0A: '缺油 Less Diesel'
  };

  constructor(private readonly canReceiver: CanReceiverService) {
    this.logger.log('DieselHeaterService 构造函数已调用');
  }

  async onModuleInit() {
    try {
      this.logger.log('开始初始化柴油加热器服务...');
      this.setupCanFrameListeners();
      this.logger.log('柴油加热器服务已初始化');
    } catch (error) {
      this.logger.error('柴油加热器服务初始化失败:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    this.stopHeaterControl();
  }

  private setupCanFrameListeners() {
    try {
      this.logger.log('设置CAN帧监听器...');
      // 注册CAN帧监听器 - 监听来自柴油加热器的反馈帧
      this.canReceiver.registerMatcher(
        (frame: CanFrame) => {
          // 监听温度和状态反馈帧
          return frame.id === 0x18FFFD45 || frame.id === 0x18FFFB45;
        },
        (frame: CanFrame) => {
          this.handleCanFrame(frame);
        }
      );
      this.logger.log('CAN帧监听器设置完成');
    } catch (error) {
      this.logger.error('设置CAN帧监听器失败:', error);
      throw error;
    }
  }

  private handleCanFrame(frame: CanFrame) {
    try {
      switch (frame.id) {
        case 0x18FFFD45: // 温度反馈帧
          this.parse18FFFD45(frame);
          break;
        case 0x18FFFB45: // 状态反馈帧
          this.parse18FFFB45(frame);
          break;
        default:
        //this.logger.debug(`收到未处理的CAN帧 ID: 0x${frame.id.toString(16)}`);
      }
    } catch (error) {
      this.logger.error(`处理柴油加热器CAN帧时出错: ${error.message}`);
    }
  }

  // 解析温度反馈帧 0x18FFFD45
  private parse18FFFD45(frame: CanFrame) {
    if (frame.data.length < 2) {
      this.logger.error('0x18FFFD45报文数据长度不足，至少需要2字节');
      return;
    }

    const byte1 = frame.data[0];
    const byte2 = frame.data[1];

    this.status.inletTemperature = byte1 - 40;
    this.status.outletTemperature = byte2 - 40;
    this.status.lastUpdateTime = new Date();

    this.logger.debug(`温度更新: 进水温度=${this.status.inletTemperature}°C, 出水温度=${this.status.outletTemperature}°C`);
  }

  // 解析状态反馈帧 0x18FFFB45
  private parse18FFFB45(frame: CanFrame) {
    if (frame.data.length < 2) {
      this.logger.error('0x18FFFB45报文数据长度不足，至少需要2字节');
      return;
    }

    const byte1 = frame.data[0];
    const byte2 = frame.data[1];

    // 解析各个位段
    this.status.workStatus = byte1 & 0x03;
    this.status.workMode = (byte1 >> 2) & 0x03;
    this.status.ignitionStatus = (byte1 >> 4) & 0x03;
    this.status.faultCode = byte2;

    // 更新文本描述
    this.status.workStatusText = this.workStatusMap[this.status.workStatus as keyof typeof this.workStatusMap] || `未知(${this.status.workStatus})`;
    this.status.workModeText = this.workModeMap[this.status.workMode as keyof typeof this.workModeMap] || `未知(${this.status.workMode})`;
    this.status.ignitionStatusText = this.ignitionStatusMap[this.status.ignitionStatus as keyof typeof this.ignitionStatusMap] || `未知(${this.status.ignitionStatus})`;
    this.status.faultText = this.faultCodeMap[this.status.faultCode] || '未知故障';

    // 更新便于使用的布尔值
    this.status.isRunning = this.status.workStatus === 1;
    this.status.isHeating = this.status.workMode === 1;
    this.status.lastUpdateTime = new Date();

    this.logger.debug(`状态更新: ${this.status.workStatusText}, ${this.status.workModeText}, 故障码: ${this.status.faultText}`);
  }

  // 创建柴油锅炉控制帧
  private createHeaterControlFrame(turnOn: boolean, enableHeating: boolean): CanFrame {
    // Byte 1 构造
    // Bits 0~1: 开关机命令
    const onOffBits = turnOn ? 0x01 : 0x00; // 01: 开机, 00: 关机

    // Bits 2~3: 工作模式（加热）
    const modeBits = enableHeating ? 0x01 : 0x00; // 01: 加热工作, 00: 加热关闭

    // 组合 Byte 1
    const byte1 = onOffBits | (modeBits << 2);

    // 创建完整的 8 字节数据包
    const data = new Uint8Array(8);
    data[0] = byte1;
    // 设置温度，假设范围是 0-100°C，转换为 0-20 范围内的值
    const byte2 = Math.max(0, Math.min(255, Math.round(this.status.targetTemperature / 5)));
    data[1] = byte2;

    return {
      id: 0x1807e244, // 发送给柴油锅炉的 CAN ID
      data: data,
      dlc: 8,
      format: FrameFormat.EXT,
      type: FrameType.DATA,
    };
  }

  // 启动定时发送控制帧
  private startHeaterControl(turnOn: boolean, enableHeating: boolean) {
    this.currentHeaterState = { on: turnOn, heating: enableHeating };

    // 清除之前的定时器
    if (this.heaterControlInterval) {
      clearInterval(this.heaterControlInterval);
    }

    // 立即发送一次
    this.sendControlFrame().then(() => {
      this.logger.log(`加热器控制发送: ${turnOn ? '开机' : '关机'}, 加热: ${enableHeating ? '开启' : '关闭'}`);
    });

    // 设置定时发送，每1000ms一次
    this.heaterControlInterval = setInterval(() => {
      this.sendControlFrame().then(() => {
        this.logger.debug(`加热器控制循环发送: ${this.currentHeaterState.on ? '开机' : '关机'}, 加热: ${this.currentHeaterState.heating ? '开启' : '关闭'}`);
      }).catch(err => {
        this.logger.error('发送加热器控制帧失败:', err);
      });
    }, 1000);
  }

  // 发送控制帧
  private async sendControlFrame(): Promise<void> {
    const frame = this.createHeaterControlFrame(this.currentHeaterState.on, this.currentHeaterState.heating);
    // 使用第二个端口发送（端口8400）
    await this.canReceiver.sendFrame(frame, true);
  }

  // 停止定时发送
  private stopHeaterControl() {
    if (this.heaterControlInterval) {
      clearInterval(this.heaterControlInterval);
      this.heaterControlInterval = undefined;
    }
  }

  // 获取当前状态
  getStatus(): DieselHeaterStatus {
    return { ...this.status };
  }

  // 获取详细状态信息
  getDetailedStatus() {
    return {
      ...this.status,
      controlState: this.getControlState(),
      connectionStatus: this.isConnected(),
      online: (new Date().getTime() - this.status.lastUpdateTime.getTime()) <= 5000 // 5秒内有更新则视为在线
    };
  }

  // 检查柴油加热器是否在线
  private checkHeaterOnline(): void {
    const now = new Date();
    const timeDiff = now.getTime() - this.status.lastUpdateTime.getTime();

    if (timeDiff > 5000) { // 5秒
      throw new Error('柴油加热器可能未开机或连接异常，请确认设备状态后重试');
    }
  }

  // 启动加热器并开始加热
  async startHeaterWithHeating(): Promise<void> {
    // 检查柴油加热器是否在线
    this.checkHeaterOnline();

    // 确保第二个端口已连接
    if (!this.canReceiver.getConnectionStatus().isConnected2) {
      const connected = await this.canReceiver.connectSecondPort();
      if (!connected) {
        throw new Error('无法连接到加热器控制端口');
      }
    }

    this.startHeaterControl(true, true);
    this.logger.log('启动加热器并开始加热');
  }

  // 启动加热器但不加热
  async startHeaterWithoutHeating(): Promise<void> {
    // 检查柴油加热器是否在线
    this.checkHeaterOnline();

    // 确保第二个端口已连接
    if (!this.canReceiver.getConnectionStatus().isConnected2) {
      const connected = await this.canReceiver.connectSecondPort();
      if (!connected) {
        throw new Error('无法连接到加热器控制端口');
      }
    }

    this.startHeaterControl(true, false);
    this.logger.log('启动加热器但不加热');
  }

  // 停止加热器
  async stopHeater(): Promise<void> {
    this.stopHeaterControl();

    // 发送关机命令
    if (this.canReceiver.getConnectionStatus().isConnected2) {
      const frame = this.createHeaterControlFrame(false, false);
      await this.canReceiver.sendFrame(frame, true);
    }

    this.logger.log('停止加热器');
  }

  // 设置目标温度
  async setTargetTemperature(temperature: number): Promise<void> {
    if (temperature < 0 || temperature > 100) {
      throw new Error('温度设置超出范围 (0-100°C)');
    }

    this.status.targetTemperature = temperature;
    this.logger.log(`设置目标温度: ${temperature}°C`);

    // 如果当前正在运行，重新发送控制帧以更新温度设置
    if (this.heaterControlInterval) {
      await this.sendControlFrame();
    }
  }

  // 切换加热状态
  async toggleHeating(): Promise<void> {
    if (this.currentHeaterState.on) {
      this.startHeaterControl(this.currentHeaterState.on, !this.currentHeaterState.heating);
      this.logger.log(`切换加热状态: ${this.currentHeaterState.heating ? '开启' : '关闭'}`);
    } else {
      throw new Error('加热器未运行，无法切换加热状态');
    }
  }

  // 获取连接状态
  isConnected(): boolean {
    const connectionStatus = this.canReceiver.getConnectionStatus();
    return connectionStatus.isConnected2 && connectionStatus.isReceiving2;
  }

  // 获取当前控制状态
  getControlState() {
    return {
      ...this.currentHeaterState,
      hasActiveControl: !!this.heaterControlInterval,
      targetTemperature: this.status.targetTemperature
    };
  }

  // 连接第二个端口（加热器控制端口）
  async connectSecondPort(): Promise<boolean> {
    try {
      this.logger.log('正在连接加热器控制端口...');
      const result = await this.canReceiver.connectSecondPort();
      if (result) {
        this.logger.log('加热器控制端口连接成功');
      } else {
        this.logger.error('加热器控制端口连接失败');
      }
      return result;
    } catch (error) {
      this.logger.error('连接加热器控制端口时发生错误:', error);
      return false;
    }
  }

  // 断开第二个端口连接
  async disconnectSecondPort(): Promise<void> {
    try {
      this.logger.log('正在断开加热器控制端口...');
      
      // 如果正在运行控制，先停止
      if (this.heaterControlInterval) {
        this.stopHeaterControl();
        this.logger.log('已停止加热器控制循环');
      }
      
      await this.canReceiver.disconnectSecondPort();
      this.logger.log('加热器控制端口已断开');
    } catch (error) {
      this.logger.error('断开加热器控制端口时发生错误:', error);
      throw error;
    }
  }
}
