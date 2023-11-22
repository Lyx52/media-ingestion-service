import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateRoomResponse, DeleteRecordingsParams, PlugNmeet } from 'plugnmeet-sdk-js';
import { MongoRepository } from 'typeorm';
import { PlugNMeetRoom } from '../entities/PlugNMeetRoom';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { CreateConferenceDto, RoomExtraData } from '../dto/CreateRoomParameters';
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
  }

  async createConferenceRoom(payload: CreateConferenceDto): Promise<CreateRoomResponse> {
    const response = await this.pnmClient.createRoom(payload);
    if (response.status) {
      let roomInfo: { sid: string } = response.roomInfo;
      if (!roomInfo) {
        const activeRoomRes = await this.pnmClient.getActiveRoomInfo({
          room_id: payload.room_id,
        });
        if (!activeRoomRes.status) {
          this.logger.error('Could not get room info, ingestion wont be available!');
          return response;
        }
        roomInfo = activeRoomRes.room.room_info;
      }
      const entity = this.roomRepository.create();
      entity.roomId = payload.room_id;
      entity.roomSid = roomInfo.sid;
      entity.title = payload.metadata.room_title;
      entity.started = new Date();
      entity.ingested = false;
      try {
        if (payload.metadata.extra_data) {
          const extraData: RoomExtraData = JSON.parse(payload.metadata.extra_data);
          entity.course = extraData.activity.course;
        }
      } catch (e) {
        this.logger.warn(`Failed to parse course ExtraData when creating PlugNMeet Room ${e}`);
      }

      await this.roomRepository.insert(entity);
      this.logger.log(`PlugNMeet room ${entity.roomSid} created!`);
    }
    return response;
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
          started: room.started,
          ended: room.ended,
          title: `PlugNMeet recording ${room.title}`,
          seriesName: room.course ? `Course_Series_${room.course}` : undefined,
        },
      ),
    );
    metadata.location = 'PlugNMeet conference';
    return metadata;
  }

  async removeAndUpdateRooms() {
    const activeRooms = await this.pnmClient.getActiveRoomsInfo();
    if (!activeRooms.status && activeRooms.rooms === undefined) return;
    const activeIds: string[] = activeRooms.rooms
      .filter((rm) => rm.room_info.is_running)
      .map((rm) => rm.room_info.sid);

    // Update rooms which might have ended
    await this.roomRepository.updateMany(
      { roomSid: { $nin: activeIds }, ended: { $exists: false } },
      { $set: { ended: new Date() } },
    );
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
      const recordingIds = recordings.result.recordings_list.map(
        (rec) =>
          <DeleteRecordingsParams>{
            record_id: rec.record_id,
          },
      );
      await Promise.all(recordingIds.map((params) => this.pnmClient.deleteRecordings(params)));
    }

    // Delete any rooms that are already ended AND ingested
    await this.roomRepository.deleteMany({
      ended: { $exists: true },
      ingested: true,
    });
  }

  async ingestJobFinished(data: IngestJobFinishedDto): Promise<void> {
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
