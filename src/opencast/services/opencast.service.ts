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
import { meta } from 'eslint-plugin-prettier';
import { concatDefinedArrays } from '../../common/utils';

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
    this.logger.log('Adding INGEST_RECORDING_JOB to job queue.');
    await this.ingestQueue.add(INGEST_RECORDING_JOB, data);
  }
  private getMetadataTemplate(templateName: string) {
    const { metadata_templates } = this.opencastConfig;
    const result = metadata_templates.filter((template) => template.name === templateName);
    return result.length > 0 ? result[0] : undefined;
  }
  async createDefaultEventMetadata(
    data: CreateDefaultEventMetadataDto,
  ): Promise<ICreateEventMetadata> {
    const { default_series } = this.opencastConfig;

    const series = await this.opencastApi.getSeries(data.seriesName || default_series);
    const metadata = this.getMetadataTemplate(data.templateName);
    if (!metadata) throw Error(`Unknown event template ${data.templateName}!`);
    return <ICreateEventMetadata>{
      location: metadata.location,
      contributors: concatDefinedArrays(series?.contributors, metadata.contributors),
      creators: concatDefinedArrays(series?.creators, metadata.creators),
      description: metadata.description,
      lang: series?.language,
      license: series?.license,
      publishers: concatDefinedArrays(series?.publishers, metadata.publishers),
      rights: metadata.rights,
      seriesId: series?.identifier || '',
      started: data.started,
      ended: data.ended || new Date(),
      subjects: concatDefinedArrays(series?.subjects, metadata.subjects),
      title: data.title,
    };
  }

  async jobFinished(data: IngestJobFinishedDto): Promise<void> {
    await this.client.emit(INGEST_RECORDINGS_JOB_FINISHED, data);
  }
}
