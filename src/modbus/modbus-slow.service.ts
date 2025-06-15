import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import * as SerialPort from 'serialport';

interface ModbusRequest {
  resolve: (data: Buffer) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  expectedBytes?: number;
}

interface TaskExecutionInfo {
  taskName: string;
  taskIndex: number;
  totalTasks: number;
  startTime: Date;
  endTime?: Date;
  result?: any;
  error?: Error;
}

interface ScheduledTask {
  name: string;
  task: () => Promise<any>;
}

type TaskLogCallback = (info: TaskExecutionInfo) => void;

@Injectable()
export class ModbusSlowService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ModbusSlowService.name);
  private port: SerialPort.SerialPort;
  private dataBuffer = Buffer.alloc(0);
  private isConnected = false;
  private pendingRequest: ModbusRequest | null = null;
  private scheduledTasks: ScheduledTask[] = [];
  private scheduleTimer: NodeJS.Timeout;
  private isExecutingTasks = false;
  private taskLogCallback: TaskLogCallback | null = null;
  private readonly SCHEDULE_INTERVAL = 5000; // 5秒间隔

  constructor() {
    this.initializePort();
  }

  async onModuleInit() {
    await this.ensureConnection();
    this.startScheduler();
  }

  private initializePort() {
    this.port = new SerialPort.SerialPort({
      path: '/dev/ttyS6',
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
      autoOpen: false,
    });

    this.port.on('open', () => {
      this.isConnected = true;
      this.logger.log('串口连接成功');
    });

    this.port.on('error', (err) => {
      this.isConnected = false;
      this.logger.error(`串口错误: ${err.message}`);
      this.rejectPendingRequest(err);
    });

    this.port.on('close', () => {
      this.isConnected = false;
      this.logger.warn('串口连接关闭');
    });

    this.port.on('data', (data: Buffer) => {
      this.dataBuffer = Buffer.concat([this.dataBuffer, data]);
      this.logger.debug(
        `接收到 ${data.length} 字节，缓冲区总计 ${this.dataBuffer.length} 字节`,
      );
      this.processBufferedData();
    });
  }

  private async ensureConnection(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('串口连接超时'));
      }, 5000);

      this.port.open((err) => {
        clearTimeout(timeout);
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  private processBufferedData() {
    if (!this.pendingRequest) {
      return;
    }

    while (this.dataBuffer.length > 0) {
      if (this.dataBuffer.length < 3) {
        break;
      }

      const functionCode = this.dataBuffer[1];
      let expectedFrameLength = 0;

      if (functionCode === 0x03) {
        const byteCount = this.dataBuffer[2];
        expectedFrameLength = 3 + byteCount + 2;
      } else if (functionCode > 0x80) {
        expectedFrameLength = 5;
      } else {
        expectedFrameLength = 8;
      }

      if (this.dataBuffer.length < expectedFrameLength) {
        this.logger.debug(
          `等待更多数据，当前${this.dataBuffer.length}字节，需要${expectedFrameLength}字节`,
        );
        break;
      }

      const completeFrame = this.dataBuffer.slice(0, expectedFrameLength);
      this.dataBuffer = this.dataBuffer.slice(expectedFrameLength);

      this.logger.debug(
        `接收完整帧: ${completeFrame.toString('hex').toUpperCase()}`,
      );
      this.handleCompleteFrame(completeFrame);

      if (this.dataBuffer.length > 0) {
        this.logger.debug(
          `缓冲区剩余 ${this.dataBuffer.length} 字节，继续处理...`,
        );
      }
    }
  }

  private handleCompleteFrame(frame: Buffer) {
    if (!this.pendingRequest) {
      return;
    }

    const functionCode = frame[1];

    if (functionCode === 0x03) {
      // 成功响应，返回数据部分（去掉地址、功能码、字节数和CRC）
      const byteCount = frame[2];
      const dataPayload = frame.slice(3, 3 + byteCount);
      this.resolvePendingRequest(dataPayload);
    } else if (functionCode > 0x80) {
      const errorCode = frame[2];
      const error = new Error(
        `Modbus错误: 功能码${functionCode}, 错误码${errorCode}`,
      );
      this.rejectPendingRequest(error);
    }
  }

  private resolvePendingRequest(data: Buffer) {
    if (this.pendingRequest) {
      clearTimeout(this.pendingRequest.timeout);
      this.pendingRequest.resolve(data);
      this.pendingRequest = null;
    }
  }

  private rejectPendingRequest(error: Error) {
    if (this.pendingRequest) {
      clearTimeout(this.pendingRequest.timeout);
      this.pendingRequest.reject(error);
      this.pendingRequest = null;
    }
  }

  async sendRequest(
    requestHex: string,
    timeoutMs: number = 10000,
  ): Promise<Buffer> {
    await this.ensureConnection();

    if (this.pendingRequest) {
      throw new Error('另一个请求正在进行中');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequest = null;
        reject(new Error('请求超时'));
      }, timeoutMs);

      this.pendingRequest = {
        resolve,
        reject,
        timeout,
      };

      const requestFrame = Buffer.from(requestHex, 'hex');

      this.port.write(requestFrame, (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequest = null;
          reject(new Error(`发送失败: ${err.message}`));
        } else {
          this.logger.debug(`请求已发送: ${requestHex}`);
        }
      });
    });
  }

  registerScheduledTask(taskName: string, task: () => Promise<any>) {
    this.scheduledTasks.push({ name: taskName, task });
  }

  setTaskLogCallback(callback: TaskLogCallback) {
    this.taskLogCallback = callback;
  }

  private startScheduler() {
    this.executeScheduledTasks();
    this.scheduleTimer = setInterval(() => {
      if (!this.isExecutingTasks) {
        this.executeScheduledTasks();
      } else {
        this.logger.warn('上一批定时任务仍在执行中，跳过本次调度');
      }
    }, this.SCHEDULE_INTERVAL);
  }

  private async executeScheduledTasks() {
    if (this.isExecutingTasks) {
      return;
    }

    this.isExecutingTasks = true;
    try {
      const totalTasks = this.scheduledTasks.length;

      for (let i = 0; i < this.scheduledTasks.length; i++) {
        const { name, task } = this.scheduledTasks[i];
        const taskInfo: TaskExecutionInfo = {
          taskName: name,
          taskIndex: i,
          totalTasks,
          startTime: new Date(),
        };

        // 任务开始日志 - 仅用于前端回调
        if (this.taskLogCallback) {
          this.taskLogCallback(taskInfo);
        }

        try {
          const result = await task();

          // 任务成功结束日志 - 仅用于前端回调
          taskInfo.endTime = new Date();
          taskInfo.result = result;
          if (this.taskLogCallback) {
            this.taskLogCallback(taskInfo);
          }
        } catch (error) {
          // 任务失败结束日志 - 仅用于前端回调
          taskInfo.endTime = new Date();
          taskInfo.error = error;
          if (this.taskLogCallback) {
            this.taskLogCallback(taskInfo);
          }

          // ModbusSlowService 自己的错误日志
          this.logger.error(`定时任务 [${name}] 执行失败: ${error.message}`);
        }
      }
    } finally {
      this.isExecutingTasks = false;
    }
  }

  async onModuleDestroy() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
    }

    this.rejectPendingRequest(new Error('服务正在关闭'));

    if (this.port && this.port.isOpen) {
      await new Promise<void>((resolve) => {
        this.port.close((err) => {
          if (err) {
            this.logger.error(`关闭串口时出错: ${err.message}`);
          } else {
            this.logger.log('串口已关闭');
          }
          resolve();
        });
      });
    }

    this.dataBuffer = Buffer.alloc(0);
  }
}
