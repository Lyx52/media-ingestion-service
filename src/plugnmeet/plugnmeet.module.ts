import { PlugNMeetService } from './services/plugnmeet.service';
import { PlugNMeetTaskService } from './services/plugnmeet.task.service';
import { PlugNMeetController } from './plugnmeet.controller';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import config from '../common/config.yaml';
import { Module } from '@nestjs/common';
import { PlugNMeetRoom } from './entities/PlugNMeetRoom';
import { PLUG_N_MEET_SERVICE } from '../app.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlugNMeetRoom]),
    ClientsModule.register([{ name: PLUG_N_MEET_SERVICE, transport: Transport.TCP }]),
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ load: [config] }),
  ],
  providers: [PlugNMeetService, PlugNMeetTaskService],
  controllers: [PlugNMeetController],
})
export class PlugNMeetModule {}
