import { Body, Controller, Logger } from '@nestjs/common';

import { OpencastService } from './services/opencast.service';
import { EventPattern, MessagePattern } from '@nestjs/microservices';
import { OPENCAST_CREATE_DEFAULT_METADATA, OPENCAST_INGEST_RECORDINGS } from '../app.constants';
import { IngestRecordingJobDto } from '../common/dto/IngestRecordingJobDto';
import { CreateDefaultEventMetadataDto } from '../common/dto/CreateDefaultEventMetadataDto';

@Controller()
export class OpencastController {
  private readonly logger: Logger = new Logger(OpencastController.name);
  constructor(private readonly opencastService: OpencastService) {}
  @EventPattern(OPENCAST_INGEST_RECORDINGS)
  async opencastIngestRecordings(@Body() data: IngestRecordingJobDto) {
    return this.opencastService.addIngestJob(data);
  }

  @MessagePattern(OPENCAST_CREATE_DEFAULT_METADATA)
  async opencastCreateDefaultEventMetadata(@Body() data: CreateDefaultEventMetadataDto) {
    return await this.opencastService.createDefaultEventMetadata(data);
  }
}
