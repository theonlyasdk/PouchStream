package com.asdk.media.pouchstream;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.junit.Test;

import java.util.EnumMap;
import java.util.Map;

import static org.junit.Assert.*;

public class QrCodeGeneratorTest {

    @Test
    public void testQrCodeEncodingGeneratesValidMatrix() throws Exception {
        String testUrl = "http://192.168.1.50:8080";
        int size = 512;

        QRCodeWriter writer = new QRCodeWriter();
        Map<EncodeHintType, Object> hints = new EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.MARGIN, 1);

        BitMatrix bitMatrix = writer.encode(testUrl, BarcodeFormat.QR_CODE, size, size, hints);
        assertNotNull(bitMatrix);
        assertEquals(size, bitMatrix.getWidth());
        assertEquals(size, bitMatrix.getHeight());

        // Count dark and light modules to ensure matrix is not blank
        int darkCount = 0;
        int lightCount = 0;
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                if (bitMatrix.get(x, y)) {
                    darkCount++;
                } else {
                    lightCount++;
                }
            }
        }

        assertTrue("QR code must have dark modules", darkCount > 0);
        assertTrue("QR code must have light modules", lightCount > 0);
    }
}
