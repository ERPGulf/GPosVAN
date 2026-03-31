/**
 * ZATCA Invoice File Storage Service
 *
 * Persists signed invoice XML and QR data as files in the app's document directory,
 * named by invoice UUID. These files can later be read and sent to the backend API.
 *
 * Directory structure:
 *   {documentDirectory}/zatca-invoices/{invoiceUUID}.xml
 *   {documentDirectory}/zatca-invoices/{invoiceUUID}.qr
 */
import * as FileSystem from 'expo-file-system/legacy';
import { zatcaLogger } from './zatcaLogger';

const INVOICES_DIR_NAME = 'zatca-invoices';

/**
 * Returns the base directory path for stored ZATCA invoices.
 * Creates the directory if it doesn't already exist.
 */
async function getInvoicesDir(): Promise<string> {
  const baseDir = FileSystem.documentDirectory;
  if (!baseDir) {
    throw new Error('FileSystem.documentDirectory is not available');
  }

  const dirUri = `${baseDir}${INVOICES_DIR_NAME}/`;
  const dirInfo = await FileSystem.getInfoAsync(dirUri);
  if (!dirInfo.exists) {
    zatcaLogger.info('Creating zatca-invoices directory', { dirUri });
    await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
  }

  return dirUri;
}

/**
 * Save the signed invoice XML and QR PNG image to the local filesystem.
 *
 * @param invoiceUUID  - Unique identifier used as the file name
 * @param xml          - The fully-signed ZATCA invoice XML string
 * @param qrPngBase64  - The QR code image as a base64-encoded PNG string (no data: prefix)
 * @returns Paths to the saved files
 */
export async function saveInvoiceFiles(
  invoiceUUID: string,
  xml: string,
  qrPngBase64: string,
): Promise<{ xmlPath: string; qrPngPath: string }> {
  const startedAt = Date.now();

  zatcaLogger.info('saveInvoiceFiles: starting', {
    invoiceUUID,
    xmlLength: xml.length,
    qrPngBase64Length: qrPngBase64.length,
  });

  try {
    const dir = await getInvoicesDir();
    const xmlPath = `${dir}${invoiceUUID}.xml`;
    const qrPngPath = `${dir}${invoiceUUID}.png`;

    // Write XML file (UTF-8 text)
    await FileSystem.writeAsStringAsync(xmlPath, xml, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    zatcaLogger.debug('saveInvoiceFiles: XML file written', {
      invoiceUUID,
      xmlPath,
      xmlLength: xml.length,
    });

    // Write QR PNG file (binary from base64)
    await FileSystem.writeAsStringAsync(qrPngPath, qrPngBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    zatcaLogger.debug('saveInvoiceFiles: QR PNG file written', {
      invoiceUUID,
      qrPngPath,
      qrPngBase64Length: qrPngBase64.length,
    });

    const durationMs = Date.now() - startedAt;
    zatcaLogger.info('saveInvoiceFiles: completed', {
      invoiceUUID,
      xmlPath,
      qrPngPath,
      durationMs,
    });

    return { xmlPath, qrPngPath };
  } catch (error) {
    zatcaLogger.error('saveInvoiceFiles: failed', error, {
      invoiceUUID,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

/**
 * List all saved invoice UUIDs (based on .xml files in the directory).
 */
export async function listSavedInvoiceUUIDs(): Promise<string[]> {
  try {
    const dir = await getInvoicesDir();
    const files = await FileSystem.readDirectoryAsync(dir);
    const uuids = files
      .filter((f) => f.endsWith('.xml'))
      .map((f) => f.replace('.xml', ''));

    zatcaLogger.info('listSavedInvoiceUUIDs: found invoices', { count: uuids.length });
    return uuids;
  } catch (error) {
    zatcaLogger.error('listSavedInvoiceUUIDs: failed', error);
    return [];
  }
}

/**
 * Read a saved invoice's XML and QR PNG by its UUID.
 *
 * @returns null if the files don't exist
 */
export async function readInvoiceFiles(
  invoiceUUID: string,
): Promise<{ xml: string; qrPngBase64: string } | null> {
  try {
    const dir = await getInvoicesDir();
    const xmlPath = `${dir}${invoiceUUID}.xml`;
    const qrPngPath = `${dir}${invoiceUUID}.png`;

    const [xmlInfo, qrInfo] = await Promise.all([
      FileSystem.getInfoAsync(xmlPath),
      FileSystem.getInfoAsync(qrPngPath),
    ]);

    if (!xmlInfo.exists || !qrInfo.exists) {
      zatcaLogger.debug('readInvoiceFiles: files not found', { invoiceUUID });
      return null;
    }

    const [xml, qrPngBase64] = await Promise.all([
      FileSystem.readAsStringAsync(xmlPath, { encoding: FileSystem.EncodingType.UTF8 }),
      FileSystem.readAsStringAsync(qrPngPath, { encoding: FileSystem.EncodingType.Base64 }),
    ]);

    zatcaLogger.debug('readInvoiceFiles: loaded', {
      invoiceUUID,
      xmlLength: xml.length,
      qrPngBase64Length: qrPngBase64.length,
    });

    return { xml, qrPngBase64 };
  } catch (error) {
    zatcaLogger.error('readInvoiceFiles: failed', error, { invoiceUUID });
    return null;
  }
}

/**
 * Delete a saved invoice's files after successful API submission.
 */
export async function deleteInvoiceFiles(invoiceUUID: string): Promise<void> {
  try {
    const dir = await getInvoicesDir();
    const xmlPath = `${dir}${invoiceUUID}.xml`;
    const qrPngPath = `${dir}${invoiceUUID}.png`;

    const [xmlInfo, qrInfo] = await Promise.all([
      FileSystem.getInfoAsync(xmlPath),
      FileSystem.getInfoAsync(qrPngPath),
    ]);

    if (xmlInfo.exists) await FileSystem.deleteAsync(xmlPath);
    if (qrInfo.exists) await FileSystem.deleteAsync(qrPngPath);

    zatcaLogger.info('deleteInvoiceFiles: removed', { invoiceUUID });
  } catch (error) {
    zatcaLogger.error('deleteInvoiceFiles: failed', error, { invoiceUUID });
    throw error;
  }
}
