import { ICreateEventMetadata } from './interfaces/ICreateEventMetadata';

export class IngestRecordingJobDto {
  eventMetadata: ICreateEventMetadata;
  recordings: string[];
  roomSid?: string;
}
