import { ICreateEventMetadata } from './interfaces/ICreateEventMetadata';

export class IngestRecordingJobDto {
  eventMetadata: ICreateEventMetadata;
  recordings: string[];
  identifiers?: any;
  service: string;
}
