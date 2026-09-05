package com.asdk.media.pouchstream;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            SharedPreferences prefs = context.getSharedPreferences(ServerService.PREFS_NAME, Context.MODE_PRIVATE);
            boolean autoStart = prefs.getBoolean(ServerService.KEY_AUTO_START, true);
            if (!autoStart) return;
            boolean wasRunning = prefs.getBoolean(ServerService.KEY_WAS_RUNNING, false);
            String uriStr = prefs.getString(ServerService.KEY_FOLDER_URI, null);
            if (wasRunning && uriStr != null) {
                Intent svc = new Intent(context, ServerService.class);
                svc.setAction(ServerService.ACTION_START);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(svc);
                } else {
                    context.startService(svc);
                }
            }
        }
    }
}
