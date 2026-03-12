import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export function canonicalizeXML(xml: string): string {
  if (!xml || typeof xml !== 'string') {
    throw new Error('Invalid XML input for canonicalization');
  }

  try {
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

    const doc = parser.parseFromString(xml, 'application/xml');

    if (!doc || !doc.documentElement) {
      throw new Error('Failed to parse XML document');
    }

    const serializer = new XMLSerializer();

    let canonicalXML = serializer.serializeToString(doc);

    // ZATCA normalization
    canonicalXML = canonicalXML.replace(/\r/g, '');
    canonicalXML = canonicalXML.replace(/\n/g, '');
    canonicalXML = canonicalXML.replace(/\t/g, '');

    // remove CR entities
    canonicalXML = canonicalXML.replace(/&#xD;/g, '');

    if (!canonicalXML.includes('<Invoice')) {
      throw new Error('Canonical XML missing Invoice root');
    }

    return canonicalXML;
  } catch (err: any) {
    console.error('Canonicalization failed:', err);

    throw new Error(`XML canonicalization failed: ${err.message}`);
  }
}

export function verifyCanonicalization(xml: string) {
  const canonical = canonicalizeXML(xml);

  if (!canonical.includes('<Invoice')) {
    throw new Error('Canonicalization failed: root element missing');
  }

  if (canonical.includes('\n\n')) {
    console.warn('Warning: multiple newlines detected in canonical XML');
  }

  return canonical;
}
