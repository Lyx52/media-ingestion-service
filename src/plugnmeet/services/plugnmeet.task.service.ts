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
    await this.cleanupOldRooms();
    await this.ingestPending();
  }
  @Cron(CronExpression.EVERY_5_MINUTES)
  async ingestPending() {
    try {
      await this.conferenceService.ingestPendingRecordings();
    } catch (e) {
      this.logger.verbose(`Caught exception while ingesting recordings ${e}`);
    }
  }
  @Cron(CronExpression.EVERY_30_SECONDS)
  async cleanupOldRooms() {
    try {
      await this.conferenceService.removeAndUpdateRooms();
    } catch (e) {
      this.logger.verbose(
        `Caught exception while syncing conference rooms ${e}`,
      );
    }
  }
}
