package com.asdk.media.pouchstream;

import org.junit.Test;

import static org.junit.Assert.*;

public class StorageHelperTest {

    @Test
    public void testNormalizeRelativePath() {
        assertEquals("", StorageHelper.normalizeRelativePath(null));
        assertEquals("", StorageHelper.normalizeRelativePath("/"));
        assertEquals("", StorageHelper.normalizeRelativePath("///"));
        assertEquals("movies/trailer.mp4", StorageHelper.normalizeRelativePath("/movies/trailer.mp4/"));
        assertEquals("a/b/c", StorageHelper.normalizeRelativePath("a\\b\\c"));
    }

    @Test
    public void testGetParentRelativePath() {
        assertEquals("", StorageHelper.getParentRelativePath("file.txt"));
        assertEquals("folder", StorageHelper.getParentRelativePath("folder/file.txt"));
        assertEquals("a/b", StorageHelper.getParentRelativePath("a/b/c/"));
    }

    @Test
    public void testGetFileName() {
        assertEquals("file.txt", StorageHelper.getFileName("file.txt"));
        assertEquals("file.txt", StorageHelper.getFileName("folder/file.txt"));
        assertEquals("nested.mp4", StorageHelper.getFileName("a/b/nested.mp4"));
    }

    @Test
    public void testGetFileExtension() {
        assertEquals("mp4", StorageHelper.getFileExtension("video.mp4"));
        assertEquals("pdf", StorageHelper.getFileExtension("document.PDF"));
        assertEquals("", StorageHelper.getFileExtension("noextension"));
        assertEquals("hidden", StorageHelper.getFileExtension(".hidden"));
    }

    @Test
    public void testGetMimeTypeCommonFormats() {
        assertEquals("video/mp4", StorageHelper.getMimeType("video.mp4", null));
        assertEquals("audio/mpeg", StorageHelper.getMimeType("song.mp3", null));
        assertEquals("application/pdf", StorageHelper.getMimeType("doc.pdf", null));
        assertEquals("text/plain; charset=utf-8", StorageHelper.getMimeType("notes.txt", null));
    }
}
