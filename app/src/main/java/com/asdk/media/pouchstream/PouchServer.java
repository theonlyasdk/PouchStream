package com.asdk.media.pouchstream;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.ParcelFileDescriptor;
import android.text.TextUtils;
import android.util.Base64;

import androidx.documentfile.provider.DocumentFile;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

public class PouchServer extends NanoHTTPD {

    private final Context context;
    private final StorageHelper storageHelper;
    private final int port;

    public PouchServer(Context context, StorageHelper storageHelper, int port) {
        super(port);
        this.context = context.getApplicationContext();
        this.storageHelper = storageHelper;
        this.port = port;
    }

    private boolean isAuthorized(IHTTPSession session) {
        SharedPreferences prefs = context.getSharedPreferences(ServerService.PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean(ServerService.KEY_AUTH_ENABLED, false);
        if (!enabled) return true;
        String auth = session.getHeaders().get("authorization");
        if (auth == null || !auth.startsWith("Basic ")) return false;
        String b64 = auth.substring(6).trim();
        try {
            String decoded = new String(Base64.decode(b64, Base64.DEFAULT), StandardCharsets.UTF_8);
            int colon = decoded.indexOf(':');
            if (colon <= 0) return false;
            String user = decoded.substring(0, colon);
            String pass = decoded.substring(colon + 1);
            String expUser = prefs.getString(ServerService.KEY_AUTH_USER, "");
            String expPass = prefs.getString(ServerService.KEY_AUTH_PASS, "");
            return user.equals(expUser) && pass.equals(expPass);
        } catch (Exception e) {
            return false;
        }
    }

    private Response unauthorizedResponse() {
        Response r = newFixedLengthResponse(Response.Status.UNAUTHORIZED, "text/plain", "Unauthorized");
        r.addHeader("WWW-Authenticate", "Basic realm=\"PouchStream\"");
        addCorsHeaders(r);
        return r;
    }

    private boolean isReadOnlyEnabled() {
        SharedPreferences prefs = context.getSharedPreferences(ServerService.PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(ServerService.KEY_READ_ONLY, false);
    }

    private Response readOnlyResponse() {
        return errorResponse(Response.Status.FORBIDDEN, "Read-only mode enabled — writes are disabled");
    }

    @Override
    public Response serve(IHTTPSession session) {
        Method method = session.getMethod();
        String uri = session.getUri();

        // Handle CORS preflight
        if (Method.OPTIONS.equals(method)) {
            Response response = newFixedLengthResponse(Response.Status.OK, MIME_PLAINTEXT, "");
            addCorsHeaders(response);
            return response;
        }

        if (!isAuthorized(session)) {
            return unauthorizedResponse();
        }

        try {
            if (!"/api/poll".equals(uri)) {
                AppLogger.log("HTTP", method + " " + uri + (session.getQueryParameterString() != null ? "?" + session.getQueryParameterString() : ""));
            }
            Response response;
            if (uri.startsWith("/api/")) {
                response = handleApi(session, uri);
            } else {
                response = handleStaticAssets(uri);
            }
            addCorsHeaders(response);
            return response;
        } catch (Exception e) {
            AppLogger.log("HTTP", "Error processing " + method + " " + uri + ": " + e.getMessage(), e);
            JSONObject err = new JSONObject();
            try {
                err.put("error", e.getMessage() != null ? e.getMessage() : "Unknown error");
            } catch (Exception ignored) {}
            Response errResponse = newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", err.toString());
            addCorsHeaders(errResponse);
            return errResponse;
        }
    }

    private Response handleApi(IHTTPSession session, String uri) throws Exception {
        Map<String, String> parms = session.getParms();

        switch (uri) {
            case "/api/info": {
                JSONObject info = new JSONObject();
                info.put("server", "PouchStream");
                info.put("version", "v2.0.0");
                info.put("folderName", storageHelper.isValid() ? storageHelper.getRootName() : "None");
                info.put("isReady", storageHelper.isValid());
                info.put("port", port);

                // Detect host OS & platform dynamically
                String osName = System.getProperty("os.name", "Unknown OS");
                String osVersion = System.getProperty("os.version", "");
                String arch = System.getProperty("os.arch", "unknown");

                boolean isAndroid = false;
                try {
                    Class.forName("android.os.Build");
                    isAndroid = true;
                } catch (ClassNotFoundException ignored) {}

                if (isAndroid && android.os.Build.VERSION.SDK_INT > 0) {
                    info.put("os", "Android " + android.os.Build.VERSION.RELEASE + " (API " + android.os.Build.VERSION.SDK_INT + ")");
                    info.put("device", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
                    info.put("engine", "Native Embedded NanoHTTPD Daemon");
                } else {
                    info.put("os", osName + (!osVersion.isEmpty() ? " (" + osVersion + ")" : ""));
                    String hostname = System.getenv("COMPUTERNAME");
                    if (hostname == null || hostname.isEmpty()) {
                        hostname = System.getenv("HOSTNAME");
                    }
                    info.put("device", hostname != null ? hostname : "Local Workstation");
                    info.put("engine", "PouchStream Daemon / Java " + System.getProperty("java.version", "11"));
                }
                info.put("arch", arch);
                return jsonResponse(info);
            }

            case "/api/files": {
                if (!storageHelper.isValid()) {
                    return errorResponse(Response.Status.BAD_REQUEST, "No folder selected on device.");
                }
                String path = parms.get("path");
                JSONObject listing = storageHelper.listDirectory(path != null ? path : "");
                return jsonResponse(listing);
            }

            case "/api/poll": {
                if (!storageHelper.isValid()) {
                    return errorResponse(Response.Status.BAD_REQUEST, "Storage not ready");
                }
                String path = parms.get("path");
                DocumentFile targetDir = storageHelper.findByRelativePath(path != null ? path : "");
                long sig = storageHelper.getDirectorySignature(targetDir);
                JSONObject pollObj = new JSONObject();
                pollObj.put("signature", sig);
                return jsonResponse(pollObj);
            }

            case "/api/read": {
                String path = parms.get("path");
                if (TextUtils.isEmpty(path)) {
                    return errorResponse(Response.Status.BAD_REQUEST, "Missing path parameter");
                }
                String content = storageHelper.readFileToString(path);
                JSONObject res = new JSONObject();
                res.put("path", path);
                res.put("content", content);
                return jsonResponse(res);
            }

            case "/api/save": {
                if (isReadOnlyEnabled()) return readOnlyResponse();
                if (!Method.POST.equals(session.getMethod())) {
                    return errorResponse(Response.Status.METHOD_NOT_ALLOWED, "POST required");
                }
                Map<String, String> files = new HashMap<>();
                session.parseBody(files);
                String postData = files.get("postData");

                String path = null;
                String content = null;

                if (postData != null && !postData.trim().isEmpty()) {
                    try {
                        JSONObject json = new JSONObject(postData);
                        path = json.optString("path");
                        content = json.optString("content");
                    } catch (Exception e) {
                        // fallback to parms
                    }
                }
                if (path == null) path = session.getParms().get("path");
                if (content == null) content = session.getParms().get("content");

                if (TextUtils.isEmpty(path) || content == null) {
                    return errorResponse(Response.Status.BAD_REQUEST, "Missing path or content");
                }

                storageHelper.saveStringToFile(path, content);
                JSONObject res = new JSONObject();
                res.put("success", true);
                res.put("message", "File saved successfully");
                res.put("timestamp", System.currentTimeMillis());
                return jsonResponse(res);
            }

            case "/api/stream": {
                return handleStream(session);
            }

            case "/api/upload": {
                if (isReadOnlyEnabled()) return readOnlyResponse();
                if (!Method.POST.equals(session.getMethod())) {
                    return errorResponse(Response.Status.METHOD_NOT_ALLOWED, "POST required");
                }
                Map<String, String> files = new HashMap<>();
                session.parseBody(files);

                String targetPath = session.getParms().get("path");
                if (targetPath == null) targetPath = "";

                // NanoHTTPD puts uploaded files into temp paths mapped by part name
                int uploadedCount = 0;
                for (Map.Entry<String, String> entry : files.entrySet()) {
                    String partName = entry.getKey();
                    String tempFilePath = entry.getValue();

                    // NanoHTTPD places original filename into parms with part name as key
                    String originalName = session.getParms().get(partName);
                    if (originalName == null || originalName.trim().isEmpty()) {
                        originalName = partName;
                    }
                    if (originalName.contains("/")) {
                        originalName = originalName.substring(originalName.lastIndexOf('/') + 1);
                    }
                    if (originalName.contains("\\")) {
                        originalName = originalName.substring(originalName.lastIndexOf('\\') + 1);
                    }

                    if (tempFilePath != null) {
                        File tempFile = new File(tempFilePath);
                        if (tempFile.exists() && tempFile.length() > 0) {
                            String mime = StorageHelper.getMimeType(originalName, "application/octet-stream");
                            DocumentFile created = storageHelper.createFile(targetPath, originalName, mime);
                            if (created != null) {
                                try (InputStream is = new FileInputStream(tempFile);
                                     OutputStream os = storageHelper.openOutputStream(created)) {
                                    byte[] buf = new byte[16384];
                                    int n;
                                    while ((n = is.read(buf)) != -1) {
                                        os.write(buf, 0, n);
                                    }
                                    os.flush();
                                    uploadedCount++;
                                }
                            }
                        }
                    }
                }

                JSONObject res = new JSONObject();
                res.put("success", true);
                res.put("uploaded", uploadedCount);
                return jsonResponse(res);
            }

            case "/api/create_folder": {
                if (isReadOnlyEnabled()) return readOnlyResponse();
                Map<String, String> files = new HashMap<>();
                session.parseBody(files);
                String parentPath = session.getParms().get("path");
                String folderName = session.getParms().get("name");
                if (TextUtils.isEmpty(folderName)) {
                    return errorResponse(Response.Status.BAD_REQUEST, "Folder name is required");
                }
                storageHelper.createFolder(parentPath != null ? parentPath : "", folderName.trim());
                JSONObject res = new JSONObject();
                res.put("success", true);
                return jsonResponse(res);
            }

            case "/api/create_file": {
                if (isReadOnlyEnabled()) return readOnlyResponse();
                Map<String, String> files = new HashMap<>();
                session.parseBody(files);
                String parentPath = session.getParms().get("path");
                String fileName = session.getParms().get("name");
                if (TextUtils.isEmpty(fileName)) {
                    return errorResponse(Response.Status.BAD_REQUEST, "File name is required");
                }
                storageHelper.createFile(parentPath != null ? parentPath : "", fileName.trim(), "text/plain");
                JSONObject res = new JSONObject();
                res.put("success", true);
                return jsonResponse(res);
            }

            case "/api/delete": {
                if (isReadOnlyEnabled()) return readOnlyResponse();
                Map<String, String> files = new HashMap<>();
                session.parseBody(files);
                String path = session.getParms().get("path");
                if (TextUtils.isEmpty(path)) {
                    return errorResponse(Response.Status.BAD_REQUEST, "Path is required");
                }
                boolean deleted = storageHelper.deleteItem(path);
                JSONObject res = new JSONObject();
                res.put("success", deleted);
                return jsonResponse(res);
            }

            case "/api/rename": {
                if (isReadOnlyEnabled()) return readOnlyResponse();
                Map<String, String> files = new HashMap<>();
                session.parseBody(files);
                String path = session.getParms().get("path");
                String newName = session.getParms().get("newName");
                if (TextUtils.isEmpty(path) || TextUtils.isEmpty(newName)) {
                    return errorResponse(Response.Status.BAD_REQUEST, "Path and newName are required");
                }
                boolean renamed = storageHelper.renameItem(path, newName.trim());
                JSONObject res = new JSONObject();
                res.put("success", renamed);
                return jsonResponse(res);
            }

            default:
                return errorResponse(Response.Status.NOT_FOUND, "API endpoint not found: " + uri);
        }
    }

    /**
     * Handles media streaming with HTTP 206 Partial Content (Range requests) and regular file downloads.
     */
    private Response handleStream(IHTTPSession session) throws Exception {
        Map<String, String> parms = session.getParms();
        String path = parms.get("path");
        if (TextUtils.isEmpty(path)) {
            return errorResponse(Response.Status.BAD_REQUEST, "Missing path");
        }

        DocumentFile doc = storageHelper.findByRelativePath(path);
        if (doc == null || !doc.isFile()) {
            return errorResponse(Response.Status.NOT_FOUND, "File not found: " + path);
        }

        long fileLen = doc.length();
        String mime = StorageHelper.getMimeType(doc.getName(), doc.getType());
        boolean isDownload = "true".equalsIgnoreCase(parms.get("download"));

        Map<String, String> headers = session.getHeaders();
        String rangeHeader = headers.get("range");

        ParcelFileDescriptor pfd = storageHelper.openFileDescriptor(doc);
        if (pfd == null) {
            return errorResponse(Response.Status.INTERNAL_ERROR, "Cannot open file descriptor");
        }

        if (fileLen <= 0) {
            fileLen = pfd.getStatSize();
        }

        if (rangeHeader != null && rangeHeader.startsWith("bytes=") && fileLen > 0) {
            String rangeValue = rangeHeader.substring("bytes=".length()).trim();
            long start = 0;
            long end = fileLen - 1;

            int dashIdx = rangeValue.indexOf('-');
            if (dashIdx != -1) {
                String startStr = rangeValue.substring(0, dashIdx).trim();
                String endStr = rangeValue.substring(dashIdx + 1).trim();

                if (!startStr.isEmpty()) {
                    try {
                        start = Long.parseLong(startStr);
                    } catch (NumberFormatException ignored) {}
                }
                if (!endStr.isEmpty()) {
                    try {
                        end = Long.parseLong(endStr);
                    } catch (NumberFormatException ignored) {}
                }
            }

            if (start > end || start >= fileLen) {
                pfd.close();
                Response res = newFixedLengthResponse(Response.Status.RANGE_NOT_SATISFIABLE, MIME_PLAINTEXT, "");
                res.addHeader("Content-Range", "bytes */" + fileLen);
                return res;
            }

            end = Math.min(end, fileLen - 1);
            long contentLength = end - start + 1;

            FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
            // Seek to start position using FileChannel
            try {
                fis.getChannel().position(start);
            } catch (Exception e) {
                long skipped = 0;
                while (skipped < start) {
                    long s = fis.skip(start - skipped);
                    if (s <= 0) break;
                    skipped += s;
                }
            }

            BoundedInputStream boundedStream = new BoundedInputStream(fis, contentLength);
            Response res = newFixedLengthResponse(Response.Status.PARTIAL_CONTENT, mime, boundedStream, contentLength);
            res.addHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileLen);
            res.addHeader("Accept-Ranges", "bytes");
            res.addHeader("Content-Length", String.valueOf(contentLength));
            if (isDownload) {
                res.addHeader("Content-Disposition", "attachment; filename=\"" + doc.getName() + "\"");
            }
            return res;
        }

        // Full content request (200 OK)
        FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
        Response res = newFixedLengthResponse(Response.Status.OK, mime, fis, fileLen);
        res.addHeader("Accept-Ranges", "bytes");
        res.addHeader("Content-Length", String.valueOf(fileLen));
        if (isDownload) {
            res.addHeader("Content-Disposition", "attachment; filename=\"" + doc.getName() + "\"");
        }
        return res;
    }

    private Response handleStaticAssets(String uri) {
        String assetPath = uri;
        if (assetPath.equals("/") || assetPath.isEmpty()) {
            assetPath = "/index.html";
        }
        if (assetPath.startsWith("/")) {
            assetPath = assetPath.substring(1);
        }

        try {
            InputStream is = context.getAssets().open("web/" + assetPath);
            String mime = StorageHelper.getMimeType(assetPath, "application/octet-stream");
            int available = is.available();
            return newFixedLengthResponse(Response.Status.OK, mime, is, available);
        } catch (Exception e) {
            // If asset not found and not a file extension, fallback to index.html (SPA)
            if (!assetPath.contains(".")) {
                try {
                    InputStream is = context.getAssets().open("web/index.html");
                    return newFixedLengthResponse(Response.Status.OK, "text/html; charset=utf-8", is, is.available());
                } catch (Exception ignored) {}
            }
            return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Asset not found: " + uri);
        }
    }

    private void addCorsHeaders(Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
        response.addHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Range, Authorization");
    }

    private Response jsonResponse(JSONObject json) {
        return newFixedLengthResponse(Response.Status.OK, "application/json; charset=utf-8", json.toString());
    }

    private Response errorResponse(Response.Status status, String message) {
        JSONObject obj = new JSONObject();
        try {
            obj.put("error", message);
            obj.put("status", status.getRequestStatus());
        } catch (Exception ignored) {}
        return newFixedLengthResponse(status, "application/json; charset=utf-8", obj.toString());
    }
}
