import { Controller, Get, Param } from '@nestjs/common';
import { ModbusService, ModbusPort } from './modbus.service';

export interface ErrorRecord {
  timestamp: number;
  error: string;
}

export interface AccessRecord {
  timestamp: number;
  deviceAddress: number;
}

export interface ModbusQueueStatus {
  port: ModbusPort;
  queueLength: number;
  isProcessing: boolean;
  lastRequestTime: number;
  timeSinceLastRequest: number;
  errorCount24h: number;
  errorCount1m: number;
  lastError?: ErrorRecord;
  accessCount1m: number;
  lastAccess?: AccessRecord;
}

export interface ModbusSystemStatus {
  queues: ModbusQueueStatus[];
  totalQueuedRequests: number;
  activeProcessingPorts: number;
  totalErrors24h: number;
  totalErrors1m: number;
  totalAccesses1m: number;
}

@Controller({ path: 'modbus', version: '1' })
export class ModbusController {
  constructor(private readonly modbusService: ModbusService) { }

  @Get('status')
  getSystemStatus(): ModbusSystemStatus {
    const systemStatus = this.modbusService.getSystemStatus();
    const totalErrors24h = systemStatus.queues.reduce(
      (sum, queue) => sum + queue.errorCount24h,
      0,
    );
    const totalErrors1m = systemStatus.queues.reduce(
      (sum, queue) => sum + queue.errorCount1m,
      0,
    );
    const totalAccesses1m = systemStatus.queues.reduce(
      (sum, queue) => sum + queue.accessCount1m,
      0,
    );

    return {
      ...systemStatus,
      totalErrors24h,
      totalErrors1m,
      totalAccesses1m,
    };
  }

  @Get('queues')
  getQueueStatus(): ModbusQueueStatus[] {
    return this.modbusService.getQueueStatus();
  }

  @Get('queue/:port')
  getPortQueueStatus(@Param('port') port: string): ModbusQueueStatus {
    // 验证端口参数
    const modbusPort = Object.values(ModbusPort).find((p) => p === port);
    if (!modbusPort) {
      throw new Error(`Invalid port: ${port}`);
    }
    return this.modbusService.getPortQueueStatus(modbusPort);
  }

  @Get('errors/:port')
  getPortErrors(@Param('port') port: string): {
    port: ModbusPort;
    errorCount24h: number;
    errorCount1m: number;
    lastError?: ErrorRecord;
  } {
    const modbusPort = Object.values(ModbusPort).find((p) => p === port);
    if (!modbusPort) {
      throw new Error(`Invalid port: ${port}`);
    }

    const status = this.modbusService.getPortQueueStatus(modbusPort);
    return {
      port: status.port,
      errorCount24h: status.errorCount24h,
      errorCount1m: status.errorCount1m,
      lastError: status.lastError,
    };
  }

  @Get('accesses/:port')
  getPortAccesses(@Param('port') port: string): {
    port: ModbusPort;
    accessCount1m: number;
    lastAccess?: AccessRecord;
  } {
    const modbusPort = Object.values(ModbusPort).find((p) => p === port);
    if (!modbusPort) {
      throw new Error(`Invalid port: ${port}`);
    }

    const status = this.modbusService.getPortQueueStatus(modbusPort);
    return {
      port: status.port,
      accessCount1m: status.accessCount1m,
      lastAccess: status.lastAccess,
    };
  }
}
