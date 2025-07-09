import { Controller, Get, Post, Param, HttpException, HttpStatus } from '@nestjs/common';
import { SensorService, LevelSensorData } from './sensor.service';

@Controller({
    path: 'sensor',
    version: '1',
})
export class SensorController {
  constructor(private readonly sensorService: SensorService) {}

  // 获取液位传感器数据
  @Get('level')
  getLevelData(): { success: boolean; data: LevelSensorData | null; updateTime: string; isFresh: boolean } {
    const { data, updateTime } = this.sensorService.getLatestData('level');
    
    if (!data) {
      throw new HttpException('液位传感器数据不可用', HttpStatus.NOT_FOUND);
    }

    return {
      success: true,
      data,
      updateTime: updateTime ? updateTime.toISOString() : '',
      isFresh: this.sensorService.isDataFresh('level')
    };
  }

//   // 手动刷新液位传感器数据
//   @Post('level/refresh')
//   async refreshLevelData() {
//     const result = await this.sensorService.manualUpdate('level');
    
//     if (!result.success) {
//       throw new HttpException('刷新液位传感器数据失败', HttpStatus.INTERNAL_SERVER_ERROR);
//     }

//     return {
//       success: true,
//       data: result.data,
//       message: '液位传感器数据刷新成功'
//     };
//   }

  // 获取所有传感器数据
  @Get('all')
  getAllSensorData() {
    const allData = this.sensorService.getAllLatestData();
    const result = {};
    
    allData.forEach((value, key) => {
      result[key] = {
        ...value,
        isFresh: this.sensorService.isDataFresh(key)
      };
    });

    return {
      success: true,
      data: result
    };
  }
}
