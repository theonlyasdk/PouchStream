package com.asdk.media.pouchstream;

import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.io.IOException;

import static org.junit.Assert.*;

public class BoundedInputStreamTest {

    @Test
    public void testReadSingleBytesBounded() throws IOException {
        byte[] data = "Hello World! Bounded Stream Test.".getBytes();
        ByteArrayInputStream bais = new ByteArrayInputStream(data);
        BoundedInputStream bis = new BoundedInputStream(bais, 5);

        assertEquals('H', bis.read());
        assertEquals('e', bis.read());
        assertEquals('l', bis.read());
        assertEquals('l', bis.read());
        assertEquals('o', bis.read());
        assertEquals(-1, bis.read());
        assertEquals(-1, bis.read());
    }

    @Test
    public void testReadByteArrayBounded() throws IOException {
        byte[] data = "0123456789ABCDEF".getBytes();
        ByteArrayInputStream bais = new ByteArrayInputStream(data);
        BoundedInputStream bis = new BoundedInputStream(bais, 10);

        byte[] buf = new byte[8];
        int read1 = bis.read(buf, 0, 8);
        assertEquals(8, read1);
        assertEquals("01234567", new String(buf, 0, read1));

        int read2 = bis.read(buf, 0, 8);
        assertEquals(2, read2);
        assertEquals("89", new String(buf, 0, read2));

        int read3 = bis.read(buf, 0, 8);
        assertEquals(-1, read3);
    }

    @Test
    public void testReadZeroBytesReturnsZero() throws IOException {
        byte[] data = "TestData".getBytes();
        ByteArrayInputStream bais = new ByteArrayInputStream(data);
        BoundedInputStream bis = new BoundedInputStream(bais, 0);

        byte[] buf = new byte[4];
        assertEquals(0, bis.read(buf, 0, 0));
        assertEquals(-1, bis.read(buf, 0, 4));
    }

    @Test
    public void testSkipWithinBounds() throws IOException {
        byte[] data = "0123456789".getBytes();
        ByteArrayInputStream bais = new ByteArrayInputStream(data);
        BoundedInputStream bis = new BoundedInputStream(bais, 7);

        long skipped = bis.skip(4);
        assertEquals(4, skipped);
        assertEquals('4', bis.read());
        assertEquals('5', bis.read());
        assertEquals('6', bis.read());
        assertEquals(-1, bis.read());
    }

    @Test
    public void testSkipExceedingBounds() throws IOException {
        byte[] data = "0123456789".getBytes();
        ByteArrayInputStream bais = new ByteArrayInputStream(data);
        BoundedInputStream bis = new BoundedInputStream(bais, 3);

        long skipped = bis.skip(10);
        assertEquals(3, skipped);
        assertEquals(0, bis.available());
        assertEquals(-1, bis.read());
    }

    @Test
    public void testAvailable() throws IOException {
        byte[] data = "1234567890".getBytes();
        ByteArrayInputStream bais = new ByteArrayInputStream(data);
        BoundedInputStream bis = new BoundedInputStream(bais, 4);

        assertEquals(4, bis.available());
        bis.read();
        assertEquals(3, bis.available());
    }
}
