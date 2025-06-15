import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RelayService } from './relay.service';
import { getButtonConfig, getDevice } from './device-loader';
import { RELAY_STATE } from './types';
import { RelayGateway } from './relay.gateway';

@Controller({
  path: 'relay',
  version: '1',
})
export class RelayController {
  constructor(
    private readonly relayService: RelayService,
    private readonly relayGateway: RelayGateway,
  ) {}

  @Get('devices')
  getAllDevices() {
    return this.relayService.getDeviceConfigs().map((device) => ({
      id: device.id,
      name: device.name,
      type: device.type,
      description: device.description,
      buttons: device.buttons.map((btn) => ({
        id: btn.id,
        name: btn.name,
        description: btn.description,
        relayIndex: btn.relayIndex,
        room: btn.room || '未分类', // 提供默认值
      })),
    }));
  }

  @Get('device/:deviceId')
  getDevice(@Param('deviceId') deviceId: string) {
    try {
      return this.relayService
        .getDeviceConfigs()
        .find((device) => device.id === deviceId);
    } catch (error) {
      throw new HttpException(
        `Device not found: ${deviceId}`,
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @Get('device/:deviceId/relay-state')
  async getRelayState(@Param('deviceId') deviceId: string) {
    try {
      const controller =
        this.relayService.getRelayControllerFromConfig(deviceId);
      console.log(`Getting relay state for device: ${deviceId}`);
      return await controller.readRelayState();
    } catch (error) {
      // console.error(`Error getting relay state for device ${deviceId}:`, error);
      throw new HttpException(
        `Failed to get relay state for device: ${deviceId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('device/:deviceId/input-state')
  async getInputState(@Param('deviceId') deviceId: string) {
    try {
      const controller =
        this.relayService.getRelayControllerFromConfig(deviceId);
      return await controller.readInputState();
    } catch (error) {
      throw new HttpException(
        `Failed to get input state for device: ${deviceId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('device/:deviceId/online-status')
  async getDeviceOnlineStatus(@Param('deviceId') deviceId: string) {
    try {
      const controller =
        this.relayService.getRelayControllerFromConfig(deviceId);
      // 强制进行在线检查，而不是直接返回缓存状态
      const isOnline = await controller.checkOnline();
      return { success: true, deviceId, isOnline };
    } catch (error) {
      // 如果是冷却期错误，返回离线状态但不记录错误
      if (error.message.includes('冷却期')) {
        return {
          success: true,
          deviceId,
          isOnline: false,
          reason: '设备在冷却期',
        };
      }
      console.error(`检查设备 ${deviceId} 在线状态失败:`, error);
      return { success: true, deviceId, isOnline: false };
    }
  }

  @Get('rooms')
  getRooms() {
    const roomMap = new Map<
      string,
      Array<{
        buttonId: string;
        deviceId: string;
        name: string;
      }>
    >();

    this.relayService.getDeviceConfigs().forEach((device) => {
      device.buttons.forEach((btn) => {
        const room = btn.room || '未分类';
        if (!roomMap.has(room)) {
          roomMap.set(room, []);
        }
        roomMap.get(room)!.push({
          buttonId: btn.id,
          deviceId: device.id,
          name: btn.name,
        });
      });
    });

    return {
      rooms: Array.from(roomMap.entries()).map(([name, buttons]) => ({
        name,
        buttons,
      })),
    };
  }

  @Post('buttons/:buttonId/on')
  async turnButtonOn(@Param('buttonId') buttonId: string) {
    try {
      const { deviceId, relayIndex } = getButtonConfig(buttonId);
      const controller =
        this.relayService.getRelayControllerFromConfig(deviceId);
      await controller.writeRelayOn(relayIndex);

      // WebSocket 会通过事件机制自动通知，这里只返回 HTTP 响应
      return { success: true, data: { buttonId, deviceId, state: 'ON' } };
    } catch (error) {
      if (error.message.includes('冷却期')) {
        throw new HttpException(
          `设备暂时离线: ${error.message}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw new HttpException(
        `Failed to turn button on: ${buttonId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('buttons/:buttonId/off')
  async turnButtonOff(@Param('buttonId') buttonId: string) {
    try {
      const { deviceId, relayIndex } = getButtonConfig(buttonId);
      const controller =
        this.relayService.getRelayControllerFromConfig(deviceId);
      await controller.writeRelayOff(relayIndex);

      return { success: true, data: { buttonId, deviceId, state: 'OFF' } };
    } catch (error) {
      if (error.message.includes('冷却期')) {
        throw new HttpException(
          `设备暂时离线: ${error.message}`,
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw new HttpException(
        `Failed to turn button off: ${buttonId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async toggleRelay(
    deviceId: string,
    relayId: string,
    state: RELAY_STATE,
  ): Promise<{ success: true }> {
    const relayIndex = parseInt(relayId, 10);
    if (isNaN(relayIndex)) {
      throw new HttpException(
        `Invalid relay index: ${relayId}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const controller = this.relayService.getRelayControllerFromConfig(deviceId);
    if (state === RELAY_STATE.ON) {
      await controller.writeRelayOn(relayIndex);
    } else {
      await controller.writeRelayOff(relayIndex);
    }

    return { success: true };
  }

  @Post('device/:deviceId/:relayId/on')
  async turnRelayOn(
    @Param('deviceId') deviceId: string,
    @Param('relayId') relayId: string,
  ) {
    try {
      const result = await this.toggleRelay(deviceId, relayId, RELAY_STATE.ON);
      return result;
    } catch (error) {
      console.log(error);
      throw new HttpException(
        `Failed to turn relay on for device: ${deviceId}, relay: ${relayId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('device/:deviceId/:relayId/off')
  async turnRelayOff(
    @Param('deviceId') deviceId: string,
    @Param('relayId') relayId: string,
  ) {
    try {
      const result = await this.toggleRelay(deviceId, relayId, RELAY_STATE.OFF);
      return result;
    } catch (error) {
      throw new HttpException(
        `Failed to turn relay off for device: ${deviceId}, relay: ${relayId}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
