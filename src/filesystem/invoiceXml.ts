import { File, Directory, Paths } from 'expo-file-system';

export async function saveInvoiceXML(invoiceNumber: string, xml: string): Promise<string> {
  const invoicesDir = new Directory(Paths.document, 'invoices');

  if (!(await invoicesDir.exists)) {
    await invoicesDir.create();
  }

  const file = new File(invoicesDir, `${invoiceNumber}.xml`);

  if (await file.exists) {
    await file.delete();
  }

  await file.write(xml);

  return file.uri;
}
