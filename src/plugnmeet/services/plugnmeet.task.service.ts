import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PlugNMeetService } from './plugnmeet.service';
@Injectable()
export class PlugNMeetTaskService implements OnModuleInit {
  private readonly logger = new Logger(PlugNMeetTaskService.name);
  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
    private readonly conferenceService: PlugNMeetService,
  ) {}

  async onModuleInit() {
    await this.deleteOldRooms();
    await this.syncRooms();
    await this.ingestPending();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async ingestPending() {
    try {
      await this.conferenceService.ingestPendingRecordings();
    } catch (e) {
      this.logger.verbose(`Caught exception while ingesting recordings ${e}`);
    }
  }
  @Cron(CronExpression.EVERY_10_SECONDS)
  async syncRooms() {
    try {
      await this.conferenceService.syncActiveRooms();
    } catch (e) {
      this.logger.verbose(`Caught exception while cleaning up old conference rooms ${e}`);
    }
  }
  @Cron(CronExpression.EVERY_30_SECONDS)
  async deleteOldRooms() {
    try {
      await this.conferenceService.deleteOldRooms();
    } catch (e) {
      this.logger.verbose(`Caught exception while deleting old PlugNMeet rooms ${e}`);
    }
  }
}
