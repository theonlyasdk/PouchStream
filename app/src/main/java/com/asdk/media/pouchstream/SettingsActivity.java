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
    private SwitchMaterial switchAutoStart;
    private SwitchMaterial switchReadOnly;
    private SwitchMaterial switchKeepAwake;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        ThemeHelper.applyFromPrefs(this);
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
        switchAutoStart = findViewById(R.id.switchAutoStart);
        switchReadOnly = findViewById(R.id.switchReadOnly);
        switchKeepAwake = findViewById(R.id.switchKeepAwake);

        // Theme
        findViewById(R.id.pref_theme).setOnClickListener(v -> showThemeDialog());

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
                Toast.makeText(this, newVal ? "Autostart enabled" : "Autostart disabled", Toast.LENGTH_SHORT).show();
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
                Toast.makeText(this, newVal ? "Read-only enabled — writes blocked" : "Read-only disabled", Toast.LENGTH_SHORT).show();
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
                Toast.makeText(this, newVal ? "Keep awake enabled" : "Keep awake disabled", Toast.LENGTH_SHORT).show();
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
                tvPrefBatterySummary.setText("Unrestricted — server stays alive in background");
            } else {
                tvPrefBatterySummary.setText("Optimized — tap to allow unrestricted");
            }
        } else {
            tvPrefBatterySummary.setText("Not required on this Android version");
        }
    }

    private void requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            Toast.makeText(this, "Not required on this Android version", Toast.LENGTH_SHORT).show();
            return;
        }
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) {
            Toast.makeText(this, "Already unrestricted", Toast.LENGTH_SHORT).show();
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
                Toast.makeText(this, "Unable to open battery settings: " + ex.getMessage(), Toast.LENGTH_LONG).show();
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
            tvPrefFolderSummary.setText("No folder selected");
        }
    }

    private void updateThemeSummary() {
        if (tvPrefThemeSummary == null) return;
        String theme = prefs.getString(ThemeHelper.KEY_THEME, ThemeHelper.THEME_SYSTEM);
        tvPrefThemeSummary.setText(ThemeHelper.getThemeLabel(theme));
    }

    private void showThemeDialog() {
        String current = prefs.getString(ThemeHelper.KEY_THEME, ThemeHelper.THEME_SYSTEM);
        String[] labels = {"System default", "Light", "Dark"};
        String[] values = {ThemeHelper.THEME_SYSTEM, ThemeHelper.THEME_LIGHT, ThemeHelper.THEME_DARK};
        int checked = 0;
        for (int i = 0; i < values.length; i++) if (values[i].equals(current)) checked = i;
        new AlertDialog.Builder(this)
                .setTitle("Choose theme")
                .setSingleChoiceItems(labels, checked, (d, which) -> {
                    String sel = values[which];
                    prefs.edit().putString(ThemeHelper.KEY_THEME, sel).apply();
                    ThemeHelper.applyTheme(sel);
                    updateThemeSummary();
                    d.dismiss();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void updateAutoStartSummary() {
        if (tvPrefAutoStartSummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_AUTO_START, true);
        tvPrefAutoStartSummary.setText(enabled ? "Enabled — restarts after reboot" : "Disabled");
        if (switchAutoStart != null) switchAutoStart.setChecked(enabled);
    }

    private void updateReadOnlySummary() {
        if (tvPrefReadOnlySummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_READ_ONLY, false);
        tvPrefReadOnlySummary.setText(enabled ? "Enabled — uploads & edits blocked" : "Disabled");
        if (switchReadOnly != null) switchReadOnly.setChecked(enabled);
    }

    private void updateKeepAwakeSummary() {
        if (tvPrefKeepAwakeSummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_KEEP_AWAKE, false);
        tvPrefKeepAwakeSummary.setText(enabled ? "Enabled — Wi-Fi high-perf + screen on" : "Disabled");
        if (switchKeepAwake != null) switchKeepAwake.setChecked(enabled);
    }

    private void updateAuthSummary() {
        if (tvPrefAuthSummary == null) return;
        boolean enabled = prefs.getBoolean(ServerService.KEY_AUTH_ENABLED, false);
        if (!enabled) {
            tvPrefAuthSummary.setText("Disabled — anyone on Wi-Fi can access");
        } else {
            String user = prefs.getString(ServerService.KEY_AUTH_USER, "");
            tvPrefAuthSummary.setText("Enabled — user: " + (user.isEmpty() ? "(not set)" : user));
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
        enableSwitch.setText("Require username & password");
        enableSwitch.setChecked(enabled);
        LinearLayout.LayoutParams swLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        swLp.bottomMargin = (int) (16 * getResources().getDisplayMetrics().density);
        container.addView(enableSwitch, swLp);

        // Username — Material OutlinedBox, no bottom divider
        TextInputLayout tilUser = new TextInputLayout(this, null, com.google.android.material.R.attr.textInputOutlinedStyle);
        tilUser.setHint("Username");
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
        tilPass.setHint("Password");
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
                .setTitle("Connection security")
                .setView(container)
                .setPositiveButton("Save", (d, w) -> {
                    boolean wantEnabled = enableSwitch.isChecked();
                    String user = etUser.getText() != null ? etUser.getText().toString().trim() : "";
                    String pass = etPass.getText() != null ? etPass.getText().toString() : "";
                    if (wantEnabled) {
                        if (user.isEmpty() || pass.isEmpty()) {
                            Toast.makeText(this, "Username and password required", Toast.LENGTH_SHORT).show();
                            return;
                        }
                        prefs.edit()
                                .putBoolean(ServerService.KEY_AUTH_ENABLED, true)
                                .putString(ServerService.KEY_AUTH_USER, user)
                                .putString(ServerService.KEY_AUTH_PASS, pass)
                                .apply();
                        Toast.makeText(this, "Password protection enabled — restart server to apply", Toast.LENGTH_LONG).show();
                    } else {
                        prefs.edit().putBoolean(ServerService.KEY_AUTH_ENABLED, false).apply();
                        Toast.makeText(this, "Password protection disabled", Toast.LENGTH_SHORT).show();
                    }
                    updateAuthSummary();
                })
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Disable", (d, w) -> {
                    prefs.edit().putBoolean(ServerService.KEY_AUTH_ENABLED, false).apply();
                    updateAuthSummary();
                    Toast.makeText(this, "Password protection disabled", Toast.LENGTH_SHORT).show();
                })
                .show();
    }

    private void showClearCacheDialog() {
        long cacheBytes = getDirSize(getCacheDir()) + getDirSize(getExternalCacheDir());
        int logCount = AppLogger.getAllLogs().size();
        String msg = "Clear " + formatBytes(cacheBytes) + " of temp files and " + logCount + " log entries?\n\nThis frees space and clears diagnostic logs.";
        new AlertDialog.Builder(this)
                .setTitle("Clear cache & logs")
                .setMessage(msg)
                .setPositiveButton("Clear", (d, w) -> {
                    int logsCleared = logCount;
                    AppLogger.clear();
                    long freed = clearDir(getCacheDir()) + clearDir(getExternalCacheDir());
                    // Also clear NanoHTTPD temp files in cache
                    File codeCache = getCodeCacheDir();
                    if (codeCache != null) clearDir(codeCache);
                    Toast.makeText(this, "Cleared " + formatBytes(freed) + " and " + logsCleared + " logs", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
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
        final String[] portOptions = {"8080 (Default)", "8000", "8888", "Custom port..."};
        final int[] portValues = {8080, 8000, 8888, -1};

        new AlertDialog.Builder(this)
                .setTitle("Select Server Port")
                .setItems(portOptions, (dialog, which) -> {
                    int selected = portValues[which];
                    if (selected == -1) {
                        showCustomPortDialog();
                    } else {
                        savePort(selected);
                    }
                })
                .setNegativeButton("Cancel", null)
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
                .setTitle("Custom Server Port")
                .setMessage("Enter a port number between 1024 and 65535:")
                .setView(container)
                .setPositiveButton("Save", (dialog, which) -> {
                    String str = input.getText().toString().trim();
                    try {
                        int port = Integer.parseInt(str);
                        if (port < 1024 || port > 65535) {
                            Toast.makeText(this, "Port must be between 1024 and 65535", Toast.LENGTH_SHORT).show();
                        } else {
                            savePort(port);
                        }
                    } catch (NumberFormatException e) {
                        Toast.makeText(this, "Invalid port number", Toast.LENGTH_SHORT).show();
                    }
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void savePort(int port) {
        prefs.edit().putInt(ServerService.KEY_PORT, port).apply();
        tvPrefPortSummary.setText(String.valueOf(port));
        Toast.makeText(this, "Port set to " + port, Toast.LENGTH_SHORT).show();
    }

    private void showIpDialog() {
        String ip = NetworkUtils.getLocalIpAddress(this);
        new AlertDialog.Builder(this)
                .setTitle("Device IP Address")
                .setMessage("Local IPv4 Address:\n" + ip + "\n\nClients on the same local Wi-Fi or Hotspot can access PouchStream through this address.")
                .setPositiveButton("Copy IP", (dialog, which) -> {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    ClipData clip = ClipData.newPlainText("IP Address", ip);
                    clipboard.setPrimaryClip(clip);
                    Toast.makeText(this, "Copied IP to clipboard", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Close", null)
                .show();
    }

    private void showResetFolderDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Reset Shared Folder")
                .setMessage("Unlink the currently selected directory? You will be prompted to pick a folder again on the main screen.")
                .setPositiveButton("Unlink", (dialog, which) -> {
                    prefs.edit()
                            .remove(ServerService.KEY_FOLDER_URI)
                            .remove(ServerService.KEY_FOLDER_NAME)
                            .apply();
                    tvPrefFolderSummary.setText("No folder selected");
                    Toast.makeText(this, "Folder selection reset", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void showResetDefaultsDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Reset to Defaults")
                .setMessage("Reset all settings to default values (Port 8080, theme system, autostart on, no password)?")
                .setPositiveButton("Reset", (dialog, which) -> {
                    prefs.edit()
                            .putInt(ServerService.KEY_PORT, 8080)
                            .putString(ThemeHelper.KEY_THEME, ThemeHelper.THEME_SYSTEM)
                            .putBoolean(ServerService.KEY_AUTO_START, true)
                            .putBoolean(ServerService.KEY_AUTH_ENABLED, false)
                            .putBoolean(ServerService.KEY_READ_ONLY, false)
                            .putBoolean(ServerService.KEY_KEEP_AWAKE, false)
                            .apply();
                    ThemeHelper.applyTheme(ThemeHelper.THEME_SYSTEM);
                    updateSummaries();
                    updateThemeSummary();
                    updateAutoStartSummary();
                    updateAuthSummary();
                    updateReadOnlySummary();
                    updateKeepAwakeSummary();
                    Toast.makeText(this, "Settings restored to default", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }
}
