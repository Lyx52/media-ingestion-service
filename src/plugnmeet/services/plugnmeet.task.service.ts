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
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupOldRooms() {
    try {
      await this.conferenceService.removeOldRooms();
    } catch (e) {
      this.logger.verbose(
        `Caught exception while syncing conference rooms ${e}`,
      );
    }
  }
}
