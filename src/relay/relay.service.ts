import { Injectable } from '@nestjs/common';
import { RELAY_STATE, RELAY_TYPE, RelayOptions, StateChangeEvent, RelayStateChange, InputStateChange } from './types';
import { ModbusService, ModbusPort } from '../modbus/modbus.service';
import { loadDevices, getAllDevices } from './device-loader';
import { RelayEventService } from './relay-event.service';

export interface DeviceConfig {
    id: string;
    name: string;
    type: "ZQWL_RELAY_16" | "ZQWL_RELAY_8" | "ZQWL_RELAY_4";
    address: number;
    port: ModbusPort; // 新增字段，关联 ModbusPort
    description: string;
    buttons: ButtonConfig[];
}

export interface ButtonConfig {
    id: string;
    relayIndex: number;
    name: string;
    description: string;
    room?: string;
}

export type RelayTypeMap = {
    [key in DeviceConfig["type"]]: RELAY_TYPE;
};

export const RELAY_TYPE_MAP: RelayTypeMap = {
    ZQWL_RELAY_16: RELAY_TYPE.ZQWL_RELAY_16,
    ZQWL_RELAY_8: RELAY_TYPE.ZQWL_RELAY_8,
    ZQWL_RELAY_4: RELAY_TYPE.ZQWL_RELAY_4,
};

@Injectable()
export class RelayService {
    private relayControllers: Map<number, RelayController> = new Map();
    private deviceConfigs: DeviceConfig[] = [];

    constructor(
        private readonly modbusService: ModbusService,
        private readonly relayEventService: RelayEventService
    ) {
        this.loadDeviceConfigs(); // 在服务初始化时加载设备配置
    }

    private loadDeviceConfigs(): void {
        loadDevices(); // 调用 device-loader 的加载方法
        this.deviceConfigs = getAllDevices(); // 获取加载的设备配置
    }

    getDeviceConfigs(): DeviceConfig[] {
        return this.deviceConfigs;
    }

    getRelayControllerFromConfig(deviceId: string): RelayController {
        const config = this.deviceConfigs.find(device => device.id === deviceId);
        if (!config) {
            throw new Error(`Device with ID ${deviceId} not found`);
        }

        const relayOptions: RelayOptions = {
            relayAddr: config.address,
            relayType: RELAY_TYPE_MAP[config.type],
        };
        console.log(`Creating relay controller for device ${deviceId} at address ${relayOptions.relayAddr} on port ${config.port}`);
        return this.getRelayController(config.port, relayOptions);
    }

    getRelayController(port: ModbusPort, relayOptions: RelayOptions): RelayController {
        const key = this.getControllerKey(port, relayOptions.relayAddr);
        if (!this.relayControllers.has(key)) {
            const relayLength = this.getRelayLength(relayOptions);
            const deviceConfig = this.deviceConfigs.find(config =>
                config.address === relayOptions.relayAddr && config.port === port
            );
            if (!deviceConfig) {
                throw new Error(`can not find device config; relay addr:${relayOptions.relayAddr}, modbus port: ${port}`)
            }
            const controller = new RelayController(
                this.modbusService,
                port,
                relayOptions.relayAddr,
                relayLength,
                this.relayEventService,
                deviceConfig.id
            );
            this.relayControllers.set(key, controller);
        }
        return this.relayControllers.get(key)!;
    }

    private getControllerKey(port: ModbusPort, relayAddr: number): number {
        // 修复：使用更可靠的键生成方式
        // 将端口路径转换为数字，然后与地址组合
        const portHash = this.hashString(port);
        return portHash * 10000 + relayAddr; // 确保不同端口和地址的组合产生唯一键
    }

    private hashString(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash) % 1000; // 限制在合理范围内
    }

    private getRelayLength(relayOption: RelayOptions): number {
        switch (relayOption.relayType) {
            case RELAY_TYPE.ZQWL_RELAY_16:
                return 16;
            case RELAY_TYPE.ZQWL_RELAY_8:
                return 8;
            case RELAY_TYPE.ZQWL_RELAY_4:
                return 4;
            default:
                throw new Error(`Unsupported relay type: ${relayOption.relayType}`);
        }
    }
}

class RelayController {
    private isOnline: boolean = false; // 设备是否在线
    private isInitialized: boolean = false; // 是否已完成初始化检查

    private lastRelayStateUpdate = 0;
    private lastInputStateUpdate = 0;
    private cacheTTL = 3000; // 缓存过期时间（毫秒），可自行调整
    private cachedRelayState: RELAY_STATE[] = [];
    private cachedInputState: RELAY_STATE[] = [];

    // 定时更新相关
    private updateInterval: NodeJS.Timeout | null = null;
    private readonly updateIntervalMs = 3000; // 3秒更新一次
    private isDestroyed = false;

    constructor(
        private modbusService: ModbusService,
        private port: ModbusPort,
        private relayAddr: number,
        private relayLength: number,
        private relayEventService: RelayEventService,
        private deviceId: string
    ) {
        // 初始化缓存数组
        this.cachedRelayState = new Array(relayLength).fill(RELAY_STATE.OFF);
        this.cachedInputState = new Array(relayLength).fill(RELAY_STATE.OFF);

        // 先进行初始在线检查，然后启动定时更新
        this.performInitialOnlineCheck();
    }

    private async performInitialOnlineCheck(): Promise<void> {
        try {
            // 尝试读取设备状态来验证设备是否在线
            await this.readRelayState(true);
            await this.readInputState(true);
            this.isOnline = true;
            console.log(`设备 ${this.deviceId} 初始化检查: 在线`);
        } catch (error) {
            this.isOnline = false;
            console.warn(`设备 ${this.deviceId} 初始化检查: 离线 -`, error.message);
        } finally {
            this.isInitialized = true;
            this.startPeriodicUpdate();
        }
    }

    private startPeriodicUpdate(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(async () => {
            if (this.isDestroyed) return;

            try {
                await this.performPeriodicUpdate();
            } catch (error) {
                console.error(`定时更新失败 - 设备 ${this.deviceId}:`, error);
                this.isOnline = false;
            }
        }, this.updateIntervalMs);
    }

    private async performPeriodicUpdate(): Promise<void> {
        const previousRelayState = [...this.cachedRelayState];
        const previousInputState = [...this.cachedInputState];

        try {
            // 强制进行高优先级读取以确保定时刷新真正更新缓存
            const [newRelayState, newInputState] = await Promise.all([
                this.readRelayState(true),
                this.readInputState(true)
            ]);

            // 检查状态变化
            const relayChanges = this.detectRelayStateChanges(previousRelayState, newRelayState);
            const inputChanges = this.detectInputStateChanges(previousInputState, newInputState);

            // 如果有变化，发送事件通知
            if (relayChanges.length > 0 || inputChanges.length > 0) {
                const event: StateChangeEvent = {
                    deviceId: this.deviceId,
                    address: this.relayAddr,
                    port: this.port,
                    relayStates: newRelayState,
                    inputStates: newInputState,
                    timestamp: Date.now(),
                    changedRelayIndexes: relayChanges.map(change => change.index),
                    changedInputIndexes: inputChanges.map(change => change.index)
                };

                this.relayEventService.emitStateChange(event);
                console.log(`状态变化检测 - 设备 ${this.deviceId}: 继电器变化 ${relayChanges.length} 个, 输入变化 ${inputChanges.length} 个`);
            }

            // 只有读取成功才设置为在线
            if (!this.isOnline) {
                console.log(`设备 ${this.deviceId} 重新上线`);
            }
            this.isOnline = true;
        } catch (error) {
            if (this.isOnline) {
                // 区分不同类型的错误
                if (error.message.includes('冷却期')) {
                    console.debug(`设备 ${this.deviceId} 在冷却期，跳过本次更新`);
                } else {
                    console.warn(`设备 ${this.deviceId} 离线 `);
                }
            }
            this.isOnline = false;
            throw error;
        }
    }

    private detectRelayStateChanges(oldStates: RELAY_STATE[], newStates: RELAY_STATE[]): RelayStateChange[] {
        const changes: RelayStateChange[] = [];
        for (let i = 0; i < Math.min(oldStates.length, newStates.length); i++) {
            if (oldStates[i] !== newStates[i]) {
                changes.push({
                    index: i,
                    oldState: oldStates[i],
                    newState: newStates[i]
                });
            }
        }
        return changes;
    }

    private detectInputStateChanges(oldStates: RELAY_STATE[], newStates: RELAY_STATE[]): InputStateChange[] {
        const changes: InputStateChange[] = [];
        for (let i = 0; i < Math.min(oldStates.length, newStates.length); i++) {
            if (oldStates[i] !== newStates[i]) {
                changes.push({
                    index: i,
                    oldState: oldStates[i],
                    newState: newStates[i]
                });
            }
        }
        return changes;
    }

    async checkOnline(): Promise<boolean> {
        try {
            // 强制进行高优先级检查
            await this.readRelayState(true);
            if (!this.isOnline) {
                console.log(`设备 ${this.deviceId} 在线检查: 重新上线`);
            }
            this.isOnline = true;
        } catch (error) {
            if (this.isOnline) {
                console.warn(`设备 ${this.deviceId} 在线检查: 离线 -`, error.message);
            }
            this.isOnline = false;
            // 如果是冷却期错误，不需要额外日志
            if (!error.message.includes('冷却期')) {
                console.warn(`设备 ${this.deviceId} 检查失败:`, error.message);
            }
        }
        return this.isOnline;
    }

    async readRelayState(highPriority = false): Promise<RELAY_STATE[]> {
        const now = Date.now();
        // 如果不是高优先级，且距离上一次请求未超过 cacheTTL，则直接返回缓存
        if (!highPriority && (now - this.lastRelayStateUpdate < this.cacheTTL)) {
            return this.cachedRelayState;
        }

        try {
            const states = await this.modbusService.enqueueRequest<RELAY_STATE[]>(
                this.port,
                this.relayAddr,
                async (client) => {
                    const data = (await client.readCoils(0, this.relayLength)).data;
                    return data.slice(0, this.relayLength).map(v => (v ? RELAY_STATE.ON : RELAY_STATE.OFF));
                },
                highPriority
            );
            this.lastRelayStateUpdate = now;
            this.cachedRelayState = states;
            return states;
        } catch (error) {
            // 读取失败时，如果是高优先级请求，更新在线状态
            if (highPriority && !error.message.includes('冷却期')) {
                this.isOnline = false;
            }
            throw error;
        }
    }

    async readInputState(highPriority = false): Promise<RELAY_STATE[]> {
        const now = Date.now();
        if (!highPriority && (now - this.lastInputStateUpdate < this.cacheTTL)) {
            return this.cachedInputState;
        }

        try {
            const states = await this.modbusService.enqueueRequest<RELAY_STATE[]>(
                this.port,
                this.relayAddr,
                async (client) => {
                    const data = (await client.readDiscreteInputs(0, this.relayLength)).data;
                    return data.slice(0, this.relayLength).map(v => (v ? RELAY_STATE.ON : RELAY_STATE.OFF));
                },
                highPriority
            );
            this.lastInputStateUpdate = now;
            this.cachedInputState = states;
            return states;
        } catch (error) {
            // 读取失败时，如果是高优先级请求，更新在线状态
            if (highPriority && !error.message.includes('冷却期')) {
                this.isOnline = false;
            }
            throw error;
        }
    }

    async writeRelayOn(index: number): Promise<boolean> {
        // 写操作需要更快执行，也可标记为高优先级
        return this.writeRelay(index, RELAY_STATE.ON, true);
    }

    async writeRelayOff(index: number): Promise<boolean> {
        return this.writeRelay(index, RELAY_STATE.OFF, true);
    }

    private async writeRelay(index: number, state: RELAY_STATE, highPriority = false): Promise<boolean> {
        try {
            const result = await this.modbusService.enqueueRequest<boolean>(
                this.port,
                this.relayAddr,
                async (client) => {
                    const value = state === RELAY_STATE.ON;
                    await client.writeCoil(index, value);

                    // 立即更新缓存并发送事件
                    const oldState = this.cachedRelayState[index];
                    this.cachedRelayState[index] = state;

                    if (oldState !== state) {
                        const event: StateChangeEvent = {
                            deviceId: this.deviceId,
                            address: this.relayAddr,
                            port: this.port,
                            relayStates: [...this.cachedRelayState],
                            inputStates: [...this.cachedInputState],
                            timestamp: Date.now(),
                            changedRelayIndexes: [index],
                            changedInputIndexes: []
                        };
                        this.relayEventService.emitStateChange(event);
                    }

                    return true;
                },
                highPriority
            );
            return result;
        } catch (error) {
            // 写入失败时也更新在线状态，但排除冷却期错误
            if (!error.message.includes('冷却期')) {
                this.isOnline = false;
            }
            throw error;
        }
    }

    destroy(): void {
        this.isDestroyed = true;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    getIsOnline(): boolean {
        return this.isOnline;
    }

    // 获取是否已完成初始化
    getIsInitialized(): boolean {
        return this.isInitialized;
    }

    getRelayState(): RELAY_STATE[] {
        return this.cachedRelayState;
    }

    getInputState(): RELAY_STATE[] {
        return this.cachedInputState;
    }
}
