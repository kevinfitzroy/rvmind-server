import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as ngrok from '@ngrok/ngrok';
import * as fs from 'fs';
import { VersioningType } from '@nestjs/common';

async function bootstrap() {
  console.log('🚀 Starting NestJS application...');
  
  const httpsOptions = {
    key: fs.readFileSync('../192.168.8.145-key.pem'),
    cert: fs.readFileSync('../192.168.8.145.pem'),
  };

  console.log('📄 SSL certificates loaded successfully');
  
  const app = await NestFactory.create(AppModule, {
    httpsOptions,
  });

  console.log('🏗️ NestJS application created');

  // 启用URI版本化
  app.enableVersioning({
    type: VersioningType.URI,
  });
  // 配置CORS
  app.enableCors({
    origin: true, // 或者指定具体的域名，如 ['http://localhost:3000', 'http://localhost:8080']
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });
  const port = process.env.PORT ?? 3000;
  try{
    await app.listen(port);
  }catch (error) {
    console.error('❌ Failed to start the application:', error.message);
    return;
  }
  console.log(`🌐 Application is running on: https://localhost:${port}`);

  // 启动 ngrok 隧道
  // try {
  //   const url = await ngrok.connect({
  //     port: Number(port),
  //     authtoken: "2xkv59KsZZCV6TWmORtmUNzS6Db_7MqcBrcJ1tSV2DkYCFcqQ", // 可选：从环境变量读取认证token
  //   });
  //   console.log(`Ngrok tunnel created: ${url}`);
  // } catch (error) {
  //   console.error('Failed to create ngrok tunnel:', error.message);
  // }
}
bootstrap();
