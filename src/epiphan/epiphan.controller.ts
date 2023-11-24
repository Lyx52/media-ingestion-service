import { Body, Controller, Logger } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { INGEST_RECORDINGS_JOB_FINISHED } from '../app.constants';
import { IngestJobFinishedDto } from '../common/dto/IngestJobFinishedDto';
import { EpiphanService } from './services/epiphan.service';

@Controller()
export class EpiphanController {
  private readonly logger: Logger = new Logger(EpiphanController.name);
  constructor(private readonly epiphanService: EpiphanService) {}

  @EventPattern(INGEST_RECORDINGS_JOB_FINISHED)
  async epiphanRecordingsIngested(@Body() data: IngestJobFinishedDto) {
    if (data.success) {
      return this.epiphanService.ingestJobFinished(data);
    }
    this.logger.error(`Ingest job failed with message: '${data.msg}'`);
  }
}
