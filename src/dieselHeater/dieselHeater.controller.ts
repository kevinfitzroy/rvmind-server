import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Body, 
  HttpException, 
  HttpStatus,
  Logger 
} from '@nestjs/common';
import { DieselHeaterService } from './dieselHeater.service';

export interface SetTemperatureDto {
  temperature: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  timestamp: string;
}

@Controller({
    path:"diesel-heater",
    version:"1"
})
export class DieselHeaterController {
  private readonly logger = new Logger(DieselHeaterController.name);

  constructor(private readonly dieselHeaterService: DieselHeaterService) {}

  // 获取详细状态信息
  @Get('status')
  async getDetailedStatus(): Promise<ApiResponse> {
    try {
      const status = this.dieselHeaterService.getDetailedStatus();
      return {
        success: true,
        message: '获取详细状态成功',
        data: status,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('获取详细状态失败:', error);
      throw new HttpException(
        {
          success: false,
          message: '获取详细状态失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 启动加热器并开始加热
  @Post('start-with-heating')
  async startHeaterWithHeating(): Promise<ApiResponse> {
    try {
      await this.dieselHeaterService.startHeaterWithHeating();
      return {
        success: true,
        message: '启动加热器并开始加热成功',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('启动加热器失败:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || '启动加热器失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // 启动加热器但不加热
  @Post('start-without-heating')
  async startHeaterWithoutHeating(): Promise<ApiResponse> {
    try {
      await this.dieselHeaterService.startHeaterWithoutHeating();
      return {
        success: true,
        message: '启动加热器但不加热成功',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('启动加热器失败:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || '启动加热器失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // 停止加热器
  @Post('stop')
  async stopHeater(): Promise<ApiResponse> {
    try {
      await this.dieselHeaterService.stopHeater();
      return {
        success: true,
        message: '停止加热器成功',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('停止加热器失败:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || '停止加热器失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 切换加热状态
  @Post('toggle-heating')
  async toggleHeating(): Promise<ApiResponse> {
    try {
      await this.dieselHeaterService.toggleHeating();
      return {
        success: true,
        message: '切换加热状态成功',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('切换加热状态失败:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || '切换加热状态失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // 设置目标温度
  @Put('temperature')
  async setTargetTemperature(@Body() dto: SetTemperatureDto): Promise<ApiResponse> {
    try {
      if (!dto.temperature && dto.temperature !== 0) {
        throw new Error('温度参数不能为空');
      }

      await this.dieselHeaterService.setTargetTemperature(dto.temperature);
      return {
        success: true,
        message: `设置目标温度为 ${dto.temperature}°C 成功`,
        data: { targetTemperature: dto.temperature },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('设置目标温度失败:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || '设置目标温度失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // 获取连接状态
  @Get('connection-status')
  async getConnectionStatus(): Promise<ApiResponse> {
    try {
      const isConnected = this.dieselHeaterService.isConnected();
      const controlState = this.dieselHeaterService.getControlState();
      
      return {
        success: true,
        message: '获取连接状态成功',
        data: {
          isConnected,
          controlState
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('获取连接状态失败:', error);
      throw new HttpException(
        {
          success: false,
          message: '获取连接状态失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 获取控制状态
  @Get('control-state')
  async getControlState(): Promise<ApiResponse> {
    try {
      const controlState = this.dieselHeaterService.getControlState();
      return {
        success: true,
        message: '获取控制状态成功',
        data: controlState,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('获取控制状态失败:', error);
      throw new HttpException(
        {
          success: false,
          message: '获取控制状态失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 健康检查
  @Get('health')
  async healthCheck(): Promise<ApiResponse> {
    try {
      const isConnected = this.dieselHeaterService.isConnected();
      const status = this.dieselHeaterService.getStatus();
      const now = new Date();
      const lastUpdate = status.lastUpdateTime;
      const timeDiff = now.getTime() - lastUpdate.getTime();
      
      return {
        success: true,
        message: '健康检查完成',
        data: {
          isConnected,
          lastUpdateTime: lastUpdate,
          timeSinceLastUpdate: `${Math.round(timeDiff / 1000)}秒`,
          isOnline: timeDiff <= 5000
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('健康检查失败:', error);
      throw new HttpException(
        {
          success: false,
          message: '健康检查失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  // 连接第二个端口（加热器控制端口）
  @Post('connect')
  async connectSecondPort(): Promise<ApiResponse> {
    try {
      const result = await this.dieselHeaterService.connectSecondPort();
      if (result) {
        return {
          success: true,
          message: '加热器控制端口连接成功',
          data: { connected: true },
          timestamp: new Date().toISOString()
        };
      } else {
        throw new Error('连接失败');
      }
    } catch (error) {
      this.logger.error('连接加热器控制端口失败:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || '连接加热器控制端口失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // 断开第二个端口连接
  @Post('disconnect')
  async disconnectSecondPort(): Promise<ApiResponse> {
    try {
      await this.dieselHeaterService.disconnectSecondPort();
      return {
        success: true,
        message: '加热器控制端口已断开',
        data: { connected: false },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('断开加热器控制端口失败:', error);
      throw new HttpException(
        {
          success: false,
          message: error.message || '断开加热器控制端口失败',
          timestamp: new Date().toISOString()
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
