package com.asdk.media.pouchstream;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.appcompat.app.AppCompatDelegate;

public class ThemeHelper {

    public static final String KEY_THEME = "key_theme";
    public static final String THEME_SYSTEM = "system";
    public static final String THEME_LIGHT = "light";
    public static final String THEME_DARK = "dark";

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

    public static String getThemeLabel(String theme) {
        switch (theme) {
            case THEME_LIGHT: return "Light";
            case THEME_DARK: return "Dark";
            case THEME_SYSTEM:
            default: return "System default";
        }
    }
}
