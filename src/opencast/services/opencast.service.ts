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
import { CreateDefaultEventMetadataDto } from '../../common/dto/CreateDefaultEventMetadataDto';
import { ICreateEventMetadata } from '../../common/dto/interfaces/ICreateEventMetadata';

@Injectable()
export class OpencastService implements OnModuleInit {
  private readonly logger: Logger = new Logger(OpencastService.name);
  private readonly opencastConfig: any;
  constructor(
    private readonly opencastApi: OpencastApiService,
    private readonly config: ConfigService,
    @InjectQueue('video') private ingestQueue: Queue,
    @Inject(OPENCAST_SERVICE) private readonly client: ClientProxy,
  ) {
    this.opencastConfig = this.config.getOrThrow<any>('opencast');
  }

  async onModuleInit() {}

  async addIngestJob(data: IngestRecordingJobDto): Promise<void> {
    await this.ingestQueue.add(INGEST_RECORDING_JOB, data);
  }
  async createDefaultEventMetadata(
    data: CreateDefaultEventMetadataDto,
  ): Promise<ICreateEventMetadata> {
    const {
      metadata,
      processing_config,
      default_acl,
      event_title_prefix,
      default_series,
    } = this.opencastConfig;

    const series = await this.opencastApi.getSeries(
      data.seriesName || default_series,
    );
    return {
      location: metadata.location,
      aclName: default_acl,
      contributors: series?.contributors
        ? metadata.contributors.concat(series.contributors)
        : metadata.contributors,
      creators: series?.creators
        ? metadata.creators.concat(series.creators)
        : metadata.creators,
      description: metadata.description,
      lang: series?.language,
      license: series?.license,
      processing: processing_config,
      publishers: series?.publishers
        ? metadata.publishers.concat(series.publishers)
        : metadata.publishers,
      rights: metadata.rights,
      seriesId: series?.identifier || '',
      started: data.started,
      ended: data.ended || new Date(),
      subjects: series?.subjects
        ? metadata.subjects.concat(series.subjects)
        : metadata.subjects,
      title: `${event_title_prefix} '${data.title}'`,
    } as ICreateEventMetadata;
  }
  async jobFinished(data: IngestJobFinishedDto): Promise<void> {
    await this.client.emit(INGEST_RECORDINGS_JOB_FINISHED, data);
  }
}
