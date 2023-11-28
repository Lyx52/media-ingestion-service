import { Logger, OnModuleInit } from '@nestjs/common';
import { OnGlobalQueueCompleted, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { INGEST_RECORDING_JOB } from '../../app.constants';
import { IngestRecordingJobDto } from '../../common/dto/IngestRecordingJobDto';
import { OpencastApiService } from '../services/opencast.api.service';
import { ConfigService } from '@nestjs/config';
import { IngestJobFinishedDto } from '../../common/dto/IngestJobFinishedDto';
import * as fs from 'fs';
import { OpencastService } from '../services/opencast.service';
@Processor('video')
export class OpencastVideoIngestConsumer implements OnModuleInit {
  private readonly defaultAclName?: string;
  private readonly customAclConfig?: any[];
  private readonly workflowConfig: any;
  private readonly workflowSingle: string;
  private readonly workflowMultiple: string;
  private readonly logger: Logger = new Logger(OpencastVideoIngestConsumer.name);
  async onModuleInit() {}
  constructor(
    private readonly opencastApi: OpencastApiService,
    private readonly opencast: OpencastService,
    private readonly config: ConfigService,
  ) {
    this.defaultAclName = this.config.get<string>('opencast.default_acl');
    this.customAclConfig = this.config.get<any[]>('opencast.custom_acl_config');
    this.workflowConfig = this.config.getOrThrow<any>('opencast.workflow_configuration');
    this.workflowSingle = this.config.getOrThrow<string>('opencast.workflow_single');
    this.workflowMultiple = this.config.getOrThrow<string>('opencast.workflow_multiple');
  }
  @Process(INGEST_RECORDING_JOB)
  async ingestMediaPackage(job: Job<IngestRecordingJobDto>) {
    const { data } = job;
    this.logger.verbose('Started INGEST_RECORDING_JOB');
    if (data.recordings.length <= 0) {
      await job.moveToCompleted(
        JSON.stringify(<IngestJobFinishedDto>{
          success: false,
          msg: 'Ingest job failed because no recordings were found!',
          service: data.service,
        }),
      );
      return;
    }
    try {
      const event = await this.opencastApi
        .createNewEvent()
        .createMediaPackage()
        .then((e) => e.addEventMetadata(data.eventMetadata))
        .then((e) =>
          this.customAclConfig && this.customAclConfig.length > 0
            ? e.addAclFromRoles(this.customAclConfig)
            : e.addAclFromName(this.defaultAclName),
        );

      // NOTE: Video source service is responsible for sorting recordings
      for (const recording of data.recordings) {
        if (fs.existsSync(recording)) {
          event.addTrack(recording);
        } else {
          this.logger.warn(`Video file ${recording} does not exist!`);
        }
      }

      const workflow = data.recordings.length > 1 ? this.workflowMultiple : this.workflowSingle;
      const success = await event.ingest(workflow);
      await job.moveToCompleted(
        JSON.stringify(<IngestJobFinishedDto>{
          success: success,
          eventId: event.eventId,
          identifiers: data.identifiers,
          service: data.service,
        }),
      );
      return;
    } catch (e) {
      await job.moveToCompleted(
        JSON.stringify(<IngestJobFinishedDto>{
          success: false,
          msg: e,
          service: data.service,
        }),
      );
      return;
    }
  }

  @OnGlobalQueueCompleted()
  async onJobCompleted(job: Job, result: any) {
    // Wtf?! string of a string of a json
    const resultDto: IngestJobFinishedDto = JSON.parse(JSON.parse(result));
    this.logger.verbose(`VideoQueue Job completed: ${JSON.stringify(resultDto)}`);
    await this.opencast.jobFinished(resultDto);
  }
}
