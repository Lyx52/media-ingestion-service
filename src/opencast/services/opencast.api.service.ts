import { Queue } from 'bull';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Readable } from 'stream';
import { AttachmentType } from '../dto/enums/AttachmentType';
import { File, FormData } from 'formdata-node';
import { FormDataEncoder } from 'form-data-encoder';
import { fileFromPath } from 'formdata-node/file-from-path';
import fetch, { HeadersInit, RequestInit } from 'node-fetch';
@Injectable()
export class OpencastApiService implements OnModuleInit {
  private readonly logger: Logger = new Logger(OpencastApiService.name);
  private readonly host: string;
  private readonly password: string;
  private readonly username: string;

  constructor(
    private readonly config: ConfigService,
    @InjectQueue('video') private ingestQueue: Queue,
  ) {
    this.host = this.config.getOrThrow<string>('opencast.host');
    this.password = this.config.getOrThrow<string>('opencast.password');
    this.username = this.config.getOrThrow<string>('opencast.username');
  }

  async onModuleInit() {}
  private getAuthHeader(roles: string[] = []): Headers {
    const headers = new Headers();
    headers.append(
      'Authorization',
      `Basic ${Buffer.from(`${this.username}:${this.password}`).toString(
        'base64',
      )}`,
    );
    headers.append('X-API-AS-USER', this.username);
    if (roles.length > 0) {
      headers.append('X-RUN-WITH-ROLES', roles.join(','));
    }
    return headers;
  }

  private getOptions(
    method: string,
    headers: Headers,
    formData: any = undefined,
  ): RequestInit {
    return {
      headers: headers as unknown as HeadersInit,
      body: formData,
      method: method,
      size: 0,
    } as RequestInit;
  }

  async createMediaPackage(): Promise<string> {
    const headers = this.getAuthHeader();
    const res = await fetch(
      `${this.host}/ingest/createMediaPackage`,
      this.getOptions('GET', headers),
    );
    const content = await res.text();
    if (res.ok) {
      return content;
    }

    throw Error(
      `Failed to create media package, request failed with status code ${
        res.status
      }, ${content || ''}`,
    );
  }
  async addDCCatalog(mediaPackage: string, dublinCore: string, flavor: string) {
    const dc = new File([dublinCore], 'dublincore-episode.xml');
    return this.addFile(mediaPackage, dc, flavor, AttachmentType.CATALOG);
  }

  async addTrack(mediaPackage: string, filePath: string, flavor: string) {
    const track = await fileFromPath(filePath);
    return this.addFile(mediaPackage, track, flavor, AttachmentType.TRACK);
  }

  async addAttachment(
    mediaPackage: string,
    attachmentXML: string,
    flavor: string,
  ) {
    const attachment = new File([attachmentXML], 'attachment.xml');
    return this.addFile(
      mediaPackage,
      attachment,
      flavor,
      AttachmentType.ATTACHMENT,
    );
  }

  private async addFile(
    mediaPackage: string,
    attachment: File,
    flavor: string,
    type: AttachmentType,
  ): Promise<string> {
    const headers = this.getAuthHeader();
    const formData = new FormData();
    formData.append('mediaPackage', mediaPackage);
    formData.append('flavor', flavor);
    formData.append('BODY1', attachment, attachment.name);

    const encoder = new FormDataEncoder(formData, {
      enableAdditionalHeaders: true,
    });

    headers.append('Content-Type', encoder.contentType + '; charset=utf-8;');
    if (encoder.contentLength) {
      headers.append('Content-Length', encoder.contentLength);
    }
    let url = this.host;
    switch (type) {
      case AttachmentType.ATTACHMENT:
        url += '/ingest/addAttachment';
        break;
      case AttachmentType.CATALOG:
        url += '/ingest/addCatalog';
        break;
      case AttachmentType.TRACK:
        url += '/ingest/addTrack';
        break;
    }
    const res = await fetch(
      url,
      this.getOptions('POST', headers, Readable.from(encoder)),
    );
    const content = await res.text();
    if (res.ok) {
      return content;
    }
    throw Error(
      `Failed to add ${type} to media package, request failed with status code ${
        res.status
      }, ${content || ''}`,
    );
  }

  async ingest(
    mediaPackage: string,
    workflowDefinitionId: string = '',
    workflowInstanceId: string = '',
  ): Promise<boolean> {
    const headers = this.getAuthHeader();
    const formData = new FormData();
    formData.append('mediaPackage', mediaPackage);
    formData.append('workflowDefinitionId', workflowDefinitionId);
    formData.append('workflowInstanceId', workflowInstanceId);

    const encoder = new FormDataEncoder(formData, {
      enableAdditionalHeaders: true,
    });

    headers.append('Content-Type', encoder.contentType);
    if (encoder.contentLength) {
      headers.append('Content-Length', encoder.contentLength);
    }

    const res = await fetch(
      `${this.host}/ingest/ingest`,
      this.getOptions('POST', headers, Readable.from(encoder)),
    );
    return res.ok;
  }
  //
  // async createEventMultiRequest(data: ICreateEventMetadata): Promise<string> {
  //   let mediaPackage = await this.createMediaPackage();
  //
  //   // Add episode catalog metadata
  //   const dcCatalogXML = generateEpisodeCatalogXML(data);
  //   mediaPackage = await this.addDCCatalog(
  //     mediaPackage,
  //     dcCatalogXML,
  //     'dublincore/episode',
  //   );
  //
  //   // Add video track
  //   mediaPackage = await this.addTrack(
  //     mediaPackage,
  //     data.filePath,
  //     'presentation/source',
  //   );
  //
  //   // Add ACL
  //   const mediaPackageId = getMediaPackageId(mediaPackage);
  //   let aclXML = '';
  //   if (data.custom_acl_config) {
  //     aclXML = generateAclXML(data.custom_acl_config, mediaPackageId);
  //   } else if (data.aclName) {
  //     const aclTemplate = await this.getAccessListTemplate(data.aclName);
  //     aclXML = generateAclXML(aclTemplate.acl.ace, mediaPackageId);
  //   } else {
  //     throw new Error(
  //       'Neither ACL Template nor Custom template is configured!',
  //     );
  //   }
  //
  //   mediaPackage = await this.addAttachment(
  //     mediaPackage,
  //     aclXML,
  //     'security/xacml+episode',
  //   );
  //   await this.ingest(mediaPackage, 'schedule-and-upload');
  //
  //   return mediaPackageId;
  // }
  //
  // async createEvent(data: ICreateEventMetadata): Promise<string> {
  //   let acl = '';
  //   if (data.custom_acl_config) {
  //     acl = JSON.stringify(data.custom_acl_config);
  //   } else if (data.aclName) {
  //     const aclTemplate = await this.getAccessListTemplate(data.aclName);
  //     acl = JSON.stringify(aclTemplate.acl.ace);
  //   } else {
  //     throw new Error(
  //       'Neither ACL Template nor Custom template is configured!',
  //     );
  //   }
  //   const videoFile = await fileFromPath(data.filePath);
  //
  //   const metadata = JSON.stringify(generateEventMetadataJson(data));
  //   const processing = JSON.stringify(data.processing);
  //
  //   const formData = new FormData();
  //   formData.append('acl', acl);
  //   formData.append('metadata', metadata);
  //   formData.append('processing', processing);
  //   formData.append('presentation', videoFile);
  //
  //   const encoder = new FormDataEncoder(formData, {
  //     enableAdditionalHeaders: true,
  //   });
  //
  //   const headers = this.getAuthHeader();
  //   headers.append('Content-Type', encoder.contentType);
  //   if (encoder.contentLength) {
  //     headers.append('Content-Length', encoder.contentLength);
  //   }
  //   const res = await fetch(
  //     `${this.host}/api/events`,
  //     this.getOptions('POST', headers, Readable.from(encoder)),
  //   );
  //   if (res.ok) {
  //     const createData: any = await res.json();
  //     return createData.identifier;
  //   }
  //   const resText = await res.text();
  //   throw Error(
  //     `Failed to create event, request failed with status code ${res.status}, ${
  //       resText || ''
  //     }`,
  //   );
  // }

  async getAccessListTemplate(name: string): Promise<any> {
    const ACLs = await this.getAccessListTemplates();
    return ACLs.find(
      (acl: any) => acl.name.toLowerCase() === name.toLowerCase(),
    );
  }

  async getAccessListTemplates(): Promise<any> {
    const headers = this.getAuthHeader();
    headers.append('Content-Type', 'application/json');
    const res = await fetch(
      `${this.host}/acl-manager/acl/acls.json`,
      this.getOptions('GET', headers),
    );
    if (res.ok) {
      return await res.json();
    }
    throw Error(
      `Failed to get ACLs, request failed with status code ${res.status}!`,
    );
  }

  async getSeries(title: string): Promise<any | undefined> {
    const headers = this.getAuthHeader();
    headers.append('Content-Type', 'application/x-www-form-urlencoded');
    const res = await fetch(
      `${this.host}/api/series/series.json?seriesTitle=${title}`,
      this.getOptions('GET', headers),
    );
    if (res.ok) {
      const series: any = await res.json();
      if (series.length > 0) return series[0];
      return undefined;
    }
    throw Error(
      `Failed to get series ${title}, request failed with status code ${res.status}!`,
    );
  }
}
