package com.asdk.media.pouchstream;

import java.io.IOException;
import java.io.InputStream;

/**
 * An InputStream that limits the number of bytes that can be read from the underlying stream.
 * Used for HTTP 206 Partial Content (Range requests) streaming.
 */
public class BoundedInputStream extends InputStream {

    private final InputStream in;
    private long remaining;

    public BoundedInputStream(InputStream in, long maxBytes) {
        this.in = in;
        this.remaining = Math.max(0, maxBytes);
    }

    @Override
    public int read() throws IOException {
        if (remaining <= 0) {
            return -1;
        }
        int result = in.read();
        if (result != -1) {
            remaining--;
        }
        return result;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        if (len == 0) {
            return 0;
        }
        if (remaining <= 0) {
            return -1;
        }
        int bytesToRead = (int) Math.min(len, remaining);
        int bytesRead = in.read(b, off, bytesToRead);
        if (bytesRead == -1) {
            return -1;
        }
        remaining -= bytesRead;
        return bytesRead;
    }

    @Override
    public int available() throws IOException {
        return (int) Math.min(in.available(), remaining);
    }

    @Override
    public long skip(long n) throws IOException {
        if (remaining <= 0 || n <= 0) {
            return 0;
        }
        long toSkip = Math.min(n, remaining);
        long skipped = in.skip(toSkip);
        if (skipped > 0) {
            remaining -= skipped;
        }
        return skipped;
    }

    @Override
    public void close() throws IOException {
        in.close();
    }
}
