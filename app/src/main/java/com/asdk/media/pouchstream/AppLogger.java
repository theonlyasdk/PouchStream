package com.asdk.media.pouchstream;

import android.os.Handler;
import android.os.Looper;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class AppLogger {

    public interface LogListener {
        void onNewLog(String logEntry);
        void onLogsCleared();
    }

    private static final int MAX_LOGS = 500;
    private static final List<String> logList = new ArrayList<>();
    private static LogListener listener;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final SimpleDateFormat sdf = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    public static synchronized void setListener(LogListener l) {
        listener = l;
    }

    public static synchronized void log(String tag, String message) {
        String timestamp = sdf.format(new Date());
        String entry = "[" + timestamp + "] [" + tag + "] " + message;
        if (logList.size() >= MAX_LOGS) {
            logList.remove(0);
        }
        logList.add(entry);

        LogListener l = listener;
        if (l != null) {
            mainHandler.post(() -> {
                synchronized (AppLogger.class) {
                    if (listener != null) {
                        listener.onNewLog(entry);
                    }
                }
            });
        }
    }

    public static void log(String tag, String message, Throwable tr) {
        log(tag, message + "\n" + android.util.Log.getStackTraceString(tr));
    }

    public static synchronized List<String> getAllLogs() {
        return new ArrayList<>(logList);
    }

    public static synchronized String getAllLogsText() {
        StringBuilder sb = new StringBuilder();
        for (String entry : logList) {
            sb.append(entry).append("\n");
        }
        return sb.toString();
    }

    public static synchronized void clear() {
        logList.clear();
        LogListener l = listener;
        if (l != null) {
            mainHandler.post(() -> {
                synchronized (AppLogger.class) {
                    if (listener != null) {
                        listener.onLogsCleared();
                    }
                }
            });
        }
    }
}
