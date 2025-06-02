import * as path from "path"; // 修复：确保正确导入 path 模块
import * as fs from "fs";
import { DeviceConfig, ButtonConfig } from "./relay.service";
import { ModbusPort } from "src/modbus/modbus.service";

const DEVICES_PATH = path.resolve(__dirname, "../../devices.json"); // 更新路径，指向项目根目录

type ButtonMap = Record<
    string,
    {
        deviceId: string;
        relayIndex: number;
        buttonConfig: ButtonConfig;
    }
>;

let devices: DeviceConfig[] = [];
let buttonMap: ButtonMap = {};

export function loadDevices(): void {
    try {
        const data = fs.readFileSync(DEVICES_PATH, "utf-8");
        const rawDevices = JSON.parse(data);

        devices = rawDevices.map((device: DeviceConfig) => {
            // 验证设备类型和按钮数量
            const maxButtons = device.type === "ZQWL_RELAY_16" ? 16 : device.type === "ZQWL_RELAY_8" ? 8 : 4;
            if (device.buttons.length > maxButtons) {
                throw new Error(
                    `设备 ${device.id} 配置了 ${device.buttons.length} 个按钮，但类型 ${device.type} 最大支持 ${maxButtons} 个`
                );
            }

            // 验证 modbus port 参数是否存在
            if (!device.port) {
                throw new Error(`设备 ${device.id} 缺少 modbus port 参数`);
            }

            const port = ModbusPort[device.port as unknown as keyof typeof ModbusPort]; // ✔️
            return {
                ...device,
                port,
                buttons: device.buttons.map((btn, index) => ({
                    ...btn,
                    relayIndex: index, // 强制按顺序生成索引
                })),
            };
        });

        // 构建全局按钮映射
        buttonMap = devices.reduce((map, device) => {
            device.buttons.forEach((btn) => {
                if (map[btn.id]) {
                    throw new Error(`检测到重复按钮ID: ${btn.id}`);
                }
                map[btn.id] = {
                    deviceId: device.id,
                    relayIndex: btn.relayIndex,
                    buttonConfig: btn,
                };
            });
            return map;
        }, {} as ButtonMap);

        console.log(
            `成功加载 ${devices.length} 个设备，共 ${Object.keys(buttonMap).length} 个按钮`
        );
    } catch (err) {
        console.error("设备配置加载失败:", err);
        process.exit(1);
    }
}

export function getButtonConfig(buttonId: string): {
    deviceId: string;
    relayIndex: number;
    buttonConfig: ButtonConfig;
} {
    const config = buttonMap[buttonId];
    if (!config) {
        throw new Error(`未找到按钮配置: ${buttonId}`);
    }
    return config;
}

export function getDevice(deviceId: string): DeviceConfig {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) {
        throw new Error(`未找到设备: ${deviceId}`);
    }
    return device;
}

export function getAllDevices(): DeviceConfig[] {
    return [...devices];
}
