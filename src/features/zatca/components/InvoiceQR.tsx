import React from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

interface InvoiceQRProps {
  qrData: string;
  size?: number;
}

export function InvoiceQR({ qrData, size = 200 }: InvoiceQRProps) {
  // ZATCA requires the QR data to be base64-encoded before rendering
  const base64QR = btoa(qrData);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <QRCode value={base64QR} size={size} />
    </View>
  );
}
