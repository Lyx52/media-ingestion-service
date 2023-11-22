import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { EPIPHAN_SERVICE } from '../app.constants';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '@nestjs/config';
import config from '../common/config.yaml';
import { EpiphanController } from './epiphan.controller';
import { EpiphanService } from "./services/epiphan.service";
import { EpiphanTaskService } from "./services/epiphan.task.service";

@Module({
  imports: [
    ClientsModule.register([
      { name: EPIPHAN_SERVICE, transport: Transport.TCP },
    ]),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ load: [config] }),
  ],
  providers: [EpiphanService, EpiphanTaskService],
  controllers: [EpiphanController],
})
export class EpiphanModule {}
