package com.asdk.media.pouchstream;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkRequest;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public class ServerService extends Service {

    public static final String ACTION_START = "com.asdk.media.pouchstream.ACTION_START";
    public static final String ACTION_STOP = "com.asdk.media.pouchstream.ACTION_STOP";
    public static final String EXTRA_PORT = "extra_port";
    public static final String EXTRA_FOLDER_URI = "extra_folder_uri";

    private static final String CHANNEL_ID = "pouchstream_server_channel";
    private static final int NOTIFICATION_ID = 1001;

    public static final String PREFS_NAME = "pouchstream_prefs";
    public static final String KEY_FOLDER_URI = "key_folder_uri";
    public static final String KEY_FOLDER_NAME = "key_folder_name";
    public static final String KEY_PORT = "key_port";
    public static final String KEY_WAS_RUNNING = "key_was_running";
    public static final String KEY_AUTO_START = "key_auto_start";
    public static final String KEY_AUTH_ENABLED = "key_auth_enabled";
    public static final String KEY_AUTH_USER = "key_auth_user";
    public static final String KEY_AUTH_PASS = "key_auth_pass";
    public static final String KEY_READ_ONLY = "key_read_only";
    public static final String KEY_KEEP_AWAKE = "key_keep_awake";

    public interface ServerListener {
        void onServerStateChanged(boolean running, String url, String error);
    }

    private static final Object STATE_LOCK = new Object();
    private static volatile ServerListener listener;
    private static volatile boolean running = false;
    private static volatile String serverUrl = "";
    private static volatile String lastError = null;

    private PouchServer server;
    private StorageHelper storage;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    public static void setListener(ServerListener l) {
        synchronized (STATE_LOCK) {
            listener = l;
        }
        // Do not immediately callback - let MainActivity onResume handle initial sync with correct animate flag
        // Previously this caused duplicate onServerStateChanged that cancelled hide animation (button vs notification)
    }

    public static boolean isRunning() {
        synchronized (STATE_LOCK) {
            return running;
        }
    }

    public static String getServerUrl() {
        synchronized (STATE_LOCK) {
            return serverUrl;
        }
    }

    private static void setState(boolean isRunning, String url, String error) {
        synchronized (STATE_LOCK) {
            running = isRunning;
            serverUrl = url != null ? url : "";
            lastError = error;
        }
    }

    private static void notifyListener(boolean isRunning, String url, String error) {
        ServerListener copy;
        synchronized (STATE_LOCK) {
            copy = listener;
        }
        if (copy != null) {
            copy.onServerStateChanged(isRunning, url, error);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP.equals(action)) {
                stopServer();
                releaseWakeLock();
                releaseWifiLock();
                androidx.core.app.ServiceCompat.stopForeground(this, androidx.core.app.ServiceCompat.STOP_FOREGROUND_REMOVE);
                stopSelf();
                // clear persisted running flag
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putBoolean(KEY_WAS_RUNNING, false).apply();
                return START_NOT_STICKY;
            }
        }

        // If service was killed and restarted with null intent, intent will be null.
        // We still want to restart server if it was running before.
        startServer(intent);
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Keep service alive when user swipes away from recents
        // START_STICKY will handle restart, but on some OEMs we need explicit restart
        if (isRunning()) {
            Intent restartIntent = new Intent(getApplicationContext(), ServerService.class);
            restartIntent.setAction(ACTION_START);
            // Use stored prefs values for port/uri
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restartIntent);
            } else {
                startService(restartIntent);
            }
        }
        super.onTaskRemoved(rootIntent);
    }

    @android.annotation.SuppressLint("WakelockTimeout")
    private void acquireWakeLock() {
        if (wakeLock == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PouchStream::ServerWakelock");
                wakeLock.setReferenceCounted(false);
            }
        }
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire();
            AppLogger.log("ServerService", "WakeLock acquired");
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            AppLogger.log("ServerService", "WakeLock released");
        }
    }

    private void acquireWifiLock() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_KEEP_AWAKE, false)) return;
        if (wifiLock == null) {
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) {
                wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "PouchStream::WifiLock");
                wifiLock.setReferenceCounted(false);
            }
        }
        if (wifiLock != null && !wifiLock.isHeld()) {
            try {
                wifiLock.acquire();
                AppLogger.log("ServerService", "WifiLock acquired (HIGH_PERF)");
            } catch (Exception e) {
                AppLogger.log("ServerService", "WifiLock acquire failed: " + e.getMessage());
            }
        }
    }

    private void releaseWifiLock() {
        if (wifiLock != null && wifiLock.isHeld()) {
            try {
                wifiLock.release();
                AppLogger.log("ServerService", "WifiLock released");
            } catch (Exception ignored) {}
        }
    }

    private void startServer(Intent intent) {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);

        int port = 8080;
        if (intent != null && intent.hasExtra(EXTRA_PORT)) {
            port = intent.getIntExtra(EXTRA_PORT, 8080);
        } else {
            port = prefs.getInt(KEY_PORT, 8080);
        }

        String uriStr = null;
        if (intent != null && intent.hasExtra(EXTRA_FOLDER_URI)) {
            uriStr = intent.getStringExtra(EXTRA_FOLDER_URI);
        } else {
            uriStr = prefs.getString(KEY_FOLDER_URI, null);
        }

        // If still null after reboot/restart, prefs holds it
        if (uriStr == null) {
            uriStr = prefs.getString(KEY_FOLDER_URI, null);
        }

        Uri folderUri = uriStr != null ? Uri.parse(uriStr) : null;
        if (folderUri == null) {
            String err = "No folder selected";
            setState(false, "", err);
            AppLogger.log("ServerService", "Cannot start server: no folder selected");
            notifyListener(false, "", err);
            // Still show notification briefly? Better stop self
            stopSelf();
            return;
        }

        this.storage = new StorageHelper(this, folderUri);

        stopServerSilently();

        String ip = NetworkUtils.getLocalIpAddress(this);
        String preliminaryUrl = "http://" + ip + ":" + port;
        synchronized (STATE_LOCK) { serverUrl = preliminaryUrl; }

        AppLogger.log("ServerService", "Starting server on " + preliminaryUrl + " (folder: " + storage.getRootName() + ")");

        // Promote to foreground IMMEDIATELY (required within ~5s on Android 14+)
        // Build preliminary notification before server binds to avoid ANR/timeouts
        Notification preliminary = buildNotification(preliminaryUrl, storage.getRootName());
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(this, NOTIFICATION_ID, preliminary,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(NOTIFICATION_ID, preliminary);
            }
        } catch (Exception e) {
            // Fallback if ServiceCompat fails (e.g. missing permission on Android 14)
            try {
                startForeground(NOTIFICATION_ID, preliminary);
            } catch (Exception ignored) {}
        }

        acquireWakeLock();
        acquireWifiLock();

        int boundPort = -1;
        Exception lastEx = null;
        // Port fallback candidates if requested port is busy
        int[] fallbackPorts = new int[]{port, 8081, 8000, 8888, 9000, 7000};
        // Deduplicate and keep order: original first, then others
        java.util.LinkedHashSet<Integer> candidates = new java.util.LinkedHashSet<>();
        for (int p : fallbackPorts) candidates.add(p);
        // Also try 0 (random) as last resort if all busy
        boolean isPortBusyError = false;

        for (int cand : candidates) {
            try {
                PouchServer tryServer = new PouchServer(this, storage, cand);
                tryServer.start();
                server = tryServer;
                boundPort = cand;
                lastEx = null;
                break;
            } catch (Exception e) {
                lastEx = e;
                String msg = e.getMessage() != null ? e.getMessage().toLowerCase() : "";
                isPortBusyError = msg.contains("in use") || msg.contains("eaddrinuse") || msg.contains("bind") || msg.contains("already");
                if (!isPortBusyError) break; // non-port error, don't try others
                AppLogger.log("ServerService", "Port " + cand + " busy, trying next: " + msg);
                if (cand != port) {
                    // close any partial
                }
            }
        }

        if (boundPort != -1 && server != null) {
            // Update port if fallback used
            if (boundPort != port) {
                port = boundPort;
                prefs.edit().putInt(KEY_PORT, port).apply();
                String ip2 = NetworkUtils.getLocalIpAddress(this);
                synchronized (STATE_LOCK) { serverUrl = "http://" + ip2 + ":" + port; }
                AppLogger.log("ServerService", "Port conflict: switched to " + port);
                final int toastPort = port;
                new Handler(Looper.getMainLooper()).post(() ->
                        Toast.makeText(getApplicationContext(), getString(R.string.toast_port_busy_switched, toastPort), Toast.LENGTH_LONG).show());
            }
            setState(true, getServerUrl(), null);

            prefs.edit().putBoolean(KEY_WAS_RUNNING, true).apply();

            AppLogger.log("ServerService", "Server successfully bound to port " + port);

            // Update notification with final URL (in case IP resolved late or port fallback)
            Notification updated = buildNotification(getServerUrl(), storage.getRootName());
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, updated);
            }

            registerNetworkCallback();

            notifyListener(true, getServerUrl(), null);
        } else {
            String errMsg = lastEx != null && lastEx.getMessage() != null ? lastEx.getMessage() : "Failed to start server";
            setState(false, "", errMsg);
            AppLogger.log("ServerService", "Error starting server: " + errMsg, lastEx);
            notifyListener(false, "", errMsg);
            prefs.edit().putBoolean(KEY_WAS_RUNNING, false).apply();
            releaseWakeLock();
            releaseWifiLock();
            unregisterNetworkCallback();
            try {
                androidx.core.app.ServiceCompat.stopForeground(this, androidx.core.app.ServiceCompat.STOP_FOREGROUND_REMOVE);
            } catch (Exception ignored) {}
            stopSelf();
        }
    }

    private final Runnable networkCheckRunnable = () -> {
        if (!isRunning() || server == null) return;
        String newIp = NetworkUtils.getLocalIpAddress(ServerService.this);
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        int currentPort = server.getListeningPort() > 0 ? server.getListeningPort() : prefs.getInt(KEY_PORT, 8080);
        String newUrl = "http://" + newIp + ":" + currentPort;
        String curUrl = getServerUrl();
        if (!newUrl.equals(curUrl)) {
            AppLogger.log("ServerService", "Network change detected: " + curUrl + " -> " + newUrl);
            synchronized (STATE_LOCK) { serverUrl = newUrl; }

            String folderName = storage != null ? storage.getRootName() : prefs.getString(KEY_FOLDER_NAME, "Selected Folder");
            Notification updated = buildNotification(newUrl, folderName);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(NOTIFICATION_ID, updated);
            }

            notifyListener(true, newUrl, null);
        }
    };

    private void handleNetworkChange() {
        mainHandler.removeCallbacks(networkCheckRunnable);
        mainHandler.postDelayed(networkCheckRunnable, 800);
    }

    private void registerNetworkCallback() {
        if (connectivityManager == null) {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        }
        if (networkCallback == null && connectivityManager != null) {
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) {
                    handleNetworkChange();
                }

                @Override
                public void onLost(@NonNull Network network) {
                    handleNetworkChange();
                }

                @Override
                public void onLinkPropertiesChanged(@NonNull Network network, @NonNull LinkProperties linkProperties) {
                    handleNetworkChange();
                }

                @Override
                public void onCapabilitiesChanged(@NonNull Network network, @NonNull android.net.NetworkCapabilities networkCapabilities) {
                    handleNetworkChange();
                }
            };
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    connectivityManager.registerDefaultNetworkCallback(networkCallback);
                } else {
                    NetworkRequest request = new NetworkRequest.Builder().build();
                    connectivityManager.registerNetworkCallback(request, networkCallback);
                }
                AppLogger.log("ServerService", "ConnectivityManager.NetworkCallback registered");
            } catch (Exception e) {
                AppLogger.log("ServerService", "Failed to register network callback: " + e.getMessage());
            }
        }
    }

    private void unregisterNetworkCallback() {
        mainHandler.removeCallbacks(networkCheckRunnable);
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
                AppLogger.log("ServerService", "ConnectivityManager.NetworkCallback unregistered");
            } catch (Exception ignored) {}
            networkCallback = null;
        }
    }

    private void stopServerSilently() {
        if (server != null) {
            try {
                server.stop();
                AppLogger.log("ServerService", "Existing server instance stopped");
            } catch (Exception ignored) {}
            server = null;
        }
    }

    private void stopServer() {
        // Idempotent - avoid duplicate onServerStateChanged that cancels hide animation (e.g., onStartCommand ACTION_STOP + onDestroy)
        if (!isRunning() && server == null && getServerUrl().isEmpty()) {
            unregisterNetworkCallback();
            return;
        }
        boolean wasRunning = isRunning();
        unregisterNetworkCallback();
        stopServerSilently();
        setState(false, "", null);
        AppLogger.log("ServerService", "Server stopped");
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putBoolean(KEY_WAS_RUNNING, false).apply();
        if (wasRunning) {
            notifyListener(false, "", null);
        } else {
            // Already stopped – ensure UI is in stopped state without re-triggering animated hide
            // UI consistency is handled via non-animated path in Activity onResume
        }
        releaseWakeLock();
        releaseWifiLock();
    }

    private Notification buildNotification(String url, String folderName) {
        // Tap notification -> open MainActivity
        Intent openActivityIntent = new Intent(this, MainActivity.class);
        openActivityIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentPendingIntent = PendingIntent.getActivity(
                this, 0, openActivityIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Action: Stop server
        Intent stopIntent = new Intent(this, ServerService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(
                this, 1, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Action: Open Browser -> VIEW url directly
        PendingIntent openBrowserPendingIntent = null;
        if (url != null && !url.isEmpty()) {
            try {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                // Use activity PendingIntent so it opens browser outside app
                browserIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                openBrowserPendingIntent = PendingIntent.getActivity(
                        this, 2, browserIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
                );
            } catch (Exception ignored) {}
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.notification_title_running))
                .setContentText(url)
                .setSubText(folderName)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(contentPendingIntent)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setShowWhen(false)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);

        // Add actions - order: Open Browser, Stop
        if (openBrowserPendingIntent != null) {
            builder.addAction(new NotificationCompat.Action(
                    android.R.drawable.ic_menu_view, getString(R.string.notification_action_open_browser), openBrowserPendingIntent));
        }
        builder.addAction(new NotificationCompat.Action(
                android.R.drawable.ic_menu_close_clear_cancel, getString(R.string.notification_action_stop), stopPendingIntent));

        // BigText style for full URL visibility (folder already shown in SubText header)
        builder.setStyle(new NotificationCompat.BigTextStyle()
                .bigText(url));

        return builder.build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.notification_channel_name),
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription(getString(R.string.notification_channel_desc));
            channel.setShowBadge(false);
            channel.enableLights(false);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        stopServer();
        releaseWakeLock();
        releaseWifiLock();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
