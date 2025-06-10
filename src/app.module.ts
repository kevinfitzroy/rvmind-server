import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RelayModule } from './relay/relay.module';
import { ModbusModule } from './modbus/modbus.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '../../../', 'public'), // 指向 Vite 构建输出的目录
    }),
    ModbusModule,
    RelayModule,
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
    console.log('Static files served from:', join(__dirname, '../../', 'public'));
  }
}
