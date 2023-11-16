import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OpencastApiService } from './opencast.api.service';
import { IngestRecordingJobDto } from '../../common/dto/IngestRecordingJobDto';
import {
  INGEST_RECORDING_JOB,
  INGEST_RECORDINGS_JOB_FINISHED,
  OPENCAST_SERVICE,
} from '../../app.constants';
import { ClientProxy } from '@nestjs/microservices';
import { IngestJobFinishedDto } from '../../common/dto/IngestJobFinishedDto';

@Injectable()
export class OpencastService implements OnModuleInit {
  private readonly logger: Logger = new Logger(OpencastService.name);

  constructor(
    private readonly opencastApi: OpencastApiService,
    private readonly config: ConfigService,
    @InjectQueue('video') private ingestQueue: Queue,
    @Inject(OPENCAST_SERVICE) private readonly client: ClientProxy,
  ) {}

  async onModuleInit() {}

  async addIngestJob(data: IngestRecordingJobDto): Promise<void> {
    await this.ingestQueue.add(INGEST_RECORDING_JOB, data);
  }
  async jobFinished(data: IngestJobFinishedDto): Promise<void> {
    await this.client.emit(INGEST_RECORDINGS_JOB_FINISHED, data);
  }
}
