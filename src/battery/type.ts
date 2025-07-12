export interface RealTimeData {
  cellVoltages: number[]; // 单体电压，单位：V
  batteryTemperatures: number[]; // 电池温度，单位：°C
  totalVoltage: number; // 电池总电压，单位：V
  current: number; // 电流，单位：A（放电正，充电负）
  soc: number; // SOC，单位：%
  life: number; // 心跳包计数
  batteryCount: number; // 电池总数
  temperatureSensorCount: number; // 温度传感器数量
  maxCellVoltage: number; // 最高单体电压，单位：V
  maxCellVoltageIndex: number; // 最高单体电压序号
  minCellVoltage: number; // 最低单体电压，单位：V
  minCellVoltageIndex: number; // 最低单体电压序号
  cellVoltageDifference: number; // 最高最低单体电压压差，单位：V
  maxCellTemperature: number; // 最高单体温度，单位：°C
  maxCellTemperatureIndex: number; // 最高单体温度序号
  minCellTemperature: number; // 最低单体温度，单位：°C
  minCellTemperatureIndex: number; // 最低单体温度序号
  temperatureDifference: number; // 最高最低温度温差，单位：°C
  chargeDischargeStatus: number; // 0:静止, 1:充电, 2:放电
  chargerStatus: number; // 0:无充电器, 1:检测到充电器
  loadStatus: number; // 0:无负载, 1:检测到负载
  remainingCapacity: number; // 剩余容量，单位：Ah
  cycleCount: number; // 使用循环次数
  balancingStatus: number; // 均衡状态:0关闭,1被动,2主动
  balancingCellFlags: boolean[]; // 每节电池均衡状态，长度48
  chargeMosStatus: boolean; // 充电MOS状态
  dischargeMosStatus: boolean; // 放电MOS状态
  prechargeMosStatus: boolean; // 预充MOS状态
  heaterMosStatus: boolean; // 加热MOS状态
  fanMosStatus: boolean; // 风扇MOS状态
  averageVoltage: number; // 平均电压，单位：V
  power: number; // 功率，单位：W
  energy: number; // 能量，单位：Wh
  mosTemperature: number; // MOS温度，单位：°C
  ambientTemperature: number; // 环境温度，单位：°C
  heatingTemperature: number; // 加热温度，单位：°C
  heatingCurrent: number; // 加热电流，单位：A
  currentLimitingStatus: number; // 限流状态:0关闭,1开启
  currentLimitingCurrent: number; // 限流电流，单位：A
  timestamp: Date; // RTC时戳
  remainingChargeTime: number; // 剩余充电时间，单位：分钟
  diStatus: boolean[]; // DI1-DI8状态
  doStatus: boolean[]; // DO1-DO8状态
  reserved19: number; // 保留信号19
  reserved20: number; // 保留信号20
  interfaceType: number; // 通信接口类型:1=485,2=UART
}

export function parseRealTimeData(buffer: Buffer): RealTimeData {
  if (buffer.length < 127 * 2) {
    throw new Error(
      `Buffer length ${buffer.length} is less than required 254 bytes`,
    );
  }
  // 按寄存器拆分
  const regs: number[] = [];
  for (let i = 0; i < 127; i++) {
    regs.push(buffer.readUInt16BE(i * 2));
  }

  // 解析字段
  const cellVoltages = regs.slice(0, 48).map((v) => v * 0.001);
  const batteryTemperatures = regs.slice(48, 56).map((v) => v - 40);
  const totalVoltage = regs[56] * 0.1;
  const current = (30000 - regs[57]) * 0.1;
  const soc = parseFloat((regs[58] * 0.001).toFixed(3));
  const life = regs[59];
  const batteryCount = regs[60];
  const temperatureSensorCount = regs[61];
  const maxCellVoltage = regs[62] * 0.001;
  const maxCellVoltageIndex = regs[63];
  const minCellVoltage = regs[64] * 0.001;
  const minCellVoltageIndex = regs[65];
  const cellVoltageDifference = regs[66] * 0.001;
  const maxCellTemperature = regs[67] - 40;
  const maxCellTemperatureIndex = regs[68];
  const minCellTemperature = regs[69] - 40;
  const minCellTemperatureIndex = regs[70];
  const temperatureDifference = regs[71];
  const chargeDischargeStatus = regs[72];
  const chargerStatus = regs[73];
  const loadStatus = regs[74];
  const remainingCapacity = parseFloat((regs[75] * 0.1).toFixed(3));
  const cycleCount = regs[76];
  const balancingStatus = regs[77];

  const balancingCellFlags: boolean[] = [];
  for (let addr = 0x4f; addr <= 0x51; addr++) {
    const bits = regs[addr];
    for (let b = 0; b < 16; b++) {
      balancingCellFlags.push(!!(bits & (1 << b)));
    }
  }

  const chargeMosStatus = !!regs[0x52];
  const dischargeMosStatus = !!regs[0x53];
  const prechargeMosStatus = !!regs[0x54];
  const heaterMosStatus = !!regs[0x55];
  const fanMosStatus = !!regs[0x56];

  const averageVoltage = regs[0x57] * 0.001;
  const power = regs[0x58];
  const energy = regs[0x59];
  const mosTemperature = regs[0x5a] - 40;
  const ambientTemperature = regs[0x5b] - 40;
  const heatingTemperature = regs[0x5c] - 40;
  const heatingCurrent = regs[0x5d];
  const currentLimitingStatus = regs[0x5f];
  const currentLimitingCurrent = (regs[0x60] - 30000) * 0.1;

  // RTC解析
  const r0 = regs[0x61];
  const r1 = regs[0x62];
  const r2 = regs[0x63];
  const year = (r0 >> 8) + 2000;
  const month = r0 & 0xff;
  const day = r1 >> 8;
  const hour = r1 & 0xff;
  const minute = r2 >> 8;
  const second = r2 & 0xff;
  const timestamp = new Date(year, month - 1, day, hour, minute, second);

  const remainingChargeTime = regs[0x64];

  const diDo = regs[0x65];
  const diStatus: boolean[] = [];
  const doStatus: boolean[] = [];
  for (let b = 0; b < 8; b++) {
    diStatus.push(!!(diDo & (1 << b)));
    doStatus.push(!!(diDo & (1 << (b + 8))));
  }

  const reserved19 = regs[0x7c];
  const reserved20 = regs[0x7d];
  const interfaceType = regs[0x7e];

  return {
    cellVoltages,
    batteryTemperatures,
    totalVoltage,
    current,
    soc,
    life,
    batteryCount,
    temperatureSensorCount,
    maxCellVoltage,
    maxCellVoltageIndex,
    minCellVoltage,
    minCellVoltageIndex,
    cellVoltageDifference,
    maxCellTemperature,
    maxCellTemperatureIndex,
    minCellTemperature,
    minCellTemperatureIndex,
    temperatureDifference,
    chargeDischargeStatus,
    chargerStatus,
    loadStatus,
    remainingCapacity,
    cycleCount,
    balancingStatus,
    balancingCellFlags,
    chargeMosStatus,
    dischargeMosStatus,
    prechargeMosStatus,
    heaterMosStatus,
    fanMosStatus,
    averageVoltage,
    power,
    energy,
    mosTemperature,
    ambientTemperature,
    heatingTemperature,
    heatingCurrent,
    currentLimitingStatus,
    currentLimitingCurrent,
    timestamp,
    remainingChargeTime,
    diStatus,
    doStatus,
    reserved19,
    reserved20,
    interfaceType,
  };
}
