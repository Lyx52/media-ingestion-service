import { Body, Controller, Get, Header, HttpCode, HttpStatus, Logger, Post } from "@nestjs/common";
import { CreateConferenceDto } from './dto/CreateRoomParameters';
import { CreateRoomResponse } from 'plugnmeet-sdk-js';
import { PlugNMeetService } from './services/plugnmeet.service';
import { EventPattern, Payload } from '@nestjs/microservices';
import { INGEST_RECORDINGS_JOB_FINISHED } from '../app.constants';
import { IngestJobFinishedDto } from '../common/dto/IngestJobFinishedDto';

@Controller()
export class PlugNMeetController {
  private readonly logger: Logger = new Logger(PlugNMeetController.name);
  constructor(private readonly conferenceService: PlugNMeetService) {}

  @EventPattern(INGEST_RECORDINGS_JOB_FINISHED)
  async plugnmeetRecordingsIngested(@Body() data: IngestJobFinishedDto) {
    if (data.success) {
      return this.conferenceService.ingestJobFinished(data);
    }
    this.logger.error(`Ingest job failed with message: '${data.msg}'`);
  }
  @Post('/webhook')
  async processWebhook(@Payload() payload: any) {
    this.logger.debug(payload);
  }
  @Get('/webhook')
  async processGetWebhook(@Payload() payload: any) {
    this.logger.debug(payload);
  }
}
