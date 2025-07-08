import { Module, OnModuleInit } from '@nestjs/common';
import { AppService } from './app.service';
import { RelayModule } from './relay/relay.module';
import { ModbusModule } from './modbus/modbus.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { BatteryModule } from './battery/battery.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: '/home/yrv/rvmind/public', // 指向 Vite 构建输出的目录
    }),
    ModbusModule,
    RelayModule,
    BatteryModule,
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
