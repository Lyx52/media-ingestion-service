import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EPIPHAN_SERVICE,
  OPENCAST_CREATE_DEFAULT_METADATA,
  OPENCAST_INGEST_RECORDINGS,
} from '../../app.constants';
import { ClientProxy } from '@nestjs/microservices';
import * as fs from 'fs';
import * as fsAsync from 'fs/promises';
import * as fse from 'fs-extra';
import * as path from 'path';
import { IngestJobFinishedDto } from '../../common/dto/IngestJobFinishedDto';
import { IngestRecordingJobDto } from '../../common/dto/IngestRecordingJobDto';
import { ICreateEventMetadata } from '../../common/dto/interfaces/ICreateEventMetadata';
import { firstValueFrom } from 'rxjs';
import { CreateDefaultEventMetadataDto } from '../../common/dto/CreateDefaultEventMetadataDto';
@Injectable()
export class EpiphanService implements OnModuleInit {
  private readonly logger = new Logger(EpiphanService.name);
  private readonly recordingLocation: string;
  private readonly workdirLocation: string;
  private readonly archiveLocation: string;
  private readonly seriesName: string;
  private readonly templateName: string;
  constructor(
    private readonly config: ConfigService,
    @Inject(EPIPHAN_SERVICE) private readonly client: ClientProxy,
  ) {
    this.workdirLocation = this.config.getOrThrow<string>('epiphan.workdir_location');
    this.archiveLocation = this.config.getOrThrow<string>('epiphan.archive_location');
    this.recordingLocation = path.resolve(
      this.config.getOrThrow<string>('epiphan.recording_location'),
    );
    this.seriesName = this.config.getOrThrow<string>('epiphan.series_name');
    this.templateName = this.config.getOrThrow<string>('plugnmeet.eventTemplate');
  }
  async onModuleInit() {
    if (!fs.existsSync(this.recordingLocation)) {
      throw new Error(`Epiphan recording location ${this.recordingLocation} does not exist!`);
    }
    if (!fs.existsSync(this.workdirLocation)) {
      await fsAsync.mkdir(this.workdirLocation);
    }
    if (!fs.existsSync(this.archiveLocation)) {
      await fsAsync.mkdir(this.archiveLocation);
    }
  }

  async ingestJobFinished(data: IngestJobFinishedDto): Promise<void> {
    if (data.service !== EPIPHAN_SERVICE) return;
    if (data.identifiers.device && data.identifiers.fileName) {
      const workDir = path.resolve(this.workdirLocation, data.identifiers.device);
      const filePath = path.resolve(workDir, data.identifiers.fileName);
      if (fs.existsSync(workDir) && fs.existsSync(filePath)) {
        const archiveDir = path.resolve(this.archiveLocation, data.identifiers.device);
        if (!fs.existsSync(archiveDir)) {
          await fsAsync.mkdir(archiveDir);
        }
        await fse.move(filePath, path.resolve(archiveDir, data.identifiers.fileName));
      }
      return;
    }
    this.logger.warn(`Could not move ingested recordings from workdir to archive!`);
  }

  async createEventMetadata(
    started: Date,
    ended: Date,
    device: string,
  ): Promise<ICreateEventMetadata> {
    const metadata = await firstValueFrom(
      this.client.send<ICreateEventMetadata, CreateDefaultEventMetadataDto>(
        OPENCAST_CREATE_DEFAULT_METADATA,
        {
          templateName: this.templateName,
          started: started,
          ended: ended,
          title: `Epiphan recording (${started.getDate()}.${started.getMonth()}.${started.getFullYear()})`,
          seriesName: this.seriesName,
        },
      ),
    );
    metadata.location = device;
    return metadata;
  }

  async parseRecordingDate(filePath: string): Promise<Date> {
    const fileInfo = await fsAsync.stat(filePath);
    const fileName = path.parse(filePath).name;
    try {
      const parts = fileName.split('_');
      const videoDateStr = `${parts[1]}-${fileInfo.atime.getFullYear()} ${parts[2].replace(
        /-/g,
        ':',
      )}`;
      return new Date(videoDateStr);
    } catch (e) {
      this.logger.warn(
        `Could not parse epiphan recording ${fileName} creation date, using current time!`,
      );
      return new Date();
    }
  }

  async ingestPendingRecordings() {
    const devices: string[] = await fsAsync.readdir(this.recordingLocation);
    for (const device of devices) {
      const deviceRecordingLocation = path.resolve(this.recordingLocation, device);
      const videoFiles = await fsAsync.readdir(deviceRecordingLocation);
      const deviceWorkdir = path.resolve(this.workdirLocation, device);
      if (!fs.existsSync(deviceWorkdir)) {
        await fsAsync.mkdir(deviceWorkdir);
      }
      await Promise.all(
        videoFiles.map((vf) => {
          return fse.move(
            path.resolve(deviceRecordingLocation, vf),
            path.resolve(deviceWorkdir, vf),
          );
        }),
      );
      for (const fileName of videoFiles) {
        const filePath = path.resolve(deviceWorkdir, fileName);
        const videoDate = await this.parseRecordingDate(filePath);
        const metadata = await this.createEventMetadata(videoDate, new Date(), device);
        this.client.emit(OPENCAST_INGEST_RECORDINGS, <IngestRecordingJobDto>{
          recordings: [filePath],
          eventMetadata: metadata,
          identifiers: { fileName: fileName, device: device },
          service: EPIPHAN_SERVICE,
        });
      }
    }
  }
}
