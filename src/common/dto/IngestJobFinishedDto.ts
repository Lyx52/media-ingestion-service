export class IngestJobFinishedDto {
  eventId?: string;
  msg?: string;
  identifiers?: any;
  success: boolean;
  service: string;
}
