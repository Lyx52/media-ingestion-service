import { OpencastApiService } from '../services/opencast.api.service';
import { ICreateEventMetadata } from '../../common/dto/interfaces/ICreateEventMetadata';
import { generateAclXML, generateEpisodeCatalogXML, getMediaPackageId } from '../../common/utils';

export class Event {
  private mediaPackage: string;
  public eventId?: string | undefined;
  private readonly tracks: string[];
  constructor(private readonly opencastApi: OpencastApiService) {
    this.tracks = [];
  }

  async createMediaPackage(): Promise<Event> {
    this.mediaPackage = await this.opencastApi.createMediaPackage();
    this.eventId = getMediaPackageId(this.mediaPackage);
    return this;
  }

  async addEventMetadata(metadata: ICreateEventMetadata): Promise<Event> {
    const dcCatalogXML = generateEpisodeCatalogXML(metadata);
    this.mediaPackage = await this.opencastApi.addDCCatalog(
      this.mediaPackage,
      dcCatalogXML,
      'dublincore/episode',
    );
    return this;
  }

  async addAclFromRoles(config: any[]): Promise<Event> {
    if (!config || config.length <= 0)
      throw new Error('Cannot create event because ACL is not configured!');
    const aclXML = generateAclXML(config, this.eventId);
    this.mediaPackage = await this.opencastApi.addAttachment(
      this.mediaPackage,
      aclXML,
      'security/xacml+episode',
    );
    return this;
  }

  async addAclFromName(aclName: string): Promise<Event> {
    if (!aclName) throw new Error('Cannot create event because ACL is not configured!');
    const aclTemplate = await this.opencastApi.getAccessListTemplate(aclName);
    const aclXML = generateAclXML(aclTemplate.acl.ace, this.eventId);
    this.mediaPackage = await this.opencastApi.addAttachment(
      this.mediaPackage,
      aclXML,
      'security/xacml+episode',
    );
    return this;
  }

  public addTrack(track: string) {
    this.tracks.push(track);
  }

  async ingest(workflow: string): Promise<boolean> {
    if (this.tracks.length <= 0)
      throw new Error("Ingest job failed because couldn't add any tracks!");
    const flavor = this.tracks.length > 1 ? 'presentation-%d/source' : 'presentation/source';
    for (let i = 0; i < this.tracks.length; i++) {
      this.mediaPackage = await this.opencastApi.addTrack(
        this.mediaPackage,
        this.tracks[i],
        flavor.replace('%d', i.toString()),
      );
    }
    return this.opencastApi.ingest(this.mediaPackage, workflow);
  }
}
