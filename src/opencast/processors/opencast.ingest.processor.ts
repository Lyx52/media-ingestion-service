import { Logger, OnModuleInit } from '@nestjs/common';
import { OnQueueCompleted, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { INGEST_RECORDING_JOB } from '../../app.constants';
import { IngestRecordingJobDto } from '../../common/dto/IngestRecordingJobDto';
import { OpencastApiService } from '../services/opencast.api.service';
import {
  generateAclXML,
  generateEpisodeCatalogXML,
  getMediaPackageId,
} from '../../common/utils';
import { ConfigService } from '@nestjs/config';
import { IngestJobFinishedDto } from '../../common/dto/IngestJobFinishedDto';
import { IProcessingConfiguration } from '../../common/dto/interfaces/IProcessingConfiguration';
import * as fs from 'fs';
@Processor('video')
export class OpencastVideoIngestConsumer implements OnModuleInit {
  private readonly defaultAclName?: string;
  private readonly customAclConfig?: any[];
  private readonly workflowConfig: IProcessingConfiguration;
  private readonly logger: Logger = new Logger(
    OpencastVideoIngestConsumer.name,
  );
  async onModuleInit() {}
  constructor(
    private readonly opencastApi: OpencastApiService,
    private readonly config: ConfigService,
  ) {
    this.defaultAclName = this.config.get<string>('opencast.default_acl');
    this.customAclConfig = this.config.get<any[]>('opencast.custom_acl_config');
    this.workflowConfig = this.config.getOrThrow<IProcessingConfiguration>(
      'opencast.processing_config',
    );
  }
  @Process(INGEST_RECORDING_JOB)
  async ingestMediaPackage(job: Job<IngestRecordingJobDto>) {
    const { data } = job;
    this.logger.verbose('Started INGEST_RECORDING_JOB');
    if (data.recordings.length <= 0) {
      return job.moveToCompleted(
        JSON.stringify(<IngestJobFinishedDto>{
          success: false,
          msg: 'Ingest job failed because no recordings were found!',
        }),
      );
    }
    try {
      let mediaPackage = await this.opencastApi.createMediaPackage();

      // Add episode DublinCore metadata
      const dcCatalogXML = generateEpisodeCatalogXML(data.eventMetadata);
      mediaPackage = await this.opencastApi.addDCCatalog(
        mediaPackage,
        dcCatalogXML,
        'dublincore/episode',
      );

      // Add episode ACLs
      const mediaPackageId = getMediaPackageId(mediaPackage);
      let aclXML = '';
      if (this.customAclConfig && this.customAclConfig.length > 0) {
        aclXML = generateAclXML(this.customAclConfig, mediaPackageId);
      } else if (this.defaultAclName) {
        const aclTemplate = await this.opencastApi.getAccessListTemplate(
          this.defaultAclName,
        );
        aclXML = generateAclXML(aclTemplate.acl.ace, mediaPackageId);
      } else {
        return job.moveToCompleted(
          JSON.stringify(<IngestJobFinishedDto>{
            success: false,
            msg: 'Cannot create event because ACL is not configured!',
          }),
        );
      }

      mediaPackage = await this.opencastApi.addAttachment(
        mediaPackage,
        aclXML,
        'security/xacml+episode',
      );

      // NOTE: Video source service is responsible for sorting recordings
      let totalIngested = 0;
      for (let i = 0; i < data.recordings.length; i++) {
        const recording = data.recordings[i];
        if (fs.existsSync(recording)) {
          mediaPackage = await this.opencastApi.addTrack(
            mediaPackage,
            recording,
            `presentation-${i}/source`,
          );
          totalIngested++;
        } else {
          this.logger.warn(
            `Failed to ingest recording, videofile ${recording} does not exist!`,
          );
        }
      }
      if (totalIngested <= 0) {
        return job.moveToCompleted(
          JSON.stringify(<IngestJobFinishedDto>{
            success: false,
            msg: `Ingest job failed because couldn't add any tracks!`,
          }),
        );
      }
      const success = await this.opencastApi.ingest(
        mediaPackage,
        this.workflowConfig.workflow,
      );
      return job.moveToCompleted(
        JSON.stringify(<IngestJobFinishedDto>{
          success: success,
          eventId: mediaPackageId,
          roomSid: data.roomSid,
        }),
      );
    } catch (e) {
      return job.moveToCompleted(
        JSON.stringify(<IngestJobFinishedDto>{
          success: false,
          msg: `Ingest job failed with exception ${e}!`,
        }),
      );
    }
  }

  @OnQueueCompleted()
  async onJobCompleted(job: Job, result: any) {
    this.logger.debug(job);
    this.logger.debug(result);
  }
}
