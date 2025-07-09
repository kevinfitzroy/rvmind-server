import { Injectable, Logger } from '@nestjs/common';
import { CanReceiverService } from '../lcwlan/canReceiver.service';
import { CanFrame } from 'src/lcwlan/types';
import * as winston from 'winston';
import * as path from 'path';

// 定时器配置接口
interface TimerConfig {
    interval: number; // 间隔时间（毫秒）
    enabled: boolean; // 是否启用
}

// 定时器管理器
class TimerManager {
    private timers: Map<string, { lastTime: number; config: TimerConfig }> = new Map();

    constructor(private defaultConfigs: Record<string, TimerConfig>) {
        // 初始化所有定时器
        Object.entries(defaultConfigs).forEach(([key, config]) => {
            this.timers.set(key, {
                lastTime: 0,
                config: { ...config }
            });
        });
    }

    // 检查是否应该触发采样
    shouldSample(timerKey: string): boolean {
        const timer = this.timers.get(timerKey);
        if (!timer || !timer.config.enabled) {
            return false;
        }

        const now = Date.now();
        if (now - timer.lastTime >= timer.config.interval) {
            timer.lastTime = now;
            return true;
        }
        return false;
    }

    // 更新定时器配置
    updateConfig(timerKey: string, config: Partial<TimerConfig>) {
        const timer = this.timers.get(timerKey);
        if (timer) {
            timer.config = { ...timer.config, ...config };
        }
    }

    // 获取定时器配置
    getConfig(timerKey: string): TimerConfig | undefined {
        return this.timers.get(timerKey)?.config;
    }

    // 获取所有定时器配置
    getAllConfigs(): Record<string, TimerConfig> {
        const configs: Record<string, TimerConfig> = {};
        this.timers.forEach((timer, key) => {
            configs[key] = { ...timer.config };
        });
        return configs;
    }
}

// 根据 RVPMS.sym 中的定义，只有这些字段有枚举
export enum BMS_HVPowerAllow {
    FORBID_HIGH_VOLTAGE = 0,     // "禁止上高压"
    ALLOW_HIGH_VOLTAGE = 1,      // "允许上高压"  
    REQUEST_POWER_DOWN = 2,      // "请求下高压"
    RESERVED = 3                 // "保留"
}

export enum BMS_HVPowerLoopStatus {
    NOT_CLOSED = 0,  // "高压回路未闭合"
    CLOSED = 1       // "高压回路闭合"
}

export enum BMS_HeatingRequest {
    FORBID_HEATING = 0,  // "禁止加热"
    REQUEST_HEATING = 1  // "请求加热"
}

// 根据 RVPMS.sym 中的枚举定义
export enum BMS_HVRelayStatus {
    RELAY_OPEN = 0,   // "继电器断开"
    RELAY_CLOSED = 1  // "继电器闭合"
}

// 根据 RVPMS.sym 中的枚举定义
export enum VCU_EnableDCAC {
    DISABLE = 0,  // "关机"
    ENABLE = 1    // "开机"
}

export enum VCU_EnablePWM {
    ENABLE_PWM = 0,   // "使能出PWM波"
    DISABLE_PWM = 1   // "禁止出PWM波"
}

export enum DCAC_TaskState {
    SENSORCHECK = 1,  // "SENSORCHECK"
    RUN = 2,          // "RUN"
    ERROR = 3         // "ERROR"
}

export enum DCAC_RELAY1 {
    RELAY1_CLOSE = 0,  // "继电器1关闭"
    RELAY1_OPEN = 1    // "继电器1打开"
}

export enum DCAC_RELAY2 {
    RELAY2_CLOSE = 0,  // "继电器2关闭"
    RELAY2_OPEN = 1    // "继电器2打开"
}

export enum DCAC_OPT1 {
    OPT1_OPEN = 0,   // "光耦1打开"
    OPT1_CLOSE = 1   // "光耦1关闭"
}

export enum DCAC_OPT2 {
    OPT2_OPEN = 0,   // "光耦2打开"
    OPT2_CLOSE = 1   // "光耦2关闭"
}

// ISG/RCU相关枚举
export enum ISG_ChargeEnable {
    DISABLE = 0,  // "禁用充电"
    ENABLE = 1    // "使能充电"
}

export enum ISG_ChgPos_ConState {
    DISCONNECT = 0,  // "断开"
    CONNECT = 1      // "连接"
}

export enum ISG_System_Status {
    POWER_OFF = 0,    // "关闭发电"
    STANDBY = 1,      // "待机状态"
    GENERATING = 2    // "发电运行中"
}

// 根据 RVPMS.sym 中的枚举定义
export enum BMS_FaultLevel {
    NO_FAULT = 0,      // "无故障"
    LEVEL_1 = 1,       // "一级故障"
    LEVEL_2 = 2,       // "二级故障"
    LEVEL_3 = 3        // "三级故障"
}

export enum BMS_FaultStatus {
    NO_FAULT = 0,      // "无故障"
    HAS_FAULT = 1      // "有故障"
}

// BMS状态信息01结构
export class BMS_Status01 {
    hvPowerAllow: BMS_HVPowerAllow;           // BMS所允许高压上下电状态
    hvPowerLoopStatus: BMS_HVPowerLoopStatus; // BMS反馈的高压回路状态
    heatingRequest: BMS_HeatingRequest;       // BMS的加热请求
    coolingRequest: number;                   // BMS反馈的加热回路状态 (无枚举定义，使用数值)
    dcChgStatus: number;                      // DC充电状态 (无枚举定义，使用数值)
    volOutputBMS: number;                     // 电池组输出电压 (V)
    curOutputBMS: number;                     // 电池组输出电流 (A)
    capChg2Full: number;                      // 电池组充满电所需要的电量 (Ah)
    soc: number;                              // 电池组SOC值 (%)
    timestamp: number;                        // 可选的时间戳字段

    toString(): string {
        // 枚举对应的字符串值
        const hvPowerAllowTexts = ["禁止上高压", "允许上高压", "请求下高压", "保留"];
        const hvPowerLoopStatusTexts = ["高压回路未闭合", "高压回路闭合"];
        const heatingRequestTexts = ["禁止加热", "请求加热"];

        return [
            `BMS状态信息01:`,
            `  高压上下电允许状态: ${hvPowerAllowTexts[this.hvPowerAllow] || '未知'}`,
            `  高压回路状态: ${hvPowerLoopStatusTexts[this.hvPowerLoopStatus] || '未知'}`,
            `  加热请求: ${heatingRequestTexts[this.heatingRequest] || '未知'}`,
            `  冷却请求: ${this.coolingRequest}`,
            `  DC充电状态: ${this.dcChgStatus}`,
            `  电池组输出电压: ${this.volOutputBMS.toFixed(1)} V`,
            `  电池组输出电流: ${this.curOutputBMS.toFixed(1)} A`,
            `  充满电所需电量: ${this.capChg2Full.toFixed(1)} Ah`,
            `  电池组SOC: ${this.soc}%`,
            `  时间戳: ${new Date(this.timestamp).toISOString()}`
        ].join('\n');
    }
}

// BMS状态信息02结构
export class BMS_Status02 {
    insResPos: number;                      // 正极绝缘电阻值 (kΩ)
    insResNeg: number;                      // 负极绝缘电阻值 (kΩ)
    posRelayStatus: BMS_HVRelayStatus;      // 正极继电器状态
    negRelayStatus: BMS_HVRelayStatus;      // 负极继电器状态
    prechgRelayStatus: BMS_HVRelayStatus;   // 预充继电器状态
    dcChgRelayStatus: number;               // DC充电继电器状态 (无枚举定义)
    heatingRelayStatus: number;             // 加热继电器状态 (无枚举定义)
    batteryChargingStatus: number;          // 电池充电状态
    socMinCanUse: number;                   // 最小可用SOC (%)
    soh: number;                            // 电池健康度 (%)
    timestamp: number;                      // 时间戳

    toString(): string {
        const relayStatusTexts = ["继电器断开", "继电器闭合"];
        const chargingStatusMap: { [key: number]: string } = {
            0: '未充电',
            1: 'AC充电中',
            2: 'DC充电中',
            3: '充电完成',
            4: '充电异常'
        };

        return [
            `BMS状态信息02:`,
            `  正极绝缘电阻值: ${this.insResPos.toFixed(0)} kΩ`,
            `  负极绝缘电阻值: ${this.insResNeg.toFixed(0)} kΩ`,
            `  正极继电器状态: ${relayStatusTexts[this.posRelayStatus] || '未知'}`,
            `  负极继电器状态: ${relayStatusTexts[this.negRelayStatus] || '未知'}`,
            `  预充继电器状态: ${relayStatusTexts[this.prechgRelayStatus] || '未知'}`,
            `  DC充电继电器状态: ${this.dcChgRelayStatus}`,
            `  加热继电器状态: ${this.heatingRelayStatus}`,
            `  电池充电状态: ${chargingStatusMap[this.batteryChargingStatus] || `未知状态(${this.batteryChargingStatus})`}`,
            `  最小可用SOC: ${this.socMinCanUse}%`,
            `  电池健康度(SOH): ${this.soh}%`,
            `  时间戳: ${new Date(this.timestamp).toISOString()}`
        ].join('\n');
    }
}

// BMS故障信息结构
export class BMS_FaultInfo {
    faultLevel: BMS_FaultLevel;               // 故障等级
    socLessThan20: BMS_FaultStatus;          // SOC小于20%
    dischgCurGreaterL2: BMS_FaultStatus;     // 放电电流大二级故障
    cellVolDiffGreaterL1: BMS_FaultStatus;   // 单体压差大一级故障
    tempDiffGreaterL1: BMS_FaultStatus;      // 温差大一级故障
    insResLessThan800: BMS_FaultStatus;      // 绝缘电阻小于800kΩ
    tempGreaterL2: BMS_FaultStatus;          // 温度大二级故障
    tempLessL3: BMS_FaultStatus;             // 温度小三级故障
    cellVolGreaterL1: BMS_FaultStatus;       // 单体电压大一级故障
    cellVolLessL1: BMS_FaultStatus;          // 单体电压小一级故障
    dischgCurGreaterL3: BMS_FaultStatus;     // 放电电流大三级故障
    socLessThan10: BMS_FaultStatus;          // SOC小于10%
    cellVolDiffGreaterL2: BMS_FaultStatus;   // 单体压差大二级故障
    tempDiffGreaterL2: BMS_FaultStatus;      // 温差大二级故障
    insResLessThan500: BMS_FaultStatus;      // 绝缘电阻小于500kΩ
    tempGreaterL3: BMS_FaultStatus;          // 温度大三级故障
    volGreaterL3: BMS_FaultStatus;           // 电压大三级故障
    volLessL3: BMS_FaultStatus;              // 电压小三级故障
    dischgCurGreaterL1: BMS_FaultStatus;     // 放电电流大一级故障
    cellVolGreaterL2: BMS_FaultStatus;       // 单体电压大二级故障
    cellVolLessL2: BMS_FaultStatus;          // 单体电压小二级故障
    insResLessThan100: BMS_FaultStatus;      // 绝缘电阻小于100kΩ
    cellVolDiffGreaterL3: BMS_FaultStatus;   // 单体压差大三级故障
    tempSensorFault: BMS_FaultStatus;        // 温度传感器故障
    volSensorFault: BMS_FaultStatus;         // 电压传感器故障
    innerCANFault: BMS_FaultStatus;          // 内部CAN故障
    cellVolGreaterL3: BMS_FaultStatus;       // 单体电压大三级故障
    cellVolLessL3: BMS_FaultStatus;          // 单体电压小三级故障
    socStepChange: BMS_FaultStatus;          // SOC阶跃变化
    socGreaterL3: BMS_FaultStatus;           // SOC大三级故障
    chgCurGreaterL2: BMS_FaultStatus;        // 充电电流大二级故障
    chgCurGreaterL3: BMS_FaultStatus;        // 充电电流大三级故障
    canComFault: BMS_FaultStatus;            // CAN通信故障
    mainRelayCutoffFault: BMS_FaultStatus;   // 主继电器粘连三级故障
    mainLoopBreakFault: BMS_FaultStatus;     // 主回路断路
    fstchgPortTempGreaterL3: BMS_FaultStatus; // 直流充电座高温三级故障
    prechgFailFault: BMS_FaultStatus;        // 预充失败
    heatingRelayCutoffFault: BMS_FaultStatus; // 加热继电器粘连故障
    prechgRelayFault: BMS_FaultStatus;       // 预充继电器故障
    mainNegRelayCutoffFault: BMS_FaultStatus; // 主负继电器粘连
    fstchgRelayCutoffFault: BMS_FaultStatus; // 快充继电器粘连
    dcChargerFault: number;                  // DC充电器故障 (无枚举定义)
    dcanComFault: number;                    // DCAN通信故障 (无枚举定义)
    dcReceptacleHighTemp: number;            // DC插座高温 (无枚举定义)
    dcReceptacleOverTemp: number;            // DC插座过温 (无枚举定义)
    timestamp: number;                       // 时间戳

    toString(): string {
        const faultLevelTexts = ["无故障", "一级故障", "二级故障", "三级故障"];
        const faultStatusTexts = ["无故障", "有故障"];

        const activeFaults: string[] = [];
        
        // 检查所有故障状态并列出激活的故障
        if (this.socLessThan20 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("SOC小于20%");
        if (this.dischgCurGreaterL2 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("放电电流大二级故障");
        if (this.cellVolDiffGreaterL1 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("单体压差大一级故障");
        if (this.tempDiffGreaterL1 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("温差大一级故障");
        if (this.insResLessThan800 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("绝缘电阻小于800kΩ");
        if (this.tempGreaterL2 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("温度大二级故障");
        if (this.tempLessL3 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("温度小三级故障");
        if (this.cellVolGreaterL1 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("单体电压大一级故障");
        if (this.cellVolLessL1 === BMS_FaultStatus.HAS_FAULT) activeFaults.push("单体电压小一级故障");
        if (this.canComFault === BMS_FaultStatus.HAS_FAULT) activeFaults.push("CAN通信故障");
        if (this.mainRelayCutoffFault === BMS_FaultStatus.HAS_FAULT) activeFaults.push("主继电器粘连故障");
        if (this.mainLoopBreakFault === BMS_FaultStatus.HAS_FAULT) activeFaults.push("主回路断路");
        if (this.prechgFailFault === BMS_FaultStatus.HAS_FAULT) activeFaults.push("预充失败");

        return [
            `BMS故障信息:`,
            `  故障等级: ${faultLevelTexts[this.faultLevel] || '未知'}`,
            `  激活故障: ${activeFaults.length > 0 ? activeFaults.join(', ') : '无'}`,
            `  DC充电器故障: ${this.dcChargerFault}`,
            `  DCAN通信故障: ${this.dcanComFault}`,
            `  DC插座高温: ${this.dcReceptacleHighTemp}`,
            `  DC插座过温: ${this.dcReceptacleOverTemp}`,
            `  时间戳: ${new Date(this.timestamp).toISOString()}`
        ].join('\n');
    }
}

// DCAC命令结构
export class DCAC_COMMAND {
    enableDCAC: VCU_EnableDCAC;          // VCU使能或禁能DCAC工作输出交流电
    enablePWM: VCU_EnablePWM;            // PWM使能
    timestamp: number;                   // 时间戳

    toString(): string {
        const enableDCACTexts = ["关机", "开机"];
        const enablePWMTexts = ["使能出PWM波", "禁止出PWM波"];

        return [
            `DCAC命令:`,
            `  DCAC使能状态: ${enableDCACTexts[this.enableDCAC] || '未知'}`,
            `  PWM使能状态: ${enablePWMTexts[this.enablePWM] || '未知'}`,
            `  时间戳: ${new Date(this.timestamp).toISOString()}`
        ].join('\n');
    }
}

// DCAC状态结构
export class DCAC_Status {
    sysStatus: DCAC_TaskState;           // 系统状态
    handSwitch: number;                  // 手动开关(KEY_BACK) 0接通，1断开
    tempModule: number;                  // 模块温度 (℃)
    tempCapOBG: number;                  // 电容温度OBG (℃)
    tempCapOBS: number;                  // 电容温度OBS (℃)
    relay1: DCAC_RELAY1;                 // 继电器1状态
    relay2: DCAC_RELAY2;                 // 继电器2状态
    opt1: DCAC_OPT1;                     // 光耦1状态
    opt2: DCAC_OPT2;                     // 光耦2状态
    timestamp: number;                   // 时间戳

    toString(): string {
        const sysStatusTexts = ["", "SENSORCHECK", "RUN", "ERROR"];
        const relay1Texts = ["继电器1关闭", "继电器1打开"];
        const relay2Texts = ["继电器2关闭", "继电器2打开"];
        const opt1Texts = ["光耦1打开", "光耦1关闭"];
        const opt2Texts = ["光耦2打开", "光耦2关闭"];

        return [
            `DCAC状态:`,
            `  系统状态: ${sysStatusTexts[this.sysStatus] || '未知'}`,
            `  手动开关(KEY_BACK): ${this.handSwitch ? '断开' : '接通'}`,
            `  模块温度: ${this.tempModule} ℃`,
            `  电容温度OBG: ${this.tempCapOBG} ℃`,
            `  电容温度OBS: ${this.tempCapOBS} ℃`,
            `  继电器1状态: ${relay1Texts[this.relay1] || '未知'}`,
            `  继电器2状态: ${relay2Texts[this.relay2] || '未知'}`,
            `  光耦1状态: ${opt1Texts[this.opt1] || '未知'}`,
            `  光耦2状态: ${opt2Texts[this.opt2] || '未知'}`,
            `  时间戳: ${new Date(this.timestamp).toISOString()}`
        ].join('\n');
    }
}

// ISG命令结构
export class ISG_COMMAND {
    isgChargeEnable: ISG_ChargeEnable;     // ISG充电使能
    chgPosConState: ISG_ChgPos_ConState;   // 充电位置连接状态
    liftTime: number;                      // 生命信号
    timestamp: number;                     // 时间戳

    toString(): string {
        const chargeEnableTexts = ["禁用充电", "使能充电"];
        const conStateTexts = ["断开", "连接"];

        return [
            `ISG命令:`,
            `  ISG充电使能: ${chargeEnableTexts[this.isgChargeEnable] || '未知'}`,
            `  充电位置连接状态: ${conStateTexts[this.chgPosConState] || '未知'}`,
            `  生命信号: ${this.liftTime}`,
            `  时间戳: ${new Date(this.timestamp).toISOString()}`
        ].join('\n');
    }
}

// RCU状态01结构
export class RCU_Status01 {
    isgTor: number;                        // ISG发电机实际转矩 (N.m, 精度0.1)
    isgSpeed: number;                      // ISG发电机实时转速 (Rpm)
    isgCurOutput: number;                  // 直流母线输出电流 (A, 精度0.1)
    faultInfo: number;                     // 故障码 (0~255)
    systemStatus: ISG_System_Status;       // 发电状态
    liftTime: number;                      // 控制报文生命信号 (0~15)
    timestamp: number;                     // 时间戳

    toString(): string {
        const systemStatusTexts = ["关闭发电", "待机状态", "发电运行中"];

        return [
            `RCU状态01:`,
            `  ISG发电机实际转矩: ${this.isgTor.toFixed(1)} N.m`,
            `  ISG发电机实时转速: ${this.isgSpeed} Rpm`,
            `  直流母线输出电流: ${this.isgCurOutput.toFixed(1)} A`,
            `  故障码: ${this.faultInfo}`,
            `  发电状态: ${systemStatusTexts[this.systemStatus] || '未知'}`,
            `  生命信号: ${this.liftTime}`,
            `  时间戳: ${new Date(this.timestamp).toISOString()}`
        ].join('\n');
    }
}

// 所有原始CAN报文的最新实例集合
export interface PMS_RawCanFrames {
    // BMS相关报文
    BMS_Status01?: BMS_Status01;           // 0x1801EFF4 - BMS状态信息01
    BMS_Status02?: BMS_Status02;           // 0x1804EFF4 - BMS状态信息02
    BMS_FaultInfo?: BMS_FaultInfo;         // 0x1808EFF4 - BMS故障信息
    BMS_NorminalInfo?: any;                // 0x1807EFF4 - 电池标称值
    BMS_TempInfo?: any;                    // 0x1805EFF4 - BMS温度信息
    BMS_CellInfo?: any;                    // 0x1802EFF4 - 电池单体信息
    BMS_Version?: any;                     // 0x1806EFF4 - 快充充电信息
    BMS_CurInfo?: any;                     // 0x1803EFF4 - 电池允许的充放电电流

    // VCU相关报文
    VCU_Status01?: any;                    // 0x04840000 - VCU状态01
    VCU_Status02?: any;                    // 0x04C40000 - VCU状态02
    VCU_Status03?: any;                    // 0x05040000 - VCU状态03
    VCU_Status04?: any;                    // 0x05440000 - VCU状态04
    VCU_Status05?: any;                    // 0x05840000 - VCU状态05
    VCU_Status06?: any;                    // 0x05C40000 - VCU状态06

    // DCDC相关报文
    DCDC_Status?: any;                     // 0x1828272B - DCDC状态参数

    // DCAC相关报文
    DCAC_COMMAND?: DCAC_COMMAND;           // 0x04080000 - DCAC命令
    DCAC_Status?: DCAC_Status;             // 0x04C80000 - DCAC状态
    DCAC_VAR?: any;                        // 0x04880000 - DCAC变量
    DCAC_Ver?: any;                        // 0x05080000 - DCAC版本信息

    // OBC相关报文
    OBC_Status01?: any;                    // 0x18FF50E5 - OBC状态01
    OBC_Status02?: any;                    // 0x18FF50E6 - OBC状态02
    OBC_Status03?: any;                    // 0x18FF50E7 - OBC状态03

    // ISG相关报文
    ISG_COMMAND?: ISG_COMMAND;             // 0x0CFF8B32 - ISG命令
    
    // RCU相关报文
    RCU_Status01?: RCU_Status01;           // 0x1601EFF4 - RCU状态01
}

/**BMS_Status VCU_Status 等都是为了更好的可视化，再一次抽象的数据类型*/
export interface BMS {
    soc: number;
    voltage: number;
    current: number;
    temperature: number;
    faultLevel: BMS_FaultLevel;
}

export interface VCU {
    keyOn: boolean;
    pumpEnable: boolean;
    fanEnable: boolean;
    faultCode: number;
}

export interface DCAC {
    enableDCAC: VCU_EnableDCAC;
    systemStatus: number;
    tempModule: number;
    relay1: DCAC_RELAY1;
    relay2: DCAC_RELAY2;
}

export interface DCDC {
    runStatus: number;
    systemStatus: number;
    tempModule: number;
    volOutput: number;
    curOutput: number;
}

export interface OBC {
    systemStatus: number;
    volOutput: number;
    curOutput: number;
    tempModule: number;
    faultStatus: number;
}

export interface ISG {
    chargeEnable: ISG_ChargeEnable;
    systemStatus: ISG_System_Status;
    torque: number;
    speed: number;
    current: number;
    faultInfo: number;
}

// 汇总的状态信息
export interface PMS_Status {
    bms: BMS;
    vcu: VCU;
    dcac: DCAC;
    dcdc: DCDC;
    obc: OBC;
    isg: ISG;
    timestamp: number;
}

@Injectable()
export class BatteryService {
    
    // Winston logger for general battery service logs
    private batteryLogger: winston.Logger;
    private logger;// = new Logger(BatteryService.name);
    
    // Dedicated logger for BMS fault information
    private bmsFaultLogger: winston.Logger;

    // 定时器管理器
    private timerManager: TimerManager;

    // 原始CAN报文最新实例
    private readonly rawCanFrames: PMS_RawCanFrames = {};

    // 汇总状态信息
    private readonly pmsStatus: PMS_Status = {
        bms: { soc: 0, voltage: 0, current: 0, temperature: 0, faultLevel: BMS_FaultLevel.NO_FAULT },
        vcu: { keyOn: false, pumpEnable: false, fanEnable: false, faultCode: 0 },
        dcac: { systemStatus: 0, tempModule: 0, relay1: 0, relay2: 0, enableDCAC: VCU_EnableDCAC.DISABLE },
        dcdc: { runStatus: 0, systemStatus: 0, tempModule: 0, volOutput: 0, curOutput: 0 },
        obc: { systemStatus: 0, volOutput: 0, curOutput: 0, tempModule: 0, faultStatus: 0 },
        isg: { chargeEnable: ISG_ChargeEnable.DISABLE, systemStatus: ISG_System_Status.POWER_OFF, torque: 0, speed: 0, current: 0, faultInfo: 0 },
        timestamp: Date.now()
    };

    constructor(
        private readonly canReceiverService: CanReceiverService,
    ) {
        // 初始化Winston logger
        this.initializeLoggers();
        
        // 初始化定时器管理器
        this.initializeTimerManager();
        
        this.registerPmsMatcher(0x1801EFF4, this.parseBMS_Status01.bind(this));
        this.registerPmsMatcher(0x1804EFF4, this.parseBMS_Status02.bind(this));
        this.registerPmsMatcher(0x1808EFF4, this.parseBMS_FaultInfo.bind(this));
        this.registerPmsMatcher(0x04080000, this.parseDCACCommand.bind(this));
        this.registerPmsMatcher(0x04C80000, this.parseDCACStatus.bind(this));
        this.registerPmsMatcher(0x0CFF8B32, this.parseISGCommand.bind(this));
        this.registerPmsMatcher(0x1601EFF4, this.parseRCUStatus01.bind(this));
    }

    private initializeLoggers() {
        // 创建日志目录
        const logDir = path.join(process.cwd(), 'logs');
        
        // 通用Battery服务日志配置
        this.batteryLogger = winston.createLogger({
            level: 'debug',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss.SSS'
                }),
                winston.format.errors({ stack: true }),
                winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                    const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta, null, 2) : '';
                    return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}${stack ? '\n' + stack : ''}`;
                })
            ),
            transports: [
                // 控制台输出
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.printf(({ timestamp, level, message, ...meta }) => {
                            const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
                            return `${level}: ${message}${metaStr}`;
                        })
                    )
                }),
                // 所有级别日志文件
                new winston.transports.File({
                    filename: path.join(logDir, 'battery-service.log'),
                    maxsize: 10485760, // 10MB
                    maxFiles: 5
                }),
                // 错误级别日志文件
                new winston.transports.File({
                    filename: path.join(logDir, 'battery-error.log'),
                    level: 'error',
                    maxsize: 10485760, // 10MB
                    maxFiles: 5
                })
            ]
        });

        this.logger = this.batteryLogger;

        // BMS故障专用日志配置
        this.bmsFaultLogger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss.SSS'
                }),
                winston.format.errors({ stack: true }),
                winston.format.json() // 使用JSON格式便于后续分析
            ),
            transports: [
                // BMS故障专用日志文件
                new winston.transports.File({
                    filename: path.join(logDir, 'bms-faults.log'),
                    maxsize: 20971520, // 20MB
                    maxFiles: 10 // 保留更多文件用于故障回溯
                }),
                // 严重故障单独记录
                new winston.transports.File({
                    filename: path.join(logDir, 'bms-critical-faults.log'),
                    level: 'error',
                    maxsize: 10485760, // 10MB
                    maxFiles: 20 // 长期保存严重故障记录
                })
            ]
        });

        this.batteryLogger.info('Battery Service logger initialized');
        this.bmsFaultLogger.info('BMS Fault logger initialized');
    }

    private initializeTimerManager() {
        // 定义默认的定时器配置
        const defaultTimerConfigs: Record<string, TimerConfig> = {
            'BMS_Status01': { interval: 60000, enabled: true },     // 每分钟采样一次
            'BMS_Status02': { interval: 60000, enabled: true },     // 每分钟采样一次
            'BMS_FaultInfo_Normal': { interval: 600000, enabled: true }, // 正常状态每10分钟采样一次
            'DCAC_Command': { interval: 30000, enabled: true },     // 每30秒采样一次
            'DCAC_Status': { interval: 30000, enabled: true },      // 每30秒采样一次
            'ISG_Command': { interval: 30000, enabled: true },      // 每30秒采样一次
            'RCU_Status01': { interval: 30000, enabled: true },     // 每30秒采样一次
        };

        this.timerManager = new TimerManager(defaultTimerConfigs);
        this.logger.info('定时器管理器初始化完成', this.timerManager.getAllConfigs());
    }

    // 获取定时器配置（供外部调用）
    getTimerConfigs(): Record<string, TimerConfig> {
        return this.timerManager.getAllConfigs();
    }

    // 更新定时器配置（供外部调用）
    updateTimerConfig(timerKey: string, config: Partial<TimerConfig>) {
        this.timerManager.updateConfig(timerKey, config);
        this.logger.info(`定时器配置已更新: ${timerKey}`, this.timerManager.getConfig(timerKey));
    }

    // 获取原始CAN报文数据
    getRawCanFrames(): PMS_RawCanFrames {
        return { ...this.rawCanFrames };
    }

    // 获取汇总状态信息
    getPMSStatus(): PMS_Status {
        return { ...this.pmsStatus };
    }

    private registerPmsMatcher(canId: number, callback: (frame: CanFrame) => void) {
        this.canReceiverService.registerMatcher(
            (frame: CanFrame) => frame.id === canId, callback)
    }

    private parseBMS_Status01(frame: CanFrame) {
        if (frame.data.length < 8) {
            this.logger.error('0x1801EFF4报文数据长度不足，需要8字节');
            return;
        }

        // 解析各个字段
        const hvPowerAllow = (frame.data[0] & 0x03) as BMS_HVPowerAllow;
        const hvPowerLoopStatus = ((frame.data[0] >> 2) & 0x01) as BMS_HVPowerLoopStatus;
        const heatingRequest = ((frame.data[0] >> 3) & 0x01) as BMS_HeatingRequest;
        const coolingRequest = (frame.data[0] >> 4) & 0x01;  // 数值型
        const dcChgStatus = (frame.data[0] >> 5) & 0x01;     // 数值型

        const rawVoltage = (frame.data[1] & 0xFF) | ((frame.data[2] & 0xFF) << 8);
        // const volOutputBMS = rawVoltage * 0.1;
        const volOutputBMS = parseFloat((rawVoltage * 0.1).toFixed(2));

        const rawCurrent = (frame.data[3] & 0xFF) | ((frame.data[4] & 0xFF) << 8);
        const signedCurrent = rawCurrent > 32767 ? rawCurrent - 65536 : rawCurrent;
        // const curOutputBMS = signedCurrent * 0.1 - 600;
        const curOutputBMS = parseFloat((signedCurrent * 0.1 - 600).toFixed(2));
        
        const rawCapacity = (frame.data[5] & 0xFF) | ((frame.data[6] & 0xFF) << 8);
        const capChg2Full = rawCapacity * 0.1;

        const soc = frame.data[7] & 0xFF;

        const bmsStatus01 = new BMS_Status01();
        bmsStatus01.hvPowerAllow = hvPowerAllow;
        bmsStatus01.hvPowerLoopStatus = hvPowerLoopStatus;
        bmsStatus01.heatingRequest = heatingRequest;
        bmsStatus01.coolingRequest = coolingRequest;
        bmsStatus01.dcChgStatus = dcChgStatus;
        bmsStatus01.volOutputBMS = volOutputBMS;
        bmsStatus01.curOutputBMS = curOutputBMS;
        bmsStatus01.capChg2Full = capChg2Full;
        bmsStatus01.soc = soc;
        bmsStatus01.timestamp = Date.now();

        // 更新原始报文实例
        this.rawCanFrames.BMS_Status01 = bmsStatus01;

        // 更新汇总状态
        this.pmsStatus.bms.soc = soc;
        this.pmsStatus.bms.voltage = volOutputBMS;
        this.pmsStatus.bms.current = curOutputBMS;
        this.pmsStatus.timestamp = Date.now();

        // 定时器控制的采样记录
        if (this.timerManager.shouldSample('BMS_Status01')) {
            this.logger.debug(`BMS状态采样: SOC=${soc}%, 电压=${volOutputBMS.toFixed(1)}V, 电流=${curOutputBMS.toFixed(1)}A`);
        }

        return bmsStatus01;
    }

    private parseBMS_Status02(frame: CanFrame) {
        if (frame.data.length < 8) {
            this.logger.error('0x1804EFF4报文数据长度不足，需要8字节');
            return;
        }

        // Var=InsResPos unsigned 0,16 /u:kΩ /f:10 - 正极绝缘电阻值 (字节0-1, 小端序)
        const rawInsResPos = (frame.data[0] & 0xFF) | ((frame.data[1] & 0xFF) << 8);
        const insResPos = rawInsResPos * 10;

        // Var=InsResNeg unsigned 16,16 /u:kΩ /f:10 - 负极绝缘电阻值 (字节2-3, 小端序)
        const rawInsResNeg = (frame.data[2] & 0xFF) | ((frame.data[3] & 0xFF) << 8);
        const insResNeg = rawInsResNeg * 10;

        // 字节4包含多个继电器状态位
        const byte4 = frame.data[4];
        const posRelayStatus = (byte4 & 0x01) as BMS_HVRelayStatus;
        const negRelayStatus = ((byte4 >> 1) & 0x01) as BMS_HVRelayStatus;
        const prechgRelayStatus = ((byte4 >> 2) & 0x01) as BMS_HVRelayStatus;
        const dcChgRelayStatus = (byte4 >> 3) & 0x01;
        const heatingRelayStatus = (byte4 >> 4) & 0x01;

        // Var=BatteryChargingStatus unsigned 40,8 - 电池充电状态 (字节5)
        const batteryChargingStatus = frame.data[5] & 0xFF;

        // Var=SOCMinCanUse unsigned 48,8 /u:% - 最小可用SOC (字节6)
        const socMinCanUse = frame.data[6] & 0xFF;

        // Var=SOH unsigned 56,8 /u:% - 电池健康度 (字节7)
        const soh = frame.data[7] & 0xFF;

        const bmsStatus02 = new BMS_Status02();
        bmsStatus02.insResPos = insResPos;
        bmsStatus02.insResNeg = insResNeg;
        bmsStatus02.posRelayStatus = posRelayStatus;
        bmsStatus02.negRelayStatus = negRelayStatus;
        bmsStatus02.prechgRelayStatus = prechgRelayStatus;
        bmsStatus02.dcChgRelayStatus = dcChgRelayStatus;
        bmsStatus02.heatingRelayStatus = heatingRelayStatus;
        bmsStatus02.batteryChargingStatus = batteryChargingStatus;
        bmsStatus02.socMinCanUse = socMinCanUse;
        bmsStatus02.soh = soh;
        bmsStatus02.timestamp = Date.now();

        // 更新原始报文实例
        this.rawCanFrames.BMS_Status02 = bmsStatus02;

        // 更新汇总状态
        this.pmsStatus.timestamp = Date.now();

        // 定时器控制的采样记录
        if (this.timerManager.shouldSample('BMS_Status02')) {
            this.logger.debug(`BMS状态02采样: 正极绝缘=${insResPos}kΩ, 负极绝缘=${insResNeg}kΩ, SOH=${soh}%`);
        }

        return bmsStatus02;
    }

    private parseBMS_FaultInfo(frame: CanFrame) {
        if (frame.data.length < 8) {
            const errorMsg = '0x1808EFF4报文数据长度不足，需要8字节';
            this.logger.error(errorMsg);
            this.batteryLogger.error(errorMsg, { 
                frameId: frame.id.toString(16),
                dataLength: frame.data.length,
                rawData: Buffer.from(frame.data).toString('hex')
            });
            return;
        }

        // this.logger.debug(`接收到BMS故障信息报文: ${frame.id.toString(16).toUpperCase()}`);
        // this.batteryLogger.debug('接收到BMS故障信息报文', {
        //     frameId: frame.id.toString(16).toUpperCase(),
        //     rawData: Buffer.from(frame.data).toString('hex')
        // });

        // Var=FaultLevel unsigned 0,4 - 故障等级 (字节0位0-3)
        const faultLevel = (frame.data[0] & 0x0F) as BMS_FaultLevel;

        // 解析各个故障状态位 (字节1)
        const byte1 = frame.data[1];
        const socLessThan20 = (byte1 & 0x01) as BMS_FaultStatus;
        const dischgCurGreaterL2 = ((byte1 >> 1) & 0x01) as BMS_FaultStatus;
        const cellVolDiffGreaterL1 = ((byte1 >> 2) & 0x01) as BMS_FaultStatus;
        const tempDiffGreaterL1 = ((byte1 >> 3) & 0x01) as BMS_FaultStatus;
        const insResLessThan800 = ((byte1 >> 4) & 0x01) as BMS_FaultStatus;
        const tempGreaterL2 = ((byte1 >> 5) & 0x01) as BMS_FaultStatus;
        const tempLessL3 = ((byte1 >> 6) & 0x01) as BMS_FaultStatus;
        const cellVolGreaterL1 = ((byte1 >> 7) & 0x01) as BMS_FaultStatus;

        // 解析字节2故障状态位
        const byte2 = frame.data[2];
        const cellVolLessL1 = (byte2 & 0x01) as BMS_FaultStatus;
        const dischgCurGreaterL3 = ((byte2 >> 1) & 0x01) as BMS_FaultStatus;
        const socLessThan10 = ((byte2 >> 2) & 0x01) as BMS_FaultStatus;
        const cellVolDiffGreaterL2 = ((byte2 >> 3) & 0x01) as BMS_FaultStatus;
        const tempDiffGreaterL2 = ((byte2 >> 4) & 0x01) as BMS_FaultStatus;
        const insResLessThan500 = ((byte2 >> 5) & 0x01) as BMS_FaultStatus;
        const tempGreaterL3 = ((byte2 >> 6) & 0x01) as BMS_FaultStatus;
        const volGreaterL3 = ((byte2 >> 7) & 0x01) as BMS_FaultStatus;

        // 解析字节3故障状态位
        const byte3 = frame.data[3];
        const volLessL3 = (byte3 & 0x01) as BMS_FaultStatus;
        const dischgCurGreaterL1 = ((byte3 >> 1) & 0x01) as BMS_FaultStatus;
        const cellVolGreaterL2 = ((byte3 >> 2) & 0x01) as BMS_FaultStatus;
        const cellVolLessL2 = ((byte3 >> 3) & 0x01) as BMS_FaultStatus;
        const insResLessThan100 = ((byte3 >> 4) & 0x01) as BMS_FaultStatus;
        const cellVolDiffGreaterL3 = ((byte3 >> 5) & 0x01) as BMS_FaultStatus;
        const tempSensorFault = ((byte3 >> 6) & 0x01) as BMS_FaultStatus;
        const volSensorFault = ((byte3 >> 7) & 0x01) as BMS_FaultStatus;

        // 解析字节4故障状态位
        const byte4 = frame.data[4];
        const innerCANFault = (byte4 & 0x01) as BMS_FaultStatus;
        const cellVolGreaterL3 = ((byte4 >> 1) & 0x01) as BMS_FaultStatus;
        const cellVolLessL3 = ((byte4 >> 2) & 0x01) as BMS_FaultStatus;
        const socStepChange = ((byte4 >> 3) & 0x01) as BMS_FaultStatus;
        const socGreaterL3 = ((byte4 >> 4) & 0x01) as BMS_FaultStatus;
        const chgCurGreaterL2 = ((byte4 >> 5) & 0x01) as BMS_FaultStatus;
        const chgCurGreaterL3 = ((byte4 >> 6) & 0x01) as BMS_FaultStatus;
        const canComFault = ((byte4 >> 7) & 0x01) as BMS_FaultStatus;

        // 解析字节5故障状态位
        const byte5 = frame.data[5];
        const mainRelayCutoffFault = (byte5 & 0x01) as BMS_FaultStatus;
        const mainLoopBreakFault = ((byte5 >> 1) & 0x01) as BMS_FaultStatus;
        const fstchgPortTempGreaterL3 = ((byte5 >> 2) & 0x01) as BMS_FaultStatus;
        const prechgFailFault = ((byte5 >> 3) & 0x01) as BMS_FaultStatus;
        const heatingRelayCutoffFault = ((byte5 >> 4) & 0x01) as BMS_FaultStatus;
        const prechgRelayFault = ((byte5 >> 5) & 0x01) as BMS_FaultStatus;
        const mainNegRelayCutoffFault = ((byte5 >> 6) & 0x01) as BMS_FaultStatus;
        const fstchgRelayCutoffFault = ((byte5 >> 7) & 0x01) as BMS_FaultStatus;

        // 解析字节6故障状态位 (无枚举定义，使用原始数值)
        const byte6 = frame.data[6];
        const dcChargerFault = byte6 & 0x01;
        const dcanComFault = (byte6 >> 1) & 0x01;
        const dcReceptacleHighTemp = (byte6 >> 2) & 0x01;
        const dcReceptacleOverTemp = (byte6 >> 3) & 0x01;

        const bmsFaultInfo = new BMS_FaultInfo();
        bmsFaultInfo.faultLevel = faultLevel;
        bmsFaultInfo.socLessThan20 = socLessThan20;
        bmsFaultInfo.dischgCurGreaterL2 = dischgCurGreaterL2;
        bmsFaultInfo.cellVolDiffGreaterL1 = cellVolDiffGreaterL1;
        bmsFaultInfo.tempDiffGreaterL1 = tempDiffGreaterL1;
        bmsFaultInfo.insResLessThan800 = insResLessThan800;
        bmsFaultInfo.tempGreaterL2 = tempGreaterL2;
        bmsFaultInfo.tempLessL3 = tempLessL3;
        bmsFaultInfo.cellVolGreaterL1 = cellVolGreaterL1;
        bmsFaultInfo.cellVolLessL1 = cellVolLessL1;
        bmsFaultInfo.dischgCurGreaterL3 = dischgCurGreaterL3;
        bmsFaultInfo.socLessThan10 = socLessThan10;
        bmsFaultInfo.cellVolDiffGreaterL2 = cellVolDiffGreaterL2;
        bmsFaultInfo.tempDiffGreaterL2 = tempDiffGreaterL2;
        bmsFaultInfo.insResLessThan500 = insResLessThan500;
        bmsFaultInfo.tempGreaterL3 = tempGreaterL3;
        bmsFaultInfo.volGreaterL3 = volGreaterL3;
        bmsFaultInfo.volLessL3 = volLessL3;
        bmsFaultInfo.dischgCurGreaterL1 = dischgCurGreaterL1;
        bmsFaultInfo.cellVolGreaterL2 = cellVolGreaterL2;
        bmsFaultInfo.cellVolLessL2 = cellVolLessL2;
        bmsFaultInfo.insResLessThan100 = insResLessThan100;
        bmsFaultInfo.cellVolDiffGreaterL3 = cellVolDiffGreaterL3;
        bmsFaultInfo.tempSensorFault = tempSensorFault;
        bmsFaultInfo.volSensorFault = volSensorFault;
        bmsFaultInfo.innerCANFault = innerCANFault;
        bmsFaultInfo.cellVolGreaterL3 = cellVolGreaterL3;
        bmsFaultInfo.cellVolLessL3 = cellVolLessL3;
        bmsFaultInfo.socStepChange = socStepChange;
        bmsFaultInfo.socGreaterL3 = socGreaterL3;
        bmsFaultInfo.chgCurGreaterL2 = chgCurGreaterL2;
        bmsFaultInfo.chgCurGreaterL3 = chgCurGreaterL3;
        bmsFaultInfo.canComFault = canComFault;
        bmsFaultInfo.mainRelayCutoffFault = mainRelayCutoffFault;
        bmsFaultInfo.mainLoopBreakFault = mainLoopBreakFault;
        bmsFaultInfo.fstchgPortTempGreaterL3 = fstchgPortTempGreaterL3;
        bmsFaultInfo.prechgFailFault = prechgFailFault;
        bmsFaultInfo.heatingRelayCutoffFault = heatingRelayCutoffFault;
        bmsFaultInfo.prechgRelayFault = prechgRelayFault;
        bmsFaultInfo.mainNegRelayCutoffFault = mainNegRelayCutoffFault;
        bmsFaultInfo.fstchgRelayCutoffFault = fstchgRelayCutoffFault;
        bmsFaultInfo.dcChargerFault = dcChargerFault;
        bmsFaultInfo.dcanComFault = dcanComFault;
        bmsFaultInfo.dcReceptacleHighTemp = dcReceptacleHighTemp;
        bmsFaultInfo.dcReceptacleOverTemp = dcReceptacleOverTemp;
        bmsFaultInfo.timestamp = Date.now();

        // 特殊处理：检查是否存在故障并记录到专用日志
        this.logBMSFaultIfExists(bmsFaultInfo, frame);

        // 更新原始报文实例
        this.rawCanFrames.BMS_FaultInfo = bmsFaultInfo;

        // 更新汇总状态 - faultLevel 对应 VCU 的 faultCode
        this.pmsStatus.bms.faultLevel = faultLevel;
        this.pmsStatus.timestamp = Date.now();

        // 只在故障状态变化时记录，或者定时器控制的采样记录
        if (faultLevel > BMS_FaultLevel.NO_FAULT) {
            this.logger.debug(`BMS故障信息: 故障等级=${faultLevel}, CAN通信故障=${canComFault}`);
            this.batteryLogger.info('BMS故障信息更新', {
                faultLevel,
                canComFault,
                mainRelayCutoffFault,
                mainLoopBreakFault,
                prechgFailFault
            });
        }

        return bmsFaultInfo;
    }

    /**
     * 检查BMS故障信息并记录到专用日志文件
     */
    private logBMSFaultIfExists(faultInfo: BMS_FaultInfo, originalFrame: CanFrame) {
        const activeFaults: string[] = [];
        const faultDetails: any = {
            timestamp: new Date(faultInfo.timestamp).toISOString(),
            frameId: originalFrame.id.toString(16).toUpperCase(),
            rawData: Buffer.from(originalFrame.data).toString('hex'),
            faultLevel: faultInfo.faultLevel,
            faultLevelText: ["无故障", "一级故障", "二级故障", "三级故障"][faultInfo.faultLevel] || '未知',
            activeFaults: [],
            systemContext: {
                bmsVoltage: this.pmsStatus.bms.voltage,
                bmsCurrent: this.pmsStatus.bms.current,
                bmsSOC: this.pmsStatus.bms.soc,
                vcuKeyOn: this.pmsStatus.vcu.keyOn
            }
        };

        // 检查所有故障状态并收集激活的故障
        if (faultInfo.socLessThan20 === BMS_FaultStatus.HAS_FAULT) {
            // activeFaults.push("SOC小于20%");
        }
        if (faultInfo.dischgCurGreaterL2 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("放电电流大二级故障");
        }
        if (faultInfo.cellVolDiffGreaterL1 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("单体压差大一级故障");
        }
        if (faultInfo.tempDiffGreaterL1 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("温差大一级故障");
        }
        if (faultInfo.insResLessThan800 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("绝缘电阻小于800kΩ");
        }
        if (faultInfo.tempGreaterL2 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("温度大二级故障");
        }
        if (faultInfo.tempLessL3 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("温度小三级故障");
        }
        if (faultInfo.cellVolGreaterL1 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("单体电压大一级故障");
        }
        if (faultInfo.cellVolLessL1 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("单体电压小一级故障");
        }
        if (faultInfo.canComFault === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("CAN通信故障");
        }
        if (faultInfo.mainRelayCutoffFault === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("主继电器粘连故障");
        }
        if (faultInfo.mainLoopBreakFault === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("主回路断路");
        }
        if (faultInfo.prechgFailFault === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("预充失败");
        }
        if (faultInfo.cellVolDiffGreaterL2 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("单体压差大二级故障");
        }
        if (faultInfo.cellVolDiffGreaterL3 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("单体压差大三级故障");
        }
        if (faultInfo.cellVolGreaterL2 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("单体电压大二级故障");
        }
        if (faultInfo.cellVolGreaterL3 === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("单体电压大三级故障");
        }
        if (faultInfo.tempSensorFault === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("温度传感器故障");
        }
        if (faultInfo.volSensorFault === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("电压传感器故障");
        }
        if (faultInfo.innerCANFault === BMS_FaultStatus.HAS_FAULT) {
            activeFaults.push("内部CAN故障");
        }

        // 检查原始数值故障
        if (faultInfo.dcChargerFault !== 0) {
            activeFaults.push(`DC充电器故障(${faultInfo.dcChargerFault})`);
        }
        if (faultInfo.dcanComFault !== 0) {
            activeFaults.push(`DCAN通信故障(${faultInfo.dcanComFault})`);
        }
        if (faultInfo.dcReceptacleHighTemp !== 0) {
            activeFaults.push(`DC插座高温(${faultInfo.dcReceptacleHighTemp})`);
        }
        if (faultInfo.dcReceptacleOverTemp !== 0) {
            activeFaults.push(`DC插座过温(${faultInfo.dcReceptacleOverTemp})`);
        }

        faultDetails.activeFaults = activeFaults;

        // 如果有故障或故障等级大于0，记录到专用日志
        if (faultInfo.faultLevel > BMS_FaultLevel.NO_FAULT || activeFaults.length > 0) {
            // 根据故障等级选择日志级别
            switch (faultInfo.faultLevel) {
                case BMS_FaultLevel.LEVEL_1:
                    this.bmsFaultLogger.warn('BMS一级故障检测', faultDetails);
                    this.batteryLogger.warn(`BMS一级故障: ${activeFaults.join(', ')}`);
                    break;
                case BMS_FaultLevel.LEVEL_2:
                    this.bmsFaultLogger.error('BMS二级故障检测', faultDetails);
                    this.batteryLogger.error(`BMS二级故障: ${activeFaults.join(', ')}`);
                    break;
                case BMS_FaultLevel.LEVEL_3:
                    this.bmsFaultLogger.error('BMS三级故障检测', faultDetails);
                    this.batteryLogger.error(`BMS三级故障(严重): ${activeFaults.join(', ')}`);
                    // 三级故障时也记录到控制台
                    this.logger.error(`🚨 BMS三级故障检测: ${activeFaults.join(', ')}`);
                    break;
                default:
                    if (activeFaults.length > 0) {
                        this.bmsFaultLogger.info('BMS故障状态检测', faultDetails);
                        this.batteryLogger.info(`BMS故障状态: ${activeFaults.join(', ')}`);
                    }
                    break;
            }
        } else {
            // 无故障时使用定时器控制的采样记录
            if (this.timerManager.shouldSample('BMS_FaultInfo_Normal')) {
                this.bmsFaultLogger.debug('BMS状态正常', {
                    timestamp: faultDetails.timestamp,
                    faultLevel: faultInfo.faultLevel,
                    systemContext: faultDetails.systemContext
                });
            }
        }
    }

    private parseDCACCommand(frame: CanFrame) {
        if (frame.data.length < 8) {
            this.logger.error('0x04080000报文数据长度不足，需要8字节');
            return;
        }

        // Var=EnableDCAC unsigned 0,8 - VCU使能或禁能DCAC工作输出交流电 (字节0)
        const enableDCAC = (frame.data[0] & 0xFF) as VCU_EnableDCAC;

        // Var=EnablePWM unsigned 8,8 - PWM使能 (字节1)
        const enablePWM = (frame.data[1] & 0xFF) as VCU_EnablePWM;

        const dcacCommand = new DCAC_COMMAND();
        dcacCommand.enableDCAC = enableDCAC;
        dcacCommand.enablePWM = enablePWM;
        dcacCommand.timestamp = Date.now();

        // 更新原始报文实例
        this.rawCanFrames.DCAC_COMMAND = dcacCommand;

        // 更新汇总状态
        this.pmsStatus.dcac.enableDCAC = enableDCAC;
        this.pmsStatus.timestamp = Date.now();

        // 定时器控制的采样记录
        if (this.timerManager.shouldSample('DCAC_Command')) {
            this.logger.debug(`DCAC命令采样: 使能=${enableDCAC}, PWM=${enablePWM}`);
        }

        return dcacCommand;
    }

    private parseDCACStatus(frame: CanFrame) {
        if (frame.data.length < 8) {
            this.logger.error('0x04C80000报文数据长度不足，需要8字节');
            return;
        }

        // Var=SysStatus unsigned 0,4 - 系统状态 (字节0位0-3)
        const sysStatus = (frame.data[0] & 0x0F) as DCAC_TaskState;

        // Var=HandSwitch unsigned 4,1 - 手动开关 (字节0位4)
        const handSwitch = (frame.data[0] >> 4) & 0x01;

        // Var=TempModule unsigned 8,8 - 模块温度 (字节1, 偏移-50°C)
        const tempModule = (frame.data[1] & 0xFF) - 50;

        // Var=TempCapOBG unsigned 16,8 - 电容温度OBG (字节2, 偏移-50°C)
        const tempCapOBG = (frame.data[2] & 0xFF) - 50;

        // Var=TempCapOBS unsigned 24,8 - 电容温度OBS (字节3, 偏移-50°C)
        const tempCapOBS = (frame.data[3] & 0xFF) - 50;

        // Var=DCAC_RELAY1 unsigned 32,8 - 继电器1状态 (字节4)
        const relay1 = (frame.data[4] & 0xFF) as DCAC_RELAY1;

        // Var=DCAC_RELAY2 unsigned 40,8 - 继电器2状态 (字节5)
        const relay2 = (frame.data[5] & 0xFF) as DCAC_RELAY2;

        // Var=DCAC_OPT1 unsigned 48,8 - 光耦1状态 (字节6)
        const opt1 = (frame.data[6] & 0xFF) as DCAC_OPT1;

        // Var=DCAC_OPT2 unsigned 56,8 - 光耦2状态 (字节7)
        const opt2 = (frame.data[7] & 0xFF) as DCAC_OPT2;

        const dcacStatus = new DCAC_Status();
        dcacStatus.sysStatus = sysStatus;
        dcacStatus.handSwitch = handSwitch;
        dcacStatus.tempModule = tempModule;
        dcacStatus.tempCapOBG = tempCapOBG;
        dcacStatus.tempCapOBS = tempCapOBS;
        dcacStatus.relay1 = relay1;
        dcacStatus.relay2 = relay2;
        dcacStatus.opt1 = opt1;
        dcacStatus.opt2 = opt2;
        dcacStatus.timestamp = Date.now();

        // 更新原始报文实例
        this.rawCanFrames.DCAC_Status = dcacStatus;

        // 更新汇总状态
        this.pmsStatus.dcac.systemStatus = sysStatus;
        this.pmsStatus.dcac.tempModule = tempModule;
        this.pmsStatus.dcac.relay1 = relay1;
        this.pmsStatus.dcac.relay2 = relay2;
        this.pmsStatus.vcu.keyOn = handSwitch === 0;
        this.pmsStatus.timestamp = Date.now();

        // 定时器控制的采样记录
        if (this.timerManager.shouldSample('DCAC_Status')) {
            this.logger.debug(`DCAC状态采样: 系统状态=${sysStatus}, 模块温度=${tempModule}℃`);
        }

        return dcacStatus;
    }

    private parseISGCommand(frame: CanFrame) {
        if (frame.data.length < 8) {
            this.logger.error('0x0CFF8B32报文数据长度不足，需要8字节');
            return;
        }

        // Var=ISG_ChargeEnable unsigned 0,1 - ISG充电使能 (字节0位0)
        const isgChargeEnable = (frame.data[0] & 0x01) as ISG_ChargeEnable;

        // Var=ChgPos_ConState unsigned 8,1 - 充电位置连接状态 (字节1位0)
        const chgPosConState = (frame.data[1] & 0x01) as ISG_ChgPos_ConState;

        // Var=LiftTime unsigned 56,8 - 生命信号 (字节7)
        const liftTime = frame.data[7] & 0xFF;

        const isgCommand = new ISG_COMMAND();
        isgCommand.isgChargeEnable = isgChargeEnable;
        isgCommand.chgPosConState = chgPosConState;
        isgCommand.liftTime = liftTime;
        isgCommand.timestamp = Date.now();

        // 更新原始报文实例
        this.rawCanFrames.ISG_COMMAND = isgCommand;

        // 更新汇总状态
        this.pmsStatus.isg.chargeEnable = isgChargeEnable;
        this.pmsStatus.timestamp = Date.now();

        // 定时器控制的采样记录
        if (this.timerManager.shouldSample('ISG_Command')) {
            this.logger.debug(`ISG命令采样: 充电使能=${isgChargeEnable}, 连接状态=${chgPosConState}`);
        }

        return isgCommand;
    }

    private parseRCUStatus01(frame: CanFrame) {
        if (frame.data.length < 8) {
            this.logger.error('0x1601EFF4报文数据长度不足，需要8字节');
            return;
        }

        // Var=ISG_TOR unsigned 0,16 - ISG发电机实际转矩 (字节0-1, 小端序, 精度0.1, 范围-3200~3200)
        const rawTorque = (frame.data[0] & 0xFF) | ((frame.data[1] & 0xFF) << 8);
        const signedTorque = rawTorque > 32767 ? rawTorque - 65536 : rawTorque;
        const isgTor = signedTorque * 0.1;

        // Var=ISG_SPEED unsigned 16,16 - ISG发电机实时转速 (字节2-3, 小端序, 范围-32000~32000)
        const rawSpeed = (frame.data[2] & 0xFF) | ((frame.data[3] & 0xFF) << 8);
        const isgSpeed = rawSpeed > 32767 ? rawSpeed - 65536 : rawSpeed;

        // Var=ISG_CurOutput unsigned 32,16 - 直流母线输出电流 (字节4-5, 小端序, 精度0.1, 范围-1000~1000)
        const rawCurrent = (frame.data[4] & 0xFF) | ((frame.data[5] & 0xFF) << 8);
        const signedCurrent = rawCurrent > 32767 ? rawCurrent - 65536 : rawCurrent;
        const isgCurOutput = signedCurrent * 0.1;

        // Var=FaultInfo unsigned 48,8 - 故障码 (字节6, 范围0~255)
        const faultInfo = frame.data[6] & 0xFF;

        // Var=System_Status unsigned 56,2 - 发电状态 (字节7位0-1)
        const systemStatus = (frame.data[7] & 0x03) as ISG_System_Status;

        // Var=LiftTime unsigned 60,4 - 控制报文生命信号 (字节7位4-7, 范围0~15)
        const liftTime = (frame.data[7] >> 4) & 0x0F;

        const rcuStatus01 = new RCU_Status01();
        rcuStatus01.isgTor = isgTor;
        rcuStatus01.isgSpeed = isgSpeed;
        rcuStatus01.isgCurOutput = isgCurOutput;
        rcuStatus01.faultInfo = faultInfo;
        rcuStatus01.systemStatus = systemStatus;
        rcuStatus01.liftTime = liftTime;
        rcuStatus01.timestamp = Date.now();

        // 更新原始报文实例
        this.rawCanFrames.RCU_Status01 = rcuStatus01;

        // 更新汇总状态
        this.pmsStatus.isg.systemStatus = systemStatus;
        this.pmsStatus.isg.torque = isgTor;
        this.pmsStatus.isg.speed = isgSpeed;
        this.pmsStatus.isg.current = isgCurOutput;
        this.pmsStatus.isg.faultInfo = faultInfo;
        this.pmsStatus.timestamp = Date.now();

        // 定时器控制的采样记录，或者在故障时记录
        if (faultInfo > 0) {
            this.logger.debug(`RCU状态01故障: 转矩=${isgTor.toFixed(1)}N.m, 转速=${isgSpeed}Rpm, 电流=${isgCurOutput.toFixed(1)}A, 故障码=${faultInfo}`);
        } else if (this.timerManager.shouldSample('RCU_Status01')) {
            this.logger.debug(`RCU状态01采样: 转矩=${isgTor.toFixed(1)}N.m, 转速=${isgSpeed}Rpm, 电流=${isgCurOutput.toFixed(1)}A`);
        }

        return rcuStatus01;
    }
}
