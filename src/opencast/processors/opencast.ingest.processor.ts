import { Logger, OnModuleInit } from '@nestjs/common';
import { OnQueueCompleted, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { INGEST_RECORDING_JOB } from '../../app.constants';
import { IngestRecordingJobDto } from '../../common/dto/IngestRecordingJobDto';
@Processor('video')
export class OpencastVideoIngestConsumer implements OnModuleInit {
  private readonly logger: Logger = new Logger(
    OpencastVideoIngestConsumer.name,
  );
  async onModuleInit() {}

  @Process(INGEST_RECORDING_JOB)
  async ingestMediaPackage(job: Job<IngestRecordingJobDto>) {
    const { data } = job;
    this.logger.debug('Started INGEST_RECORDING_JOB');
    if (data.recordings.length <= 0) {
      return job.moveToFailed({
        message: `INGEST_RECORDING_JOB failed because there are not recordings to upload!`,
      });
    }
    // TODO: Implement ingesting
  }

  @OnQueueCompleted()
  async onJobCompleted(job: Job, result: any) {
    this.logger.debug(job);
    this.logger.debug(result);
  }
  @OnQueueCompleted()
  async onJobFailed(job: Job, err: Error) {
    this.logger.debug(job);
    this.logger.debug(err);
  }
}
