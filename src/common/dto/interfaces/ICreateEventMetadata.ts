import { IProcessingConfiguration } from './IProcessingConfiguration';

export interface ICreateEventMetadata {
  readonly title: string;
  readonly subjects: string[];
  readonly description: string;
  readonly location: string;
  readonly lang: string;
  readonly license: string;
  readonly seriesId: string;
  readonly rights: string;
  readonly contributors: string[];
  readonly creators: string[];
  readonly publishers: string[];
  readonly started: Date;
  readonly ended: Date;
  readonly processing: IProcessingConfiguration;
}
