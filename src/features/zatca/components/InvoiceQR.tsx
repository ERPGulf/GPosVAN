import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface InvoiceQRProps {
  qrData: string;
  size?: number;
}

export function InvoiceQR({ qrData, size = 200 }: InvoiceQRProps) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* qrData is already the base64 TLV string and should be encoded as-is in the QR */}
      <QRCode value={qrData} size={size} />
    </View>
  );
}
