import { Inject, Injectable, Logger } from '@nestjs/common';
import { ActiveRoomInfo, DeleteRecordingsParams, PlugNmeet } from 'plugnmeet-sdk-js';
import { MongoRepository } from 'typeorm';
import { PlugNMeetRoom } from '../entities/PlugNMeetRoom';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RoomExtraData } from '../dto/CreateRoomParameters';
import {
  OPENCAST_CREATE_DEFAULT_METADATA,
  OPENCAST_INGEST_RECORDINGS,
  PLUG_N_MEET_SERVICE,
} from '../../app.constants';
import { ClientProxy } from '@nestjs/microservices';
import { IngestRecordingJobDto } from '../../common/dto/IngestRecordingJobDto';
import * as path from 'path';
import { ICreateEventMetadata } from '../../common/dto/interfaces/ICreateEventMetadata';
import { IngestJobFinishedDto } from '../../common/dto/IngestJobFinishedDto';
import { CreateDefaultEventMetadataDto } from '../../common/dto/CreateDefaultEventMetadataDto';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class PlugNMeetService {
  private readonly logger = new Logger(PlugNMeetService.name);
  private readonly pnmClient: PlugNmeet;
  private readonly recordingLocation: string;
  private readonly seriesName: string;
  private readonly templateName: string;
  constructor(
    @InjectRepository(PlugNMeetRoom)
    private readonly roomRepository: MongoRepository<PlugNMeetRoom>,
    private readonly config: ConfigService,
    @Inject(PLUG_N_MEET_SERVICE) private readonly client: ClientProxy,
  ) {
    this.pnmClient = new PlugNmeet(
      this.config.getOrThrow<string>('plugnmeet.host'),
      this.config.getOrThrow<string>('plugnmeet.key'),
      this.config.getOrThrow<string>('plugnmeet.secret'),
    );
    this.recordingLocation = this.config.getOrThrow<string>('plugnmeet.recording_location');
    this.seriesName = this.config.getOrThrow<string>('plugnmeet.series_name');
    this.templateName = this.config.getOrThrow<string>('plugnmeet.eventTemplate');
  }

  async createActiveRoomFromInfo(roomInfo: ActiveRoomInfo) {
    const entity = this.roomRepository.create();
    entity.roomId = roomInfo.room_id;
    entity.roomSid = roomInfo.sid;
    entity.title = roomInfo.room_title;
    entity.started = new Date();
    entity.ingested = false;
    try {
      const metadata: any = JSON.parse(roomInfo.metadata);
      if (metadata.extra_data) {
        const extraData: RoomExtraData = JSON.parse(metadata.extra_data);
        entity.course = extraData.activity.course;
      }
    } catch (e) {
      this.logger.warn(`Failed to parse course ExtraData when creating PlugNMeet Room ${e}`);
    }
    await this.roomRepository.insert(entity);
    this.logger.log(`PlugNMeet room ${entity.roomSid} created!`);
  }

  async ingestPendingRecordings() {
    // Search for ended rooms that have yet to be ingested
    const endedRooms = await this.roomRepository.find({
      where: {
        ingested: false,
        ended: { $exists: true },
      },
    });
    if (endedRooms.length <= 0) return;
    const recordings = await this.pnmClient.fetchRecordings({
      room_ids: endedRooms.map((r) => r.roomId),
    });
    if (recordings.msg == 'no recordings found') {
      // None of the rooms have recordings!
      await this.roomRepository.updateMany(
        {
          roomSid: { $in: endedRooms.map((r) => r.roomSid) },
        },
        {
          $set: { ingested: true },
        },
      );
      return;
    }
    if (!recordings.status || !recordings.result) {
      this.logger.warn(`Failed to fetch PlugNMeet room recordings!`);
      return;
    }
    const noRecordingIds = [];
    for (const room of endedRooms) {
      const roomRecordings = recordings.result.recordings_list.filter(
        (rec) => rec.room_sid.split('-')[0] === room.roomSid,
      );
      this.logger.verbose(
        `Created jobs for PlugNMeet room recordings {${roomRecordings
          .map((r) => r.record_id)
          .join(',')}}`,
      );
      if (roomRecordings.length <= 0) {
        noRecordingIds.push(room.roomSid);
        continue;
      }
      const metadata = await this.createEventMetadata(room);
      this.client.emit(OPENCAST_INGEST_RECORDINGS, <IngestRecordingJobDto>{
        recordings: roomRecordings.map((rec) =>
          path.resolve(this.recordingLocation, rec.file_path),
        ),
        eventMetadata: metadata,
        identifiers: room.roomSid,
        service: PLUG_N_MEET_SERVICE,
      });
    }
    await this.roomRepository.updateMany(
      {
        roomSid: { $in: noRecordingIds },
      },
      {
        $set: { ingested: true },
      },
    );
  }

  async createEventMetadata(room: PlugNMeetRoom): Promise<ICreateEventMetadata> {
    const metadata = await firstValueFrom(
      this.client.send<ICreateEventMetadata, CreateDefaultEventMetadataDto>(
        OPENCAST_CREATE_DEFAULT_METADATA,
        {
          templateName: this.templateName,
          started: room.started,
          ended: room.ended,
          title: `PlugNMeet recording ${room.title}`,
          seriesName: room.course ? `Course_Series_${room.course}` : this.seriesName,
        },
      ),
    );
    metadata.location = 'PlugNMeet conference';
    return metadata;
  }

  async syncActiveRooms() {
    const activeRooms = await this.pnmClient.getActiveRoomsInfo();
    if (!activeRooms.status && activeRooms.rooms === undefined) return;
    const activeIds: string[] = activeRooms.rooms
      .filter((rm) => rm.room_info.is_running)
      .map((rm) => rm.room_info.sid);

    // Get all rooms that are active
    const rooms = await this.roomRepository.find({
      where: {
        roomSid: { $in: activeIds },
      },
    });
    const activeExistingSids = rooms.map((r) => r.roomSid);

    // First update any rooms that were active but are no longer
    await this.roomRepository.updateMany(
      {
        roomSid: { $nin: activeExistingSids },
      },
      { $set: { ended: new Date() } },
    );

    // Create all rooms that don't exist
    const newRooms = activeRooms.rooms.filter(
      (r) => !activeExistingSids.some((sid) => sid === r.room_info.sid),
    );
    await Promise.all(newRooms.map((r) => this.createActiveRoomFromInfo(r.room_info)));
  }

  async deleteOldRooms() {
    const rooms = await this.roomRepository.find({
      where: {
        ended: { $exists: true },
        ingested: true,
      },
    });
    if (rooms.length <= 0) return;
    // Delete recordings
    const roomIds = rooms.map((r) => r.roomId);
    const recordings = await this.pnmClient.fetchRecordings({
      room_ids: roomIds,
    });
    if (recordings.status) {
      const recordingIds = recordings.result.recordings_list.map((rec) => rec.record_id);
      this.logger.log(`PlugNMeet room recordings {${recordingIds.join(',')}} deleted!`);
      await Promise.all(
        recordingIds.map((id) =>
          this.pnmClient.deleteRecordings(<DeleteRecordingsParams>{
            record_id: id,
          }),
        ),
      );
    }
    const roomSids = rooms.map((r) => r.roomSid);
    this.logger.log(`PlugNMeet rooms {${roomSids.join(',')}} deleted!`);
    await this.roomRepository.deleteMany({
      roomSid: { $in: roomSids },
    });
  }

  async ingestJobFinished(data: IngestJobFinishedDto): Promise<void> {
    if (data.service !== PLUG_N_MEET_SERVICE) return;
    if (data.identifiers) {
      await this.roomRepository.updateMany(
        {
          roomSid: data.identifiers,
        },
        {
          $set: { ingested: true },
        },
      );
      return;
    }
    this.logger.warn(`No roomSid provided for event ${data.eventId}!`);
  }
}
