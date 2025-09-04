import { Module, OnModuleInit } from '@nestjs/common';
import { AppService } from './app.service';
import { RelayModule } from './relay/relay.module';
import { ModbusModule } from './modbus/modbus.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { BatteryModule } from './battery/battery.module';
import { SensorModule } from './sensor/sensor.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: '/home/yrv/public', // 指向 Vite 构建输出的目录
    }),
    ScheduleModule.forRoot(),
    ModbusModule,
    RelayModule,
    BatteryModule,
    SensorModule,
    EventEmitterModule.forRoot({
      // 可选配置
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  onModuleInit(): void {
  }
}
