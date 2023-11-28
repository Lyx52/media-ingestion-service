import { create } from 'xmlbuilder2';
import { XMLBuilder } from 'xmlbuilder2/lib/interfaces';
import { NamedNodeMap } from '@oozcitak/dom/lib/dom/interfaces';
import { ICreateEventMetadata } from './dto/interfaces/ICreateEventMetadata';
export const concatDefinedArrays = (...arrays: any[]): any[] => {
  let result = [];
  arrays
    .filter((arr) => arr && Array.isArray(arr))
    .forEach((arr) => {
      result = result.concat(arr);
    });
  return result;
};
export const generateEventMetadataJson = (data: ICreateEventMetadata): any => {
  return [
    {
      flavor: 'dublincore/episode',
      fields: [
        {
          id: 'title',
          value: data.title,
        },
        {
          id: 'subjects',
          value: data.subjects,
        },
        {
          id: 'description',
          value: data.description,
        },
        {
          id: 'language',
          value: data.lang,
        },
        {
          id: 'rightsHolder',
          value: data.rights,
        },
        {
          id: 'license',
          value: data.license,
        },
        {
          id: 'isPartOf',
          value: data.seriesId,
        },
        {
          id: 'creator',
          value: data.creators,
        },
        {
          id: 'contributor',
          value: data.contributors,
        },
        {
          id: 'publisher',
          value: data.publishers,
        },
        {
          id: 'startDate',
          value: data.started.toISOString(),
        },
        {
          id: 'startTime',
          value: data.started.toTimeString(),
        },
      ],
    },
  ];
};

export const generateEventMetadataObject = (data: ICreateEventMetadata): any => {
  return {
    created: data.started,
    temporal: {
      start: data.started,
      end: data.ended,
      scheme: 'W3C-DTF',
    },
    isPartOf: data.seriesId,
    language: data.lang,
    spatial: data.location,
    title: data.title,
    subjects: data.subjects,
    description: data.description,
    publishers: data.publishers,
    creators: data.creators,
    contributors: data.contributors,
    rightsHolder: data.rights,
    license: data.license,
  };
};

export const getAttributeByName = (documentNode: XMLBuilder, name: string): string | undefined => {
  const attribs: NamedNodeMap = (documentNode?.node as any)?._attributeList;
  const attrib = attribs?.getNamedItem(name);
  return attrib?.value;
};

export const getMediaPackageId = (mediaPackage: string): string => {
  const document = create(mediaPackage);
  return getAttributeByName(document.root(), 'id') || '';
};

export const generateAclXML = (roles: any[], mediaPackageId: string): string => {
  const document = create({ version: '1.0', encoding: 'UTF-8' });
  const root = document.ele('dublincore', {
    PolicyId: mediaPackageId || 'mediapackage-1',
    Version: '2.0',
    RuleCombiningAlgId: 'urn:oasis:names:tc:xacml:1.0:rule-combining-algorithm:permit-overrides',
    xmlns: 'urn:oasis:names:tc:xacml:2.0:policy:schema:os',
  });

  roles.forEach((acl) => {
    const rule = root.ele('Rule', {
      RuleId: `${acl.role}_${acl.action}_PERMIT`,
      Effect: 'Permit',
    });

    // Build actions
    rule
      .ele('Target')
      .ele('Actions')
      .ele('Action')
      .ele('ActionMatch', {
        MatchId: 'urn:oasis:names:tc:xacml:1.0:function:string-equal',
      })
      .ele('ActionValue', {
        DataType: 'http://www.w3.org/2001/XMLSchema#string',
      })
      .txt(acl.action)
      .up()
      .ele('ActionAttributeDesignator', {
        AttributeId: 'urn:oasis:names:tc:xacml:1.0:action:action-id',
        DataType: 'http://www.w3.org/2001/XMLSchema#string',
      })
      .txt(acl.action);

    // Build condition
    rule
      .ele('Condition')
      .ele('Apply', {
        FunctionId: 'urn:oasis:names:tc:xacml:1.0:function:string-is-in',
      })
      .ele('AttributeValue', {
        DataType: 'http://www.w3.org/2001/XMLSchema#string',
      })
      .txt(acl.role)
      .up()
      .ele('SubjectAttributeDesignator', {
        AttributeId: 'urn:oasis:names:tc:xacml:2.0:subject:role',
        DataType: 'http://www.w3.org/2001/XMLSchema#string',
      });
  });

  // Add Deny rule
  root.ele('Rule', {
    RuleId: 'DenyRule',
    Effect: 'Deny',
  });
  return document.end({ prettyPrint: true, allowEmptyTags: true }).toString();
};

export const generateEpisodeCatalogXML = (data: ICreateEventMetadata): string => {
  const document = create({
    version: '1.0',
    encoding: 'UTF-8',
    standalone: 'no',
  });

  const root = document.ele('dublincore', {
    xmlns: 'http://www.opencastproject.org/xsd/1.0/dublincore/',
    'xmlns:terms': 'http://purl.org/dc/terms/',
    'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
  });
  Object.entries(generateEventMetadataObject(data)).forEach(([key, value]) => {
    switch (key) {
      case 'duration':
      case 'extent':
        root
          .ele('terms:extent', {
            'xsi:type': 'terms:ISO8601',
          })
          .txt(value instanceof Date ? value.toISOString() : (value as string));
        break;
      case 'startDate':
      case 'temporal':
        let contents = '';
        if (value instanceof Object) {
          Object.entries(value as object).forEach(([subKey, subValue]) => {
            contents += `${subKey}=${
              subValue instanceof Date ? subValue.toISOString() : subValue
            }; `;
          });
        } else {
          contents += value instanceof Date ? value.toISOString() : value;
        }
        root
          .ele('terms:temporal', {
            'xsi:type': 'terms:Period',
          })
          .txt(contents);
        break;
      default:
        const term = root.ele(`terms:${key}`);
        if (value instanceof Date) term.txt(value.toISOString());
        else if (value instanceof Array) term.txt(value.join(','));
        else term.txt(value as string);
        break;
    }
  });
  return document.end({ allowEmptyTags: true }).toString();
};
