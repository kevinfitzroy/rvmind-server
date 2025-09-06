import { Module } from '@nestjs/common';
import { DieselHeaterService } from './dieselHeater.service';
import { DieselHeaterController } from './dieselHeater.controller';
import { LcwlanModule } from '../lcwlan/lcwlan.module';

@Module({
    imports: [LcwlanModule],
    controllers: [DieselHeaterController],
    providers: [DieselHeaterService],
    exports: [DieselHeaterService],
})
export class DieselHeaterModule { }
