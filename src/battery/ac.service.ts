import { Injectable } from '@nestjs/common';
import { ModbusPort, ModbusService } from 'src/modbus/modbus.service';

const PMS_AC_ADDRESS = 0x42; // 0x42/66 PMS AC 控制器 485 modbus 地址
const MODBUS_PORT = ModbusPort.MAIN_PORT; // 主端口 波特率 115200

@Injectable()
export class AcService {
    private mainInverterTimer: NodeJS.Timeout | null = null;
    private backupInverterTimer: NodeJS.Timeout | null = null;

    constructor(
        private modbusService: ModbusService,
    ) { }

    // 打开AC放电模块
    async setAcInverterModule(moduleNumber: 0 | 1, state: "OPEN" | "CLOSE"): Promise<any> {
        try {
            // 通过 Modbus 发送控制指令
            const result = await this.modbusService.enqueueRequest(
                MODBUS_PORT,
                PMS_AC_ADDRESS,
                async (client) => {
                    return client.writeCoil(moduleNumber, state === "OPEN");
                },
                true
            );
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: `放电模块 ${moduleNumber} 开启失败`
            };
        }
    }

    // 通用逆变器控制函数
    private async controlInverter(
        moduleNumber: 0 | 1, 
        state: "OPEN" | "CLOSE", 
        timer: NodeJS.Timeout | null,
        timerPropertyName: 'mainInverterTimer' | 'backupInverterTimer',
        moduleName: string
    ): Promise<any> {
        try {
            if (state === "OPEN") {
                // 如果已有定时器，先清除
                if (timer) {
                    clearInterval(timer);
                }
                
                // 每隔1秒调用一次
                this[timerPropertyName] = setInterval(async () => {
                    await this.setAcInverterModule(moduleNumber, "OPEN");
                }, 1000);
                
                return {
                    success: true,
                    message: `${moduleName}定时开启已启动`
                };
            } else {
                // 清除定时器
                if (timer) {
                    clearInterval(timer);
                    this[timerPropertyName] = null;
                }
                
                // 发送3次关闭信息，间隔1秒
                for (let i = 0; i < 3; i++) {
                    await this.setAcInverterModule(moduleNumber, "CLOSE");
                    if (i < 2) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
                
                return {
                    success: true,
                    message: `${moduleName}已关闭`
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: `${moduleName}操作失败`
            };
        }
    }

    // 设置主供电逆变器
    async setMainPowerInverter(state: "OPEN" | "CLOSE"): Promise<any> {
        return this.controlInverter(0, state, this.mainInverterTimer, 'mainInverterTimer', '主供电逆变器');
    }

    // 设置备用电池充电逆变器
    async setBackupBatteryChargeInverter(state: "OPEN" | "CLOSE"): Promise<any> {
        return this.controlInverter(1, state, this.backupInverterTimer, 'backupInverterTimer', '备用电池充电逆变器');
    }

    // 获取主供电逆变器状态
    async getMainPowerInverterStatus(): Promise<any> {
        return {
            success: true,
            moduleNumber: 0,
            isOpen: this.mainInverterTimer !== null,
            status: this.mainInverterTimer !== null ? "OPEN" : "CLOSE",
            message: `主供电逆变器当前状态: ${this.mainInverterTimer !== null ? '开启' : '关闭'}`
        };
    }

    // 获取备用电池充电逆变器状态
    async getBackupBatteryChargeInverterStatus(): Promise<any> {
        return {
            success: true,
            moduleNumber: 1,
            isOpen: this.backupInverterTimer !== null,
            status: this.backupInverterTimer !== null ? "OPEN" : "CLOSE",
            message: `备用电池充电逆变器当前状态: ${this.backupInverterTimer !== null ? '开启' : '关闭'}`
        };
    }
}

