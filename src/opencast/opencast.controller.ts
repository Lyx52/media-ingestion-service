import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';

import { OpencastService } from './services/opencast.service';
import { EventPattern } from '@nestjs/microservices';
import { OPENCAST_INGEST_RECORDINGS } from '../app.constants';
import { IngestRecordingJobDto } from '../common/dto/IngestRecordingJobDto';

@Controller('opencast')
export class OpencastController {
  private readonly logger: Logger = new Logger(OpencastController.name);
  constructor(private readonly opencastService: OpencastService) {}
  @EventPattern(OPENCAST_INGEST_RECORDINGS)
  async opencastIngestRecordings(@Body() data: IngestRecordingJobDto) {
    return this.opencastService.addIngestJob(data);
  }
}
