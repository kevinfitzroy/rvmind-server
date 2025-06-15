import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { StateChangeEvent } from './types';
import { RelayService } from './relay.service';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/relay',
})
export class RelayGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedClients = new Set<Socket>();

  constructor(private relayService: RelayService) {}

  handleConnection(client: Socket) {
    console.log(`WebSocket 客户端连接: ${client.id}`);
    this.connectedClients.add(client);

    // 发送当前所有设备状态
    this.sendInitialStates(client);
  }

  handleDisconnect(client: Socket) {
    console.log(`WebSocket 客户端断开: ${client.id}`);
    this.connectedClients.delete(client);
  }

  @OnEvent('relay.state.changed')
  handleStateChange(event: StateChangeEvent) {
    // 广播状态变化给所有连接的客户端
    this.server.emit('stateChanged', event);
  }

  @SubscribeMessage('getDeviceStatus')
  async handleGetDeviceStatus(
    @MessageBody() data: { deviceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const controller = this.relayService.getRelayControllerFromConfig(
        data.deviceId,
      );
      const [relayStates, inputStates, isOnline] = await Promise.all([
        controller.readRelayState(true),
        controller.readInputState(true),
        controller.checkOnline(),
      ]);

      client.emit('deviceStatus', {
        deviceId: data.deviceId,
        relayStates,
        inputStates,
        isOnline,
        timestamp: Date.now(),
      });
    } catch (error) {
      client.emit('error', {
        message: `无法获取设备状态: ${data.deviceId}`,
        error: error.message,
      });
    }
  }

  @SubscribeMessage('subscribeDevice')
  handleSubscribeDevice(
    @MessageBody() data: { deviceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`device_${data.deviceId}`);
    client.emit('subscribed', { deviceId: data.deviceId });
  }

  @SubscribeMessage('unsubscribeDevice')
  handleUnsubscribeDevice(
    @MessageBody() data: { deviceId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`device_${data.deviceId}`);
    client.emit('unsubscribed', { deviceId: data.deviceId });
  }

  private async sendInitialStates(client: Socket) {
    try {
      const deviceConfigs = this.relayService.getDeviceConfigs();

      for (const config of deviceConfigs) {
        try {
          const controller = this.relayService.getRelayControllerFromConfig(
            config.id,
          );

          // 等待控制器初始化完成
          let retries = 0;
          while (!controller.getIsInitialized() && retries < 10) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            retries++;
          }

          // 强制检查在线状态
          const isOnline = await controller.checkOnline();

          const relayStates = controller.getRelayState();
          const inputStates = controller.getInputState();

          client.emit('initialState', {
            deviceId: config.id,
            relayStates,
            inputStates,
            isOnline,
            timestamp: Date.now(),
          });
        } catch (error) {
          console.error(`获取设备 ${config.id} 初始状态失败:`, error);
          // 发送离线状态
          client.emit('initialState', {
            deviceId: config.id,
            relayStates: [],
            inputStates: [],
            isOnline: false,
            timestamp: Date.now(),
          });
        }
      }
    } catch (error) {
      console.error('发送初始状态失败:', error);
    }
  }
}
