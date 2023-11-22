import {
  Body,
  Controller,
  Header,
  HttpCode,
  Logger,
  Post,
} from '@nestjs/common';
import { CreateConferenceDto } from './dto/CreateRoomParameters';
import { CreateRoomResponse } from 'plugnmeet-sdk-js';
import { PlugNMeetService } from './services/plugnmeet.service';
import { EventPattern } from '@nestjs/microservices';
import { INGEST_RECORDINGS_JOB_FINISHED } from '../app.constants';
import { IngestJobFinishedDto } from '../common/dto/IngestJobFinishedDto';

@Controller('')
export class PlugNMeetController {
  private readonly logger: Logger = new Logger(PlugNMeetController.name);
  constructor(private readonly conferenceService: PlugNMeetService) {}
  @Post('/auth/room/create')
  @HttpCode(200)
  @Header('Cache-Control', 'none')
  async createConferenceRoom(
    @Body() payload: CreateConferenceDto,
  ): Promise<CreateRoomResponse> {
    return this.conferenceService.createConferenceRoom(payload);
  }

  @EventPattern(INGEST_RECORDINGS_JOB_FINISHED)
  async opencastIngestRecordings(@Body() data: IngestJobFinishedDto) {
    if (data.success) {
      return this.conferenceService.ingestJobFinished(data);
    }
    this.logger.error(`Ingest job failed with message: '${data.msg}'`);
  }
}
