import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export function canonicalizeXML(xml: string): string {
  if (!xml || typeof xml !== 'string') {
    throw new Error('Invalid XML input for canonicalization');
  }

  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg) => {
        throw new Error(`XML parse error: ${msg}`);
      },
      fatalError: (msg) => {
        throw new Error(`XML fatal error: ${msg}`);
      },
    },
  });

  const doc = parser.parseFromString(xml, 'text/xml');

  if (!doc || !doc.documentElement) {
    throw new Error('Failed to parse XML');
  }

  const serializer = new XMLSerializer();

  let canonical = serializer.serializeToString(doc);

  /*
  Normalize like C# implementation
  */

  canonical = canonical
    .replace(/^\uFEFF/, '') // remove BOM
    .replace(/\r/g, '')
    .replace(/\n/g, '')
    .replace(/\t/g, '')
    .replace(/>\s+</g, '><') // collapse whitespace
    .trim();

  if (!canonical.includes('<Invoice')) {
    throw new Error('Canonical XML missing Invoice root');
  }

  return canonical;
}
