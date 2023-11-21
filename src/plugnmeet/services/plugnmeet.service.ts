import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreateRoomResponse, PlugNmeet } from 'plugnmeet-sdk-js';
import { MongoRepository } from 'typeorm';
import { PlugNMeetRoom } from '../entities/PlugNMeetRoom';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  CreateConferenceDto,
  RoomExtraData,
} from '../dto/CreateRoomParameters';
import {
  OPENCAST_INGEST_RECORDINGS,
  PLUG_N_MEET_SERVICE,
} from '../../app.constants';
import { ClientProxy } from '@nestjs/microservices';
import { IngestRecordingJobDto } from '../../common/dto/IngestRecordingJobDto';
import * as path from 'path';
import { ICreateEventMetadata } from '../../common/dto/interfaces/ICreateEventMetadata';
import { IngestJobFinishedDto } from '../../common/dto/IngestJobFinishedDto';

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
    this.recordingLocation = this.config.getOrThrow<string>(
      'plugnmeet.recording_location',
    );
  }

  async createConferenceRoom(
    payload: CreateConferenceDto,
  ): Promise<CreateRoomResponse> {
    const response = await this.pnmClient.createRoom(payload);
    if (response.status && response.roomInfo) {
      const entity = this.roomRepository.create();
      entity.roomId = payload.room_id;
      entity.roomSid = response.roomInfo.sid;
      entity.title = payload.metadata.room_title;
      entity.started = new Date();
      entity.ingested = false;
      try {
        if (payload.metadata.extra_data) {
          const extraData: RoomExtraData = JSON.parse(
            payload.metadata.extra_data,
          );
          entity.course = extraData.activity.course;
        }
      } catch (e) {
        this.logger.warn(
          `Failed to parse course ExtraData when creating PlugNMeet Room ${e}`,
        );
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
    const recordings = await this.pnmClient.fetchRecordings({
      room_ids: endedRooms.map((r) => r.roomId),
    });

    if (recordings.status || !recordings.result) {
      this.logger.warn(`Failed to fetch PlugNMeet room recordings!`);
      return;
    }

    for (const room of endedRooms) {
      const roomRecordings = recordings.result.recordings_list.filter(
        (rec) => rec.room_sid === room.roomSid,
      );
      if (roomRecordings.length <= 0) continue;
      const metadata = await this.createEventMetadata(room);
      this.client.emit(OPENCAST_INGEST_RECORDINGS, <IngestRecordingJobDto>{
        recordings: roomRecordings.map((rec) =>
          path.resolve(this.recordingLocation, rec.file_path),
        ),
        eventMetadata: metadata,
        roomSid: room.roomSid,
      });
    }
  }

  async createEventMetadata(
    room: PlugNMeetRoom,
  ): Promise<ICreateEventMetadata> {
    this.logger.debug(room);
    return {} as ICreateEventMetadata;
  }

  async removeAndUpdateRooms() {
    const rooms = await this.pnmClient.getActiveRoomsInfo();
    if (!rooms.status && rooms.rooms === undefined) return;
    const activeIds: string[] = rooms.rooms
      .filter((rm) => rm.room_info.is_running)
      .map((rm) => rm.room_info.sid);

    // Update rooms which might have ended
    await this.roomRepository.updateMany(
      { roomSid: { $nin: activeIds }, ended: { $exists: false } },
      { $set: { ended: new Date() } },
    );

    // Delete any rooms that are already ended AND ingested
    await this.roomRepository.deleteMany({
      ended: { $exists: true },
      ingested: true,
    });
  }

  async ingestJobFinished(data: IngestJobFinishedDto): Promise<void> {
    if (data.roomSid) {
      await this.roomRepository.updateOne(
        {
          where: { roomSid: data.roomSid },
        },
        {
          $set: { ingested: true },
        },
      );
    }
    this.logger.warn(`No roomSid provided for event ${data.eventId}!`);
  }
}
