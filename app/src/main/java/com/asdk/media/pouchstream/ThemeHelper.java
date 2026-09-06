package com.asdk.media.pouchstream;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.appcompat.app.AppCompatDelegate;

import com.google.android.material.color.DynamicColors;

public class ThemeHelper {

    public static final String KEY_THEME = "key_theme";
    public static final String THEME_SYSTEM = "system";
    public static final String THEME_LIGHT = "light";
    public static final String THEME_DARK = "dark";
    public static final String KEY_MATERIAL_YOU = "key_material_you";

    public static void applyTheme(String theme) {
        switch (theme) {
            case THEME_LIGHT:
                AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
                break;
            case THEME_DARK:
                AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
                break;
            case THEME_SYSTEM:
            default:
                AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
                break;
        }
    }

    public static void applyFromPrefs(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(ServerService.PREFS_NAME, Context.MODE_PRIVATE);
        String theme = prefs.getString(KEY_THEME, THEME_SYSTEM);
        applyTheme(theme);
    }

    public static boolean isMaterialYouEnabled(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(ServerService.PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getBoolean(KEY_MATERIAL_YOU, false);
    }

    public static void applyDynamicColorsIfAvailable(Activity activity) {
        if (!isMaterialYouEnabled(activity)) return;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        try {
            DynamicColors.applyToActivityIfAvailable(activity);
        } catch (Exception ignored) {}
    }

    public static String getThemeLabel(Context context, String theme) {
        switch (theme) {
            case THEME_LIGHT: return context.getString(R.string.theme_light);
            case THEME_DARK: return context.getString(R.string.theme_dark);
            case THEME_SYSTEM:
            default: return context.getString(R.string.settings_theme_system_default);
        }
    }

    // Legacy overload for callers without context (fallback to hardcoded English, kept for compatibility)
    public static String getThemeLabel(String theme) {
        switch (theme) {
            case THEME_LIGHT: return "Light";
            case THEME_DARK: return "Dark";
            case THEME_SYSTEM:
            default: return "System default";
        }
    }
}
