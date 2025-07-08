import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import ModbusRTU from 'modbus-serial';
import { SerialPortOptions } from 'modbus-serial/ModbusRTU';
import { ModbusQueueStatus, ModbusSystemStatus } from './modbus.controller';

export enum ModbusPort {
  MAIN_PORT = '/dev/ttyS9', // RS485 1
  // BACKUP_PORT = '/dev/ttyS6', // TODO check RS485 2
}

interface ModbusClientConfig {
  address: string;
  options: SerialPortOptions;
}

interface QueuedRequest {
  deviceAddress: number;
  task: (client: ModbusRTU) => Promise<any>;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

interface ErrorRecord {
  timestamp: number;
  error: string;
}

interface AccessRecord {
  timestamp: number;
  deviceAddress: number;
}

interface PortErrorStats {
  errors24h: ErrorRecord[];
  errors1m: ErrorRecord[];
  lastCleanup: number;
}

interface PortAccessStats {
  accesses1m: AccessRecord[];
  lastCleanup: number;
}

interface DeviceOfflineState {
  isOffline: boolean;
  lastFailedTime: number;
  cooldownDuration: number; // 冷却时间，毫秒
}

@Injectable()
export class ModbusService implements OnModuleInit, OnModuleDestroy {
  private clients: Map<ModbusPort, ModbusRTU> = new Map();
  private requestQueues: Map<ModbusPort, QueuedRequest[]> = new Map();
  private isProcessingQueue: Map<ModbusPort, boolean> = new Map();
  private lastRequestTime: Map<ModbusPort, number> = new Map(); // 记录每个端口的最后请求时间
  private minRequestInterval = 1; // 最小请求间隔（毫秒），可根据实际情况调整

  private periodicTaskInterval: NodeJS.Timeout | null = null;

  private errorStats: Map<ModbusPort, PortErrorStats> = new Map();
  private accessStats: Map<ModbusPort, PortAccessStats> = new Map(); // 新增访问统计
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 10000; // 改为每10秒清理一次，提高精度
  private readonly ERROR_24H_MS = 24 * 60 * 60 * 1000; // 24小时
  private readonly ERROR_1M_MS = 60 * 1000; // 1分钟
  private readonly ACCESS_1M_MS = 60 * 1000; // 1分钟访问统计窗口

  private readonly modbusConfigs: Record<ModbusPort, ModbusClientConfig> = {
    [ModbusPort.MAIN_PORT]: {
      address: ModbusPort.MAIN_PORT,
      options: { baudRate: 115200, parity: 'none', stopBits: 1, dataBits: 8 },
    },
    // [ModbusPort.BACKUP_PORT]: {
    //     address: ModbusPort.BACKUP_PORT,
    //     options: { baudRate: 9600, parity: 'none', stopBits: 1, dataBits: 8 },
    // },
  };

  // 设备离线状态管理
  private deviceOfflineStates = new Map<string, DeviceOfflineState>();
  private readonly DEFAULT_COOLDOWN_DURATION = 10000; // 10秒冷却期

  async onModuleInit(): Promise<void> {
    for (const port of Object.values(ModbusPort)) {
      const config = this.modbusConfigs[port];
      const client = new ModbusRTU();
      client.setTimeout(1000);
      await client.connectRTUBuffered(config.address, config.options);
      this.clients.set(port, client);
      this.requestQueues.set(port, []);
      this.isProcessingQueue.set(port, false);
      this.lastRequestTime.set(port, 0); // 初始化最后请求时间

      // 初始化错误统计
      this.errorStats.set(port, {
        errors24h: [],
        errors1m: [],
        lastCleanup: Date.now(),
      });

      // 初始化访问统计
      this.accessStats.set(port, {
        accesses1m: [],
        lastCleanup: Date.now(),
      });
    }

    // 启动定期清理任务
    this.startCleanupTask();
  }

  async onModuleDestroy(): Promise<void> {
    for (const client of this.clients.values()) {
      client.close(() => {});
    }
    this.clients.clear();
    if (this.periodicTaskInterval) {
      clearInterval(this.periodicTaskInterval);
      this.periodicTaskInterval = null;
    }

    // 停止清理任务
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.errorStats.clear();
    this.accessStats.clear(); // 清理访问统计
  }

  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredErrors();
    }, this.CLEANUP_INTERVAL_MS);
  }

  private cleanupExpiredErrors(): void {
    const now = Date.now();

    for (const [port, stats] of this.errorStats.entries()) {
      const before24hCount = stats.errors24h.length;
      const before1mCount = stats.errors1m.length;

      // 清理24小时前的错误记录
      stats.errors24h = stats.errors24h.filter(
        (error) => now - error.timestamp < this.ERROR_24H_MS,
      );

      // 清理1分钟前的错误记录
      stats.errors1m = stats.errors1m.filter(
        (error) => now - error.timestamp < this.ERROR_1M_MS,
      );

      // 记录清理的数量（可选，用于调试）
      const cleaned24h = before24hCount - stats.errors24h.length;
      const cleaned1m = before1mCount - stats.errors1m.length;

      if (cleaned24h > 0 || cleaned1m > 0) {
        console.log(
          `Port ${port} cleaned errors: 24h(${cleaned24h}), 1m(${cleaned1m})`,
        );
      }

      stats.lastCleanup = now;
    }

    // 清理访问统计
    for (const [port, stats] of this.accessStats.entries()) {
      const beforeAccessCount = stats.accesses1m.length;

      // 清理1分钟前的访问记录
      stats.accesses1m = stats.accesses1m.filter(
        (access) => now - access.timestamp < this.ACCESS_1M_MS,
      );

      const cleanedAccess = beforeAccessCount - stats.accesses1m.length;
      if (cleanedAccess > 0) {
        console.log(`Port ${port} cleaned accesses: 1m(${cleanedAccess})`);
      }

      stats.lastCleanup = now;
    }
  }

  private recordError(port: ModbusPort, error: Error): void {
    const stats = this.errorStats.get(port);
    if (!stats) return;

    const errorRecord: ErrorRecord = {
      timestamp: Date.now(),
      error: error.message,
    };

    stats.errors24h.push(errorRecord);
    stats.errors1m.push(errorRecord);

    // 如果错误记录过多，立即清理一次
    if (stats.errors24h.length > 1000) {
      this.cleanupExpiredErrors();
    }
  }

  private recordAccess(port: ModbusPort, deviceAddress: number): void {
    const stats = this.accessStats.get(port);
    if (!stats) return;

    const accessRecord: AccessRecord = {
      timestamp: Date.now(),
      deviceAddress,
    };

    stats.accesses1m.push(accessRecord);

    // 如果访问记录过多，立即清理一次
    if (stats.accesses1m.length > 1000) {
      this.cleanupExpiredErrors();
    }
  }

  private getErrorStats(port: ModbusPort): {
    count24h: number;
    count1m: number;
    lastError?: ErrorRecord;
  } {
    const stats = this.errorStats.get(port);
    if (!stats) {
      return { count24h: 0, count1m: 0 };
    }

    // 实时清理过期数据，确保统计准确
    const now = Date.now();

    // 清理过期的1分钟错误记录
    stats.errors1m = stats.errors1m.filter(
      (error) => now - error.timestamp < this.ERROR_1M_MS,
    );

    // 清理过期的24小时错误记录
    stats.errors24h = stats.errors24h.filter(
      (error) => now - error.timestamp < this.ERROR_24H_MS,
    );

    const lastError =
      stats.errors24h.length > 0
        ? stats.errors24h[stats.errors24h.length - 1]
        : undefined;

    return {
      count24h: stats.errors24h.length,
      count1m: stats.errors1m.length,
      lastError,
    };
  }

  private getAccessStats(port: ModbusPort): {
    count1m: number;
    lastAccess?: AccessRecord;
  } {
    const stats = this.accessStats.get(port);
    if (!stats) {
      return { count1m: 0 };
    }

    // 实时清理过期数据，确保统计准确
    const now = Date.now();

    // 清理过期的1分钟访问记录
    stats.accesses1m = stats.accesses1m.filter(
      (access) => now - access.timestamp < this.ACCESS_1M_MS,
    );

    const lastAccess =
      stats.accesses1m.length > 0
        ? stats.accesses1m[stats.accesses1m.length - 1]
        : undefined;

    return {
      count1m: stats.accesses1m.length,
      lastAccess,
    };
  }

  private getDeviceKey(port: ModbusPort, address: number): string {
    return `${port}:${address}`;
  }

  private getDeviceOfflineState(
    port: ModbusPort,
    address: number,
  ): DeviceOfflineState {
    const key = this.getDeviceKey(port, address);
    if (!this.deviceOfflineStates.has(key)) {
      this.deviceOfflineStates.set(key, {
        isOffline: false,
        lastFailedTime: 0,
        cooldownDuration: this.DEFAULT_COOLDOWN_DURATION,
      });
    }
    return this.deviceOfflineStates.get(key)!;
  }

  private isDeviceInCooldown(port: ModbusPort, address: number): boolean {
    const state = this.getDeviceOfflineState(port, address);
    if (!state.isOffline) {
      return false;
    }

    const now = Date.now();
    const timeSinceLastFailure = now - state.lastFailedTime;
    return timeSinceLastFailure < state.cooldownDuration;
  }

  private markDeviceOffline(port: ModbusPort, address: number): void {
    const state = this.getDeviceOfflineState(port, address);
    state.isOffline = true;
    state.lastFailedTime = Date.now();
    console.warn(
      `设备 ${port}:${address} 标记为离线，进入 ${state.cooldownDuration}ms 冷却期`,
    );
  }

  private markDeviceOnline(port: ModbusPort, address: number): void {
    const state = this.getDeviceOfflineState(port, address);
    if (state.isOffline) {
      console.log(`设备 ${port}:${address} 重新上线`);
    }
    state.isOffline = false;
    state.lastFailedTime = 0;
  }

  async enqueueRequest<T>(
    port: ModbusPort,
    deviceAddress: number,
    request: (client: ModbusRTU) => Promise<T>,
    highPriority = false,
  ): Promise<T> {
    // 检查设备是否在冷却期内
    if (this.isDeviceInCooldown(port, deviceAddress)) {
      const state = this.getDeviceOfflineState(port, deviceAddress);
      const remainingCooldown =
        state.cooldownDuration - (Date.now() - state.lastFailedTime);
      throw new Error(
        `设备 ${port}:${deviceAddress} 处于离线冷却期，剩余 ${Math.ceil(remainingCooldown / 1000)} 秒`,
      );
    }

    const queue = this.requestQueues.get(port);
    if (!queue) {
      throw new Error(`No request queue found for port: ${port}`);
    }
    // console.log(`ENQUEREQUEST ${deviceAddress}`);
    return new Promise<T>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        deviceAddress,
        task: async (client: ModbusRTU) => {
          // 在执行请求前设置正确的设备地址
          client.setID(deviceAddress);
          // console.log(
          //   `Processing request for port ${port} with device address ${deviceAddress}`,
          // );
          try {
            const result = await request(client);
            // 操作成功，标记设备为在线
            this.markDeviceOnline(port, deviceAddress);
            return result;
          } catch (error) {
            // 操作失败，标记设备为离线
            this.markDeviceOffline(port, deviceAddress);
            throw error;
          }
        },
        resolve,
        reject,
      };

      if (highPriority) {
        queue.unshift(queuedRequest); // 插入队列头部
      } else {
        queue.push(queuedRequest); // 插入队列尾部
      }

      this.processQueue(port);
    });
  }

  private async processQueue(port: ModbusPort): Promise<void> {
    const queue = this.requestQueues.get(port);
    const isProcessing = this.isProcessingQueue.get(port);
    if (!queue || isProcessing || queue.length === 0) {
      return;
    }

    // 限流逻辑：检查距离上次请求的时间间隔
    const now = Date.now();
    const lastTime = this.lastRequestTime.get(port) || 0;
    const timeSinceLastRequest = now - lastTime;

    if (timeSinceLastRequest < this.minRequestInterval) {
      // 如果时间间隔不够，延迟执行
      const delay = this.minRequestInterval - timeSinceLastRequest;
      setTimeout(() => this.processQueue(port), delay);
      return;
    }

    this.isProcessingQueue.set(port, true);
    this.lastRequestTime.set(port, now); // 更新最后请求时间

    const nextRequest = queue.shift();
    if (nextRequest) {
      try {
        const client = this.getClient(port);

        // 记录访问统计（在实际执行请求前记录）
        this.recordAccess(port, nextRequest.deviceAddress);

        const result = await nextRequest.task(client);
        nextRequest.resolve(result);
      } catch (error) {
        console.error(
          `Error processing request for port ${port}, device ${nextRequest.deviceAddress}:`,
          error,
        );

        // 记录错误统计
        this.recordError(port, error);

        nextRequest.reject(error);
      }
    }

    this.isProcessingQueue.set(port, false);

    // 继续处理队列中的下一个请求
    if (queue.length > 0) {
      // 使用 setTimeout 确保限流间隔
      setTimeout(() => this.processQueue(port), this.minRequestInterval);
    }
  }

  getClient(port: ModbusPort): ModbusRTU {
    const client = this.clients.get(port);
    if (!client) {
      throw new Error(`No Modbus client found for port: ${port}`);
    }
    return client;
  }

  getSystemStatus(): ModbusSystemStatus {
    const queues = this.getQueueStatus();
    const totalQueuedRequests = queues.reduce(
      (sum, queue) => sum + queue.queueLength,
      0,
    );
    const activeProcessingPorts = queues.filter(
      (queue) => queue.isProcessing,
    ).length;

    const totalErrors24h = queues.reduce(
      (sum, queue) => sum + queue.errorCount24h,
      0,
    );
    const totalErrors1m = queues.reduce(
      (sum, queue) => sum + queue.errorCount1m,
      0,
    );

    return {
      queues,
      totalQueuedRequests,
      activeProcessingPorts,
      totalErrors24h,
      totalErrors1m,
      totalAccesses1m: queues.reduce(
        (sum, queue) => sum + queue.accessCount1m,
        0,
      ),
    };
  }

  getQueueStatus(): ModbusQueueStatus[] {
    const now = Date.now();
    const statuses: ModbusQueueStatus[] = [];

    for (const port of Object.values(ModbusPort)) {
      statuses.push(this.getPortQueueStatus(port));
    }

    return statuses;
  }

  getPortQueueStatus(port: ModbusPort): ModbusQueueStatus {
    const now = Date.now();
    const queue = this.requestQueues.get(port) || [];
    const isProcessing = this.isProcessingQueue.get(port) || false;
    const lastRequestTime = this.lastRequestTime.get(port) || 0;
    const errorStats = this.getErrorStats(port);
    const accessStats = this.getAccessStats(port);

    return {
      port,
      queueLength: queue.length,
      isProcessing,
      lastRequestTime,
      timeSinceLastRequest: now - lastRequestTime,
      errorCount24h: errorStats.count24h,
      errorCount1m: errorStats.count1m,
      lastError: errorStats.lastError,
      accessCount1m: accessStats.count1m,
      lastAccess: accessStats.lastAccess,
    };
  }
}
