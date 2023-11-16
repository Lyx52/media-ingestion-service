import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import config from '../common/config.yaml';
import { OpencastVideoIngestConsumer } from './processors/opencast.ingest.processor';
import { OpencastService } from './services/opencast.service';
import { OpencastApiService } from './services/opencast.api.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { OPENCAST_SERVICE } from '../app.constants';
import { OpencastController } from './opencast.controller';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'video',
      defaultJobOptions: {
        attempts: 50,
        removeOnComplete: true,
      },
    }),
    ConfigModule.forRoot({ load: [config] }),
    ClientsModule.register([
      { name: OPENCAST_SERVICE, transport: Transport.TCP },
    ]),
  ],
  providers: [OpencastVideoIngestConsumer, OpencastService, OpencastApiService],
  controllers: [OpencastController],
})
export class OpencastModule {}
