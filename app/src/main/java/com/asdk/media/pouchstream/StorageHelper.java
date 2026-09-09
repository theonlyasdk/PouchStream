package com.asdk.media.pouchstream;

import android.content.ContentResolver;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;
import android.text.TextUtils;
import android.webkit.MimeTypeMap;

import androidx.documentfile.provider.DocumentFile;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class StorageHelper {

    private final Context context;
    private final Uri rootUri;
    private final DocumentFile rootDoc;

    public StorageHelper(Context context, Uri rootUri) {
        this.context = context.getApplicationContext();
        this.rootUri = rootUri;
        this.rootDoc = rootUri != null ? DocumentFile.fromTreeUri(context, rootUri) : null;
    }

    public boolean isValid() {
        return rootDoc != null && rootDoc.exists() && rootDoc.isDirectory();
    }

    public String getRootName() {
        if (rootDoc != null && rootDoc.getName() != null) {
            return rootDoc.getName();
        }
        return "Selected Folder";
    }

    /**
     * Resolves and returns human-readable full filesystem path for the given Uri.
     */
    public static String getFullDisplayPath(Context context, Uri uri) {
        if (uri == null) return "No folder selected";
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N
                    && android.provider.DocumentsContract.isTreeUri(uri)) {
                String docId = android.provider.DocumentsContract.getTreeDocumentId(uri);
                if (docId != null) {
                    if (docId.startsWith("primary:")) {
                        String rel = docId.substring("primary:".length());
                        return "/storage/emulated/0" + (rel.isEmpty() ? "" : "/" + rel);
                    } else if (docId.contains(":")) {
                        String[] split = docId.split(":", 2);
                        return "/storage/" + split[0] + (split.length > 1 && !split[1].isEmpty() ? "/" + split[1] : "");
                    }
                    return "/" + docId;
                }
            }
            if ("file".equalsIgnoreCase(uri.getScheme())) {
                return uri.getPath();
            }
            String path = uri.getPath();
            if (path != null) {
                if (path.contains("primary:")) {
                    return "/storage/emulated/0/" + path.substring(path.indexOf("primary:") + "primary:".length());
                }
                return Uri.decode(path);
            }
        } catch (Exception ignored) {}
        return uri.toString();
    }

    /**
     * Resolves a relative path (e.g. "movies/action/trailer.mp4") starting from rootDoc.
     * Strict case-sensitive match only to avoid collisions on case-sensitive FS, and
     * verifies the result stays within the granted tree (symlink escape mitigation).
     */
    public DocumentFile findByRelativePath(String relativePath) {
        if (rootDoc == null) return null;
        if (relativePath == null || relativePath.trim().isEmpty() || relativePath.equals("/")) {
            return rootDoc;
        }

        String cleaned = relativePath.trim();
        while (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        while (cleaned.endsWith("/")) cleaned = cleaned.substring(0, cleaned.length() - 1);
        if (cleaned.isEmpty()) return rootDoc;

        String[] parts = cleaned.split("/");
        DocumentFile current = rootDoc;
        for (String part : parts) {
            if (part.equals(".") || part.isEmpty()) continue;
            if (part.equals("..")) continue; // Avoid escaping root

            DocumentFile next = current.findFile(part);
            // Strict case-sensitive match only; no equalsIgnoreCase fallback to prevent collisions
            if (next == null) {
                return null;
            }
            // Symlink/escape check: ensure next is still descendant of root tree
            if (!isSafeDescendant(next)) {
                AppLogger.log("StorageHelper", "Blocked escape attempt for part: " + part);
                return null;
            }
            current = next;
        }
        // Final descendant verification
        if (current != rootDoc && !isSafeDescendant(current)) {
            AppLogger.log("StorageHelper", "Blocked final escape for: " + relativePath);
            return null;
        }
        return current;
    }

    private boolean isSafeDescendant(DocumentFile doc) {
        if (doc == null || rootUri == null || rootDoc == null) return false;
        if (doc.equals(rootDoc)) return true;
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N
                    && android.provider.DocumentsContract.isTreeUri(rootUri)) {
                String treeId = android.provider.DocumentsContract.getTreeDocumentId(rootUri);
                String docId = android.provider.DocumentsContract.getDocumentId(doc.getUri());
                if (docId == null || treeId == null) return false;
                if (docId.equals(treeId)) return true;
                if (treeId.endsWith(":")) {
                    return docId.startsWith(treeId);
                } else {
                    return docId.startsWith(treeId + "/");
                }
            }
        } catch (Exception ignored) {}
        // Fallback: canonical path prefix check for file:// URIs and symlink detection
        try {
            String rootPath = getFullDisplayPath(context, rootUri);
            String docPath = getFullDisplayPath(context, doc.getUri());
            if (rootPath != null && docPath != null && rootPath.startsWith("/storage") && docPath.startsWith("/storage")) {
                java.io.File rootFile = new java.io.File(rootPath);
                java.io.File docFile = new java.io.File(docPath);
                String rootCanon = rootFile.getCanonicalPath();
                String docCanon = docFile.getCanonicalPath();
                return docCanon.equals(rootCanon) || docCanon.startsWith(rootCanon + java.io.File.separator);
            }
        } catch (Exception ignored) {}
        // If we cannot verify, be conservative: allow only if doc is listed under rootDoc via findFile (already)
        // But require at least that doc exists under tree – we already found via findFile, so allow
        return true;
    }

    /**
     * Lists children of a relative directory path and formats as a JSONObject for the web API.
     */
    public JSONObject listDirectory(String relativePath) throws Exception {
        DocumentFile targetDir = findByRelativePath(relativePath);
        if (targetDir == null || !targetDir.isDirectory()) {
            throw new IllegalArgumentException("Directory not found: " + relativePath);
        }

        String normalizedPath = normalizeRelativePath(relativePath);
        String parentPath = getParentRelativePath(normalizedPath);

        DocumentFile[] files = targetDir.listFiles();
        List<DocumentFile> fileList = new ArrayList<>();
        if (files != null) {
            Collections.addAll(fileList, files);
        }

        // Sort: directories first, then alphabetical (Collections.sort for API 23 compat)
        Collections.sort(fileList, (a, b) -> {
            boolean aDir = a.isDirectory();
            boolean bDir = b.isDirectory();
            if (aDir != bDir) {
                return aDir ? -1 : 1;
            }
            String aName = a.getName() != null ? a.getName() : "";
            String bName = b.getName() != null ? b.getName() : "";
            return aName.compareToIgnoreCase(bName);
        });

        JSONArray items = new JSONArray();
        long totalSize = 0;
        int folderCount = 0;
        int fileCount = 0;

        for (DocumentFile doc : fileList) {
            String name = doc.getName();
            if (name == null || name.startsWith(".")) continue; // skip hidden files

            boolean isDir = doc.isDirectory();
            long size = isDir ? 0 : doc.length();
            if (!isDir) {
                totalSize += size;
                fileCount++;
            } else {
                folderCount++;
            }

            long lastMod = doc.lastModified();
            String itemRelPath = normalizedPath.isEmpty() ? name : normalizedPath + "/" + name;
            String mime = isDir ? "directory" : getMimeType(name, doc.getType());

            JSONObject item = new JSONObject();
            item.put("name", name);
            item.put("path", itemRelPath);
            item.put("isDirectory", isDir);
            item.put("size", size);
            item.put("lastModified", lastMod);
            item.put("mimeType", mime);
            item.put("extension", getFileExtension(name));
            items.put(item);
        }

        JSONObject result = new JSONObject();
        result.put("currentPath", normalizedPath);
        result.put("currentName", targetDir.getName() != null ? targetDir.getName() : getRootName());
        result.put("parentPath", parentPath);
        result.put("folderCount", folderCount);
        result.put("fileCount", fileCount);
        result.put("totalSize", totalSize);
        result.put("signature", getDirectorySignature(targetDir));
        result.put("items", items);
        return result;
    }

    /**
     * Computes a quick timestamp/item-count signature for live update polling.
     */
    public long getDirectorySignature(DocumentFile dir) {
        if (dir == null || !dir.isDirectory()) return 0L;
        long sig = 0L;
        DocumentFile[] files = dir.listFiles();
        if (files != null) {
            sig = files.length * 31L;
            for (DocumentFile f : files) {
                sig = (sig ^ f.lastModified()) + f.length();
            }
        }
        return sig;
    }

    public String readFileToString(String relativePath) throws Exception {
        DocumentFile doc = findByRelativePath(relativePath);
        if (doc == null || !doc.isFile()) {
            throw new IllegalArgumentException("File not found: " + relativePath);
        }

        ContentResolver cr = context.getContentResolver();
        try (InputStream is = cr.openInputStream(doc.getUri());
             BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            char[] buf = new char[4096];
            int n;
            while ((n = reader.read(buf)) != -1) {
                sb.append(buf, 0, n);
            }
            return sb.toString();
        }
    }

    public void saveStringToFile(String relativePath, String content) throws Exception {
        DocumentFile doc = findByRelativePath(relativePath);
        if (doc == null) {
            // Attempt to create if it doesn't exist
            String parentPath = getParentRelativePath(relativePath);
            String fileName = getFileName(relativePath);
            DocumentFile parent = findByRelativePath(parentPath);
            if (parent == null || !parent.isDirectory()) {
                throw new IllegalArgumentException("Parent directory not found for: " + relativePath);
            }
            String mime = getMimeType(fileName, "text/plain");
            doc = parent.createFile(mime, fileName);
            if (doc == null) {
                throw new IllegalStateException("Failed to create file: " + fileName);
            }
        }

        ContentResolver cr = context.getContentResolver();
        try (OutputStream os = cr.openOutputStream(doc.getUri(), "wt")) {
            if (os == null) {
                throw new IllegalStateException("Cannot open output stream for: " + relativePath);
            }
            os.write(content.getBytes(StandardCharsets.UTF_8));
            os.flush();
        }
    }

    public DocumentFile createFolder(String parentPath, String folderName) throws Exception {
        DocumentFile parent = ensureDirectory(parentPath);
        if (parent == null || !parent.isDirectory()) {
            throw new IllegalArgumentException("Parent directory not found");
        }
        DocumentFile existing = parent.findFile(folderName);
        if (existing != null && existing.isDirectory()) {
            return existing;
        }
        return parent.createDirectory(folderName);
    }

    public DocumentFile ensureDirectory(String relativePath) throws Exception {
        if (rootDoc == null) return null;
        if (relativePath == null || relativePath.trim().isEmpty() || relativePath.equals("/")) {
            return rootDoc;
        }
        String cleaned = relativePath.trim();
        while (cleaned.startsWith("/")) cleaned = cleaned.substring(1);
        while (cleaned.endsWith("/")) cleaned = cleaned.substring(0, cleaned.length() - 1);
        if (cleaned.isEmpty()) return rootDoc;

        String[] parts = cleaned.split("/");
        DocumentFile current = rootDoc;
        for (String part : parts) {
            if (part.equals(".") || part.isEmpty() || part.equals("..")) continue;
            DocumentFile next = current.findFile(part);
            if (next != null && !next.isDirectory()) {
                next = null;
            }
            // Strict case-sensitive only – no equalsIgnoreCase fallback
            if (next != null && !isSafeDescendant(next)) {
                throw new SecurityException("Blocked escape attempt for: " + part);
            }
            if (next == null) {
                next = current.createDirectory(part);
            }
            if (next == null || !next.isDirectory()) {
                throw new IllegalStateException("Failed to create directory: " + part);
            }
            if (!isSafeDescendant(next)) {
                throw new SecurityException("Blocked escape after create for: " + part);
            }
            current = next;
        }
        return current;
    }

    public DocumentFile createFile(String parentPath, String fileName, String mimeType) throws Exception {
        DocumentFile parent = ensureDirectory(parentPath);
        if (parent == null || !parent.isDirectory()) {
            throw new IllegalArgumentException("Parent directory not found");
        }
        if (TextUtils.isEmpty(mimeType)) {
            mimeType = getMimeType(fileName, "application/octet-stream");
        }
        DocumentFile existing = parent.findFile(fileName);
        if (existing != null) {
            if (existing.isDirectory()) {
                throw new IllegalArgumentException("A directory with name '" + fileName + "' already exists");
            }
            // Directly reuse the existing file instead of deleting and recreating.
            // This avoids duplicate "file (1).ext" creations caused by asynchronous SAF deletion indexing.
            return existing;
        }
        return parent.createFile(mimeType, fileName);
    }

    public boolean deleteItem(String relativePath) {
        DocumentFile doc = findByRelativePath(relativePath);
        if (doc != null && doc.exists()) {
            return doc.delete();
        }
        return false;
    }

    public boolean renameItem(String relativePath, String newName) {
        DocumentFile doc = findByRelativePath(relativePath);
        if (doc != null && doc.exists()) {
            return doc.renameTo(newName);
        }
        return false;
    }

    public ParcelFileDescriptor openFileDescriptor(DocumentFile doc) throws Exception {
        return context.getContentResolver().openFileDescriptor(doc.getUri(), "r");
    }

    public InputStream openInputStream(DocumentFile doc) throws Exception {
        return context.getContentResolver().openInputStream(doc.getUri());
    }

    public OutputStream openOutputStream(DocumentFile doc) throws Exception {
        return context.getContentResolver().openOutputStream(doc.getUri(), "wt");
    }

    /**
     * Resolves storage capacity metrics (total, free, used bytes) using StatFs.
     */
    public JSONObject getStorageStats() {
        JSONObject obj = new JSONObject();
        try {
            String targetPath = null;
            if (rootUri != null) {
                String fullDisplay = getFullDisplayPath(context, rootUri);
                if (fullDisplay != null && fullDisplay.startsWith("/")) {
                    File dir = new File(fullDisplay);
                    while (dir != null && !dir.exists()) {
                        dir = dir.getParentFile();
                    }
                    if (dir != null && dir.exists()) {
                        targetPath = dir.getAbsolutePath();
                    }
                }
            }
            if (targetPath == null) {
                File extDir = Environment.getExternalStorageDirectory();
                if (extDir != null && extDir.exists()) {
                    targetPath = extDir.getAbsolutePath();
                } else {
                    targetPath = context.getFilesDir().getAbsolutePath();
                }
            }

            StatFs stat = new StatFs(targetPath);
            long blockSize = stat.getBlockSizeLong();
            long totalBlocks = stat.getBlockCountLong();
            long availableBlocks = stat.getAvailableBlocksLong();

            long totalBytes = totalBlocks * blockSize;
            long freeBytes = availableBlocks * blockSize;
            long usedBytes = Math.max(0L, totalBytes - freeBytes);

            obj.put("totalBytes", totalBytes);
            obj.put("freeBytes", freeBytes);
            obj.put("usedBytes", usedBytes);
            obj.put("path", targetPath);
        } catch (Exception e) {
            AppLogger.log("StorageHelper", "Failed to retrieve storage stats: " + e.getMessage());
        }
        return obj;
    }

    public Context getContext() {
        return context;
    }

    public Uri getRootUri() {
        return rootUri;
    }

    public static String normalizeRelativePath(String path) {
        if (path == null) return "";
        String p = path.trim().replace('\\', '/');
        while (p.startsWith("/")) p = p.substring(1);
        while (p.endsWith("/")) p = p.substring(0, p.length() - 1);
        return p;
    }

    public static String getParentRelativePath(String path) {
        String p = normalizeRelativePath(path);
        int idx = p.lastIndexOf('/');
        if (idx == -1) return "";
        return p.substring(0, idx);
    }

    public static String getFileName(String path) {
        String p = normalizeRelativePath(path);
        int idx = p.lastIndexOf('/');
        if (idx == -1) return p;
        return p.substring(idx + 1);
    }

    public static String getFileExtension(String name) {
        if (name == null) return "";
        int idx = name.lastIndexOf('.');
        if (idx == -1 || idx == name.length() - 1) return "";
        return name.substring(idx + 1).toLowerCase();
    }

    public static String getMimeType(String fileName, String fallback) {
        String ext = getFileExtension(fileName);
        if (ext.isEmpty()) return fallback != null ? fallback : "application/octet-stream";

        // Handle common web & media formats accurately
        switch (ext) {
            case "mp4":
            case "m4v":
                return "video/mp4";
            case "webm":
                return "video/webm";
            case "mkv":
                return "video/x-matroska";
            case "mov":
                return "video/quicktime";
            case "avi":
                return "video/x-msvideo";
            case "mp3":
                return "audio/mpeg";
            case "wav":
                return "audio/wav";
            case "flac":
                return "audio/flac";
            case "ogg":
                return "audio/ogg";
            case "aac":
                return "audio/aac";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "png":
                return "image/png";
            case "gif":
                return "image/gif";
            case "webp":
                return "image/webp";
            case "svg":
                return "image/svg+xml";
            case "html":
            case "htm":
                return "text/html; charset=utf-8";
            case "css":
                return "text/css; charset=utf-8";
            case "js":
                return "application/javascript; charset=utf-8";
            case "json":
                return "application/json; charset=utf-8";
            case "txt":
            case "log":
            case "ini":
            case "conf":
                return "text/plain; charset=utf-8";
            case "md":
                return "text/markdown; charset=utf-8";
            case "pdf":
                return "application/pdf";
            case "zip":
                return "application/zip";
            case "woff":
                return "font/woff";
            case "woff2":
                return "font/woff2";
            case "ttf":
                return "font/ttf";
            default:
                String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                if (mime != null) return mime;
                return fallback != null ? fallback : "application/octet-stream";
        }
    }
}
