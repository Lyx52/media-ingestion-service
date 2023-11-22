import { IProcessingConfiguration } from './IProcessingConfiguration';

export interface ICreateEventMetadata {
  title: string;
  subjects: string[];
  description: string;
  location: string;
  lang: string;
  license: string;
  seriesId: string;
  rights: string;
  contributors: string[];
  creators: string[];
  publishers: string[];
  started: Date;
  ended: Date;
  processing: IProcessingConfiguration;
}
