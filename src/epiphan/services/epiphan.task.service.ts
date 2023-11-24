import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EpiphanService } from './epiphan.service';

@Injectable()
export class EpiphanTaskService implements OnModuleInit {
  private readonly logger = new Logger(EpiphanTaskService.name);
  constructor(
    private schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
    private readonly epiphanService: EpiphanService,
  ) {}

  async onModuleInit() {
    await this.ingestPending();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async ingestPending() {
    try {
      await this.epiphanService.ingestPendingRecordings();
    } catch (e) {
      this.logger.verbose(`Caught exception while ingesting recordings ${e}`);
    }
  }
}
