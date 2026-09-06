package com.asdk.media.pouchstream;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.material.appbar.MaterialToolbar;
import com.google.android.material.switchmaterial.SwitchMaterial;
import com.google.android.material.textfield.TextInputEditText;
import com.google.android.material.textfield.TextInputLayout;

import java.io.File;

public class SettingsActivity extends AppCompatActivity {

    private SharedPreferences prefs;
    private TextView tvPrefPortSummary;
    private TextView tvPrefIpSummary;
    private TextView tvPrefFolderSummary;
    private TextView tvPrefBatterySummary;
    private TextView tvPrefThemeSummary;
    private TextView tvPrefAuthSummary;
    private TextView tvPrefAutoStartSummary;
    private TextView tvPrefReadOnlySummary;
    private TextView tvPrefKeepAwakeSummary;
    private TextView tvPrefMaterialYouSummary;
    private SwitchMaterial switchAutoStart;
    private SwitchMaterial switchReadOnly;
    private SwitchMaterial switchKeepAwake;
    private SwitchMaterial switchMaterialYou;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        ThemeHelper.applyFromPrefs(this);
        ThemeHelper.applyDynamicColorsIfAvailable(this);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_settings);

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.settings_root), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        MaterialToolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);
        if (getSupportActionBar() != null) {
            getSupportActionBar().setDisplayHomeAsUpEnabled(true);
        }
        toolbar.setNavigationOnClickListener(v -> finish());

        prefs = getSharedPreferences(ServerService.PREFS_NAME, MODE_PRIVATE);

        initPreferences();
        updateSummaries();
        updateBatterySummary();
        updateThemeSummary();
        updateMaterialYouSummary();
        updateAutoStartSummary();
        updateAuthSummary();
        updateReadOnlySummary();
        updateKeepAwakeSummary();
    }

    private void initPreferences() {
        tvPrefPortSummary = findViewById(R.id.tvPrefPortSummary);
        tvPrefIpSummary = findViewById(R.id.tvPrefIpSummary);
        tvPrefFolderSummary = findViewById(R.id.tvPrefFolderSummary);
        tvPrefBatterySummary = findViewById(R.id.tvPrefBatterySummary);
        tvPrefThemeSummary = findViewById(R.id.tvPrefThemeSummary);
        tvPrefAuthSummary = findViewById(R.id.tvPrefAuthSummary);
        tvPrefAutoStartSummary = findViewById(R.id.tvPrefAutoStartSummary);
        tvPrefReadOnlySummary = findViewById(R.id.tvPrefReadOnlySummary);
        tvPrefKeepAwakeSummary = findViewById(R.id.tvPrefKeepAwakeSummary);
        tvPrefMaterialYouSummary = findViewById(R.id.tvPrefMaterialYouSummary);
        switchAutoStart = findViewById(R.id.switchAutoStart);
        switchReadOnly = findViewById(R.id.switchReadOnly);
        switchKeepAwake = findViewById(R.id.switchKeepAwake);
        switchMaterialYou = findViewById(R.id.switchMaterialYou);

        // Theme
        findViewById(R.id.pref_theme).setOnClickListener(v -> showThemeDialog());

        // Material You dynamic colors
        View prefMaterialYou = findViewById(R.id.pref_material_you);
        if (switchMaterialYou != null) {
            boolean enabled = prefs.getBoolean(ThemeHelper.KEY_MATERIAL_YOU, false);
            switchMaterialYou.setChecked(enabled);
            updateMaterialYouSummary();
            prefMaterialYou.setOnClickListener(v -> {
                boolean newVal = !switchMaterialYou.isChecked();
                if (newVal && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) {
                    Toast.makeText(this, getString(R.string.toast_material_you_unavailable), Toast.LENGTH_SHORT).show();
                    return;
                }
                switchMaterialYou.setChecked(newVal);
                prefs.edit().putBoolean(ThemeHelper.KEY_MATERIAL_YOU, newVal).apply();
                updateMaterialYouSummary();
                Toast.makeText(this, getString(newVal ? R.string.toast_material_you_enabled : R.string.toast_material_you_disabled), Toast.LENGTH_SHORT).show();
                recreate();
            });
        }

        // Port
        findViewById(R.id.pref_port).setOnClickListener(v -> showPortDialog());

        // IP
        findViewById(R.id.pref_ip).setOnClickListener(v -> showIpDialog());

        // Reset Folder
        findViewById(R.id.pref_clear_folder).setOnClickListener(v -> showResetFolderDialog());

        // Autostart
        View prefAutoStart = findViewById(R.id.pref_auto_start);
        if (switchAutoStart != null) {
            boolean enabled = prefs.getBoolean(ServerService.KEY_AUTO_START, true);
            switchAutoStart.setChecked(enabled);
            prefAutoStart.setOnClickListener(v -> {
                boolean newVal = !switchAutoStart.isChecked();
                switchAutoStart.setChecked(newVal);
                prefs.edit().putBoolean(ServerService.KEY_AUTO_START, newVal).apply();
                updateAutoStartSummary();
                Toast.makeText(this, getString(newVal ? R.string.toast_autostart_enabled : R.string.toast_autostart_disabled), Toast.LENGTH_SHORT).show();
            });
        }

        // Read-only
        View prefReadOnly = findViewById(R.id.pref_read_only);
        if (switchReadOnly != null) {
            boolean ro = prefs.getBoolean(ServerService.KEY_READ_ONLY, false);
            switchReadOnly.setChecked(ro);
            prefReadOnly.setOnClickListener(v -> {
                boolean newVal = !switchReadOnly.isChecked();
                switchReadOnly.setChecked(newVal);
                prefs.edit().putBoolean(ServerService.KEY_READ_ONLY, newVal).apply();
                updateReadOnlySummary();
                Toast.makeText(this, getString(newVal ? R.string.toast_readonly_enabled : R.string.toast_readonly_disabled), Toast.LENGTH_SHORT).show();
                promptRestartServerIfNeeded("Read-Only Mode");
            });
        }

        // Keep awake (Wi-Fi + screen)
        View prefKeepAwake = findViewById(R.id.pref_keep_awake);
        if (switchKeepAwake != null) {
            boolean ka = prefs.getBoolean(ServerService.KEY_KEEP_AWAKE, false);
            switchKeepAwake.setChecked(ka);
            prefKeepAwake.setOnClickListener(v -> {
                boolean newVal = !switchKeepAwake.isChecked();
                switchKeepAwake.setChecked(newVal);
                prefs.edit().putBoolean(ServerService.KEY_KEEP_AWAKE, newVal).apply();
                updateKeepAwakeSummary();
                Toast.makeText(this, getString(newVal ? R.string.toast_keep_awake_enabled : R.string.toast_keep_awake_disabled), Toast.LENGTH_SHORT).show();
            });
        }

        // Auth
        findViewById(R.id.pref_auth).setOnClickListener(v -> showAuthDialog());

        // Battery Optimization
        findViewById(R.id.pref_battery_opt).setOnClickListener(v -> requestIgnoreBatteryOptimization());

        // Server Logs
        findViewById(R.id.pref_logs).setOnClickListener(v -> {
            startActivity(new Intent(this, LogActivity.class));
        });

        // Clear cache & logs
        findViewById(R.id.pref_clear_cache).setOnClickListener(v -> showClearCacheDialog());

        // Reset to Defaults
        findViewById(R.id.pref_reset).setOnClickListener(v -> showResetDefaultsDialog());
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateBatterySummary();
        updateAuthSummary();
    }

    private void updateBatterySummary() {
        if (tvPrefBatterySummary == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
            if (ignoring) {
                tvPrefBatterySummary.setText(getString(R.string.settings_battery_unrestricted));
            } else {
                tvPrefBatterySummary.setText(getString(R.string.settings_battery_optimized));
            }
        } else {
            tvPrefBatterySummary.setText(getString(R.string.settings_battery_not_required));
        }
    }

    private void requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Toast.makeText(this, getString(R.string.toast_not_required), Toast.LENGTH_SHORT).show();
            return;
        }
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) {
            Toast.makeText(this, getString(R.string.toast_already_unrestricted), Toast.LENGTH_SHORT).show();
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            try {
                startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception ex) {
                Toast.makeText(this, getString(R.string.toast_unable_open_battery, ex.getMessage()), Toast.LENGTH_LONG).show();
            }
        }
    }

    private void updateSummaries() {
        int currentPort = prefs.getInt(ServerService.KEY_PORT, 8080);
        tvPrefPortSummary.setText(String.valueOf(currentPort));

        String ip = NetworkUtils.getLocalIpAddress(this);
        tvPrefIpSummary.setText(ip);

        String folderUriStr = prefs.getString(ServerService.KEY_FOLDER_URI, null);
        if (folderUriStr != null) {
            String fullPath = StorageHelper.getFullDisplayPath(this, Uri.parse(folderUriStr));
            tvPrefFolderSummary.setText(fullPath);
        } else {
            tvPrefFolderSummary.setText(getString(R.string.no_folder_selected));
        }
    }

    private void updateThemeSummary() {
        if (tvPrefThemeSummary == null) return;
        String theme = prefs.getString(ThemeHelper.KEY_THEME, ThemeHelper.THEME_SYSTEM);
        tvPrefThemeSummary.setText(ThemeHelper.getThemeLabel(this, theme));
    }

    private void updateMaterialYouSummary() {
        if (tvPrefMaterialYouSummary == null) return;
        boolean enabled = prefs.getBoolean(ThemeHelper.KEY_MATERIAL_YOU, false);
        if (enabled && android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) {
            tvPrefMaterialYouSummary.setText(getString(R.string.toast_material_you_unavailable));
            if (switchMaterialYou != null) switchMaterialYou.setChecked(false);
            return;
        }
        tvPrefMaterialYouSummary.setText(getString(enabled ? R.string.settings_material_you_enabled : R.string.settings_material_you_disabled));
        if (switchMaterialYou != null) switchMaterialYou.setChecked(enabled);
    }

    private void showThemeDialog() {
        String current = prefs.getString(ThemeHelper.KEY_THEME, ThemeHelper.THEME_SYSTEM);
        String[] labels = {getString(R.string.settings_theme_system_default), getString(R.string.theme_light), getString(R.string.theme_dark)};
        String[] values = {ThemeHelper.THEME_SYSTEM, ThemeHelper.THEME_LIGHT, ThemeHelper.THEME_DARK};
        int checked = 0;
        for (int i = 0; i < values.length; i++) if (values[i].equals(current)) checked = i;
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_choose_theme))
                .setSingleChoiceItems(labels, checked, (d, which) -> {
                    String sel = values[which];
                    prefs.edit().putString(ThemeHelper.KEY_THEME, sel).apply();
                    ThemeHelper.applyTheme(sel);
                    updateThemeSummary();
                    d.dismiss();
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    private void updateAutoStartSummary() {
        if (tvPrefAutoStartSummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_AUTO_START, true);
        tvPrefAutoStartSummary.setText(getString(enabled ? R.string.settings_autostart_enabled : R.string.settings_autostart_disabled));
        if (switchAutoStart != null) switchAutoStart.setChecked(enabled);
    }

    private void updateReadOnlySummary() {
        if (tvPrefReadOnlySummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_READ_ONLY, false);
        tvPrefReadOnlySummary.setText(getString(enabled ? R.string.settings_readonly_enabled : R.string.settings_readonly_disabled));
        if (switchReadOnly != null) switchReadOnly.setChecked(enabled);
    }

    private void updateKeepAwakeSummary() {
        if (tvPrefKeepAwakeSummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_KEEP_AWAKE, false);
        tvPrefKeepAwakeSummary.setText(getString(enabled ? R.string.settings_keep_awake_enabled : R.string.settings_keep_awake_disabled));
        if (switchKeepAwake != null) switchKeepAwake.setChecked(enabled);
    }

    private void updateAuthSummary() {
        if (tvPrefAuthSummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_AUTH_ENABLED, false);
        if (!enabled) {
            tvPrefAuthSummary.setText(getString(R.string.settings_auth_disabled_summary));
        } else {
            String user = prefs.getString(ServerService.KEY_AUTH_USER, "");
            tvPrefAuthSummary.setText(getString(R.string.settings_auth_enabled_summary, (user.isEmpty() ? getString(R.string.settings_auth_enabled_user_not_set) : user)));
        }
    }

    private void showAuthDialog() {
        boolean enabled = prefs.getBoolean(ServerService.KEY_AUTH_ENABLED, false);
        String savedUser = prefs.getString(ServerService.KEY_AUTH_USER, "");
        String savedPass = prefs.getString(ServerService.KEY_AUTH_PASS, "");

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        int padInner = (int) (8 * getResources().getDisplayMetrics().density);
        container.setPadding(pad, padInner, pad, 0);

        SwitchMaterial enableSwitch = new SwitchMaterial(this);
        enableSwitch.setText(getString(R.string.switch_require_auth));
        enableSwitch.setChecked(enabled);
        LinearLayout.LayoutParams swLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        swLp.bottomMargin = (int) (16 * getResources().getDisplayMetrics().density);
        container.addView(enableSwitch, swLp);

        // Username — Material OutlinedBox, no bottom divider
        TextInputLayout tilUser = new TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle);
        tilUser.setHint(getString(R.string.hint_username));
        tilUser.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
        tilUser.setBoxCornerRadii(0f, 0f, 0f, 0f);
        tilUser.setHintEnabled(true);
        TextInputEditText etUser = new TextInputEditText(tilUser.getContext());
        etUser.setText(savedUser);
        etUser.setSingleLine(true);
        etUser.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_NORMAL);
        tilUser.addView(etUser);
        LinearLayout.LayoutParams tilUserLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tilUserLp.bottomMargin = (int) (12 * getResources().getDisplayMetrics().density);
        container.addView(tilUser, tilUserLp);

        // Password — Material OutlinedBox with toggle
        TextInputLayout tilPass = new TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle);
        tilPass.setHint(getString(R.string.hint_password));
        tilPass.setBoxBackgroundMode(TextInputLayout.BOX_BACKGROUND_OUTLINE);
        tilPass.setBoxCornerRadii(0f, 0f, 0f, 0f);
        tilPass.setPasswordVisibilityToggleEnabled(true);
        tilPass.setHintEnabled(true);
        TextInputEditText etPass = new TextInputEditText(tilPass.getContext());
        etPass.setText(savedPass);
        etPass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        tilPass.addView(etPass);
        LinearLayout.LayoutParams tilPassLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        container.addView(tilPass, tilPassLp);

        View.OnClickListener toggleFields = v -> {
            boolean on = enableSwitch.isChecked();
            etUser.setEnabled(on);
            etPass.setEnabled(on);
            tilUser.setEnabled(on);
            tilPass.setEnabled(on);
            tilUser.setAlpha(on ? 1f : 0.5f);
            tilPass.setAlpha(on ? 1f : 0.5f);
        };
        enableSwitch.setOnCheckedChangeListener((b, c) -> toggleFields.onClick(null));
        toggleFields.onClick(null);

        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_connection_security))
                .setView(container)
                .setPositiveButton(getString(R.string.save), (d, w) -> {
                    boolean wantEnabled = enableSwitch.isChecked();
                    String user = etUser.getText() != null ? etUser.getText().toString().trim() : "";
                    String pass = etPass.getText() != null ? etPass.getText().toString() : "";
                    if (wantEnabled) {
                        if (user.isEmpty() || pass.isEmpty()) {
                            Toast.makeText(this, getString(R.string.toast_password_required), Toast.LENGTH_SHORT).show();
                            return;
                        }
                        prefs.edit()
                                .putBoolean(ServerService.KEY_AUTH_ENABLED, true)
                                .putString(ServerService.KEY_AUTH_USER, user)
                                .putString(ServerService.KEY_AUTH_PASS, pass)
                                .apply();
                        Toast.makeText(this, getString(R.string.toast_password_enabled), Toast.LENGTH_SHORT).show();
                        promptRestartServerIfNeeded("Password Protection");
                    } else {
                        prefs.edit().putBoolean(ServerService.KEY_AUTH_ENABLED, false).apply();
                        Toast.makeText(this, getString(R.string.toast_password_disabled), Toast.LENGTH_SHORT).show();
                        promptRestartServerIfNeeded("Password Protection");
                    }
                    updateAuthSummary();
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .setNeutralButton(getString(R.string.disable), (d, w) -> {
                    prefs.edit().putBoolean(ServerService.KEY_AUTH_ENABLED, false).apply();
                    updateAuthSummary();
                    Toast.makeText(this, getString(R.string.toast_password_disabled), Toast.LENGTH_SHORT).show();
                    promptRestartServerIfNeeded("Password Protection");
                })
                .show();
    }

    private void showClearCacheDialog() {
        long cacheBytes = getDirSize(getCacheDir()) + getDirSize(getExternalCacheDir());
        int logCount = AppLogger.getAllLogs().size();
        String msg = getString(R.string.dialog_clear_cache_message, formatBytes(cacheBytes), logCount);
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_clear_cache_title))
                .setMessage(msg)
                .setPositiveButton(getString(R.string.clear), (d, w) -> {
                    int logsCleared = logCount;
                    AppLogger.clear();
                    long freed = clearDir(getCacheDir()) + clearDir(getExternalCacheDir());
                    // Also clear NanoHTTPD temp files in cache
                    File codeCache = getCodeCacheDir();
                    if (codeCache != null) clearDir(codeCache);
                    Toast.makeText(this, getString(R.string.toast_cleared, formatBytes(freed), logsCleared), Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    private long getDirSize(File dir) {
        if (dir == null || !dir.exists()) return 0;
        long total = 0;
        File[] files = dir.listFiles();
        if (files == null) return 0;
        for (File f : files) {
            if (f.isDirectory()) total += getDirSize(f);
            else total += f.length();
        }
        return total;
    }

    private long clearDir(File dir) {
        if (dir == null || !dir.exists()) return 0;
        long freed = 0;
        File[] files = dir.listFiles();
        if (files == null) return 0;
        for (File f : files) {
            if (f.isDirectory()) {
                freed += clearDir(f);
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            } else {
                freed += f.length();
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
        return freed;
    }

    private String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return String.format("%.1f KB", bytes / 1024f);
        return String.format("%.1f MB", bytes / (1024f * 1024f));
    }

    /**
     * Dialog with preset choice list or custom port input.
     */
    private void showPortDialog() {
        final String[] portOptions = {getString(R.string.port_default), "8000", "8888", getString(R.string.port_custom)};
        final int[] portValues = {8080, 8000, 8888, -1};

        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_select_port))
                .setItems(portOptions, (dialog, which) -> {
                    int selected = portValues[which];
                    if (selected == -1) {
                        showCustomPortDialog();
                    } else {
                        savePort(selected);
                    }
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    private void showCustomPortDialog() {
        int currentPort = prefs.getInt(ServerService.KEY_PORT, 8080);

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setText(String.valueOf(currentPort));
        input.setSelection(input.getText().length());

        LinearLayout container = new LinearLayout(this);
        container.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (20 * getResources().getDisplayMetrics().density);
        container.setPadding(padding, (int) (8 * getResources().getDisplayMetrics().density), padding, 0);
        container.addView(input);

        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_custom_port))
                .setMessage(getString(R.string.dialog_custom_port_message))
                .setView(container)
                .setPositiveButton(getString(R.string.save), (dialog, which) -> {
                    String str = input.getText().toString().trim();
                    try {
                        int port = Integer.parseInt(str);
                        if (port < 1024 || port > 65535) {
                            Toast.makeText(this, getString(R.string.toast_port_range_error), Toast.LENGTH_SHORT).show();
                        } else {
                            savePort(port);
                        }
                    } catch (NumberFormatException e) {
                        Toast.makeText(this, getString(R.string.toast_invalid_port), Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    private void savePort(int port) {
        int oldPort = prefs.getInt(ServerService.KEY_PORT, 8080);
        prefs.edit().putInt(ServerService.KEY_PORT, port).apply();
        tvPrefPortSummary.setText(String.valueOf(port));
        Toast.makeText(this, getString(R.string.toast_port_set_to, port), Toast.LENGTH_SHORT).show();
        if (oldPort != port) {
            promptRestartServerIfNeeded("Server Port (" + port + ")");
        }
    }

    private void promptRestartServerIfNeeded(String settingName) {
        if (!ServerService.isRunning()) return;
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_restart_server_title))
                .setMessage(getString(R.string.dialog_restart_server_message, settingName))
                .setPositiveButton(getString(R.string.dialog_restart_now), (d, w) -> {
                    Intent restartIntent = new Intent(this, ServerService.class);
                    restartIntent.setAction(ServerService.ACTION_START);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        startForegroundService(restartIntent);
                    } else {
                        startService(restartIntent);
                    }
                    Toast.makeText(this, getString(R.string.toast_restarting_server), Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton(getString(R.string.later), null)
                .show();
    }

    private void showIpDialog() {
        String ip = NetworkUtils.getLocalIpAddress(this);
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_device_ip_title))
                .setMessage(getString(R.string.dialog_device_ip_message, ip))
                .setPositiveButton(getString(R.string.dialog_copy_ip), (dialog, which) -> {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    ClipData clip = ClipData.newPlainText(getString(R.string.clip_label_ip), ip);
                    clipboard.setPrimaryClip(clip);
                    Toast.makeText(this, getString(R.string.toast_copied_ip), Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Close", null)
                .show();
    }

    private void showResetFolderDialog() {
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_reset_folder_title))
                .setMessage(getString(R.string.dialog_reset_folder_message))
                .setPositiveButton(getString(R.string.dialog_unlink), (dialog, which) -> {
                    prefs.edit()
                            .remove(ServerService.KEY_FOLDER_URI)
                            .remove(ServerService.KEY_FOLDER_NAME)
                            .apply();
                    tvPrefFolderSummary.setText(getString(R.string.no_folder_selected));
                    Toast.makeText(this, getString(R.string.toast_folder_reset), Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }

    private void showResetDefaultsDialog() {
        new AlertDialog.Builder(this)
                .setTitle(getString(R.string.dialog_reset_defaults_title))
                .setMessage(getString(R.string.dialog_reset_defaults_message))
                .setPositiveButton(getString(R.string.reset), (dialog, which) -> {
                    prefs.edit()
                            .putInt(ServerService.KEY_PORT, 8080)
                            .putString(ThemeHelper.KEY_THEME, ThemeHelper.THEME_SYSTEM)
                            .putBoolean(ThemeHelper.KEY_MATERIAL_YOU, false)
                            .putBoolean(ServerService.KEY_AUTO_START, true)
                            .putBoolean(ServerService.KEY_AUTH_ENABLED, false)
                            .putBoolean(ServerService.KEY_READ_ONLY, false)
                            .putBoolean(ServerService.KEY_KEEP_AWAKE, false)
                            .apply();
                    ThemeHelper.applyTheme(ThemeHelper.THEME_SYSTEM);
                    updateSummaries();
                    updateThemeSummary();
                    updateMaterialYouSummary();
                    updateAutoStartSummary();
                    updateAuthSummary();
                    updateReadOnlySummary();
                    updateKeepAwakeSummary();
                    Toast.makeText(this, getString(R.string.toast_settings_restored), Toast.LENGTH_SHORT).show();
                    promptRestartServerIfNeeded("Settings");
                })
                .setNegativeButton(getString(R.string.cancel), null)
                .show();
    }
}
