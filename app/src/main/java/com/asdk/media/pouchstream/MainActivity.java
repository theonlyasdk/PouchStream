package com.asdk.media.pouchstream;

import android.Manifest;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.text.TextUtils;
import androidx.transition.AutoTransition;
import androidx.transition.TransitionManager;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.OvershootInterpolator;
import android.view.animation.PathInterpolator;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.material.appbar.MaterialToolbar;

public class MainActivity extends AppCompatActivity implements ServerService.ServerListener {

    private TextView tvStatus;
    private TextView tvServerUrl;
    private TextView tvSelectedFolder;
    private TextView tvStorageCapacity;
    private LinearLayout layoutUrlContainer;
    private ViewGroup mainContent;
    private Button btnCopyUrl;
    private Button btnOpenBrowser;
    private Button btnChooseFolder;
    private Button btnToggleServer;

    private ColorStateList defaultButtonTint;
    private SharedPreferences prefs;
    private Uri selectedFolderUri;
    private boolean lastRunningState = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private AlertDialog qrDialog;
    private java.util.concurrent.ExecutorService qrExecutor;

    private final ActivityResultLauncher<Uri> folderPickerLauncher = registerForActivityResult(
            new ActivityResultContracts.OpenDocumentTree(),
            uri -> {
                if (uri != null) {
                    onFolderSelected(uri);
                }
            }
    );

    private final ActivityResultLauncher<String> notificationPermissionLauncher = registerForActivityResult(
            new ActivityResultContracts.RequestPermission(),
            isGranted -> {
                if (!isGranted) {
                    Toast.makeText(this, "Notification permission recommended for background server", Toast.LENGTH_SHORT).show();
                }
            }
    );

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        ThemeHelper.applyFromPrefs(this);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_main);

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.main_root), (v, insets) -> {
            Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
            return insets;
        });

        MaterialToolbar toolbar = findViewById(R.id.toolbar);
        setSupportActionBar(toolbar);

        prefs = getSharedPreferences(ServerService.PREFS_NAME, MODE_PRIVATE);

        initViews();
        loadSavedPreferences();
        updateUiState(ServerService.isRunning(), ServerService.getServerUrl(), false);
        lastRunningState = ServerService.isRunning();
        requestNotificationPermissionIfNeeded();
        checkBatteryOptimization();
    }

    private void initViews() {
        tvStatus = findViewById(R.id.tvStatus);
        tvServerUrl = findViewById(R.id.tvServerUrl);
        tvSelectedFolder = findViewById(R.id.tvSelectedFolder);
        tvStorageCapacity = findViewById(R.id.tvStorageCapacity);
        layoutUrlContainer = findViewById(R.id.layoutUrlContainer);
        mainContent = findViewById(R.id.main_content);
        // Disable default LayoutTransition to avoid conflict with TransitionManager (trivial animateLayoutChanges toggle breaks collapse animation)
        if (mainContent != null) {
            mainContent.setLayoutTransition(null);
        }
        btnCopyUrl = findViewById(R.id.btnCopyUrl);
        btnOpenBrowser = findViewById(R.id.btnOpenBrowser);
        btnChooseFolder = findViewById(R.id.btnChooseFolder);
        btnToggleServer = findViewById(R.id.btnToggleServer);

        defaultButtonTint = btnToggleServer.getBackgroundTintList();

        btnChooseFolder.setOnClickListener(v -> folderPickerLauncher.launch(selectedFolderUri));

        btnToggleServer.setOnClickListener(v -> {
            if (ServerService.isRunning()) {
                stopServerService();
            } else {
                startServerService();
            }
        });

        btnCopyUrl.setOnClickListener(v -> {
            String url = ServerService.getServerUrl();
            if (!TextUtils.isEmpty(url)) {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText("PouchStream URL", url);
                clipboard.setPrimaryClip(clip);
                Toast.makeText(this, "Copied URL to clipboard", Toast.LENGTH_SHORT).show();
            }
        });

        btnOpenBrowser.setOnClickListener(v -> {
            String url = ServerService.getServerUrl();
            if (!TextUtils.isEmpty(url)) {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                startActivity(browserIntent);
            }
        });
    }

    private void loadSavedPreferences() {
        String savedUriStr = prefs.getString(ServerService.KEY_FOLDER_URI, null);

        if (savedUriStr != null) {
            selectedFolderUri = Uri.parse(savedUriStr);
            String fullPath = StorageHelper.getFullDisplayPath(this, selectedFolderUri);
            tvSelectedFolder.setText(fullPath);
        } else {
            tvSelectedFolder.setText("No folder selected");
        }
        updateStorageSummary();
        // Do not call updateUiState here - let caller decide animate flag (prevents duplicate that cancels hide animation)
    }

    private void updateStorageSummary() {
        if (tvStorageCapacity == null) return;
        if (selectedFolderUri != null) {
            try {
                StorageHelper helper = new StorageHelper(this, selectedFolderUri);
                org.json.JSONObject stats = helper.getStorageStats();
                long freeBytes = stats.optLong("freeBytes", 0);
                long totalBytes = stats.optLong("totalBytes", 0);
                if (totalBytes > 0) {
                    String freeStr = formatStorageBytes(freeBytes);
                    String totalStr = formatStorageBytes(totalBytes);
                    tvStorageCapacity.setText(freeStr + " free of " + totalStr);
                    tvStorageCapacity.setVisibility(View.VISIBLE);
                    return;
                }
            } catch (Exception ignored) {}
        }
        tvStorageCapacity.setVisibility(View.GONE);
    }

    private String formatStorageBytes(long bytes) {
        if (bytes <= 0) return "0 B";
        final String[] units = new String[]{"B", "KB", "MB", "GB", "TB"};
        int digitGroups = (int) (Math.log10(bytes) / Math.log10(1024));
        digitGroups = Math.min(digitGroups, units.length - 1);
        return String.format(java.util.Locale.US, "%.1f %s", bytes / Math.pow(1024, digitGroups), units[digitGroups]);
    }

    private void onFolderSelected(Uri uri) {
        try {
            final int takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            getContentResolver().takePersistableUriPermission(uri, takeFlags);

            selectedFolderUri = uri;
            String fullPath = StorageHelper.getFullDisplayPath(this, uri);

            prefs.edit()
                    .putString(ServerService.KEY_FOLDER_URI, uri.toString())
                    .putString(ServerService.KEY_FOLDER_NAME, fullPath)
                    .apply();

            tvSelectedFolder.setText(fullPath);
            updateStorageSummary();
            AppLogger.log("MainActivity", "Selected folder: " + fullPath);
            Toast.makeText(this, "Folder selected: " + fullPath, Toast.LENGTH_SHORT).show();

            if (ServerService.isRunning()) {
                startServerService();
            }
        } catch (Exception e) {
            AppLogger.log("MainActivity", "Failed to persist folder permission: " + e.getMessage(), e);
            Toast.makeText(this, "Failed to persist folder permission: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void startServerService() {
        if (selectedFolderUri == null) {
            Toast.makeText(this, "Please select a folder first!", Toast.LENGTH_SHORT).show();
            folderPickerLauncher.launch(null);
            return;
        }

        // Tap feedback + animate status pulse for "Starting"
        btnToggleServer.animate().cancel();
        btnToggleServer.setScaleX(0.96f);
        btnToggleServer.setScaleY(0.96f);
        btnToggleServer.animate().scaleX(1f).scaleY(1f).setDuration(180).setInterpolator(new DecelerateInterpolator()).start();
        tvStatus.animate().cancel();
        tvStatus.setAlpha(0.6f);
        tvStatus.animate().alpha(1f).setDuration(220).start();

        // Disable controls while server is starting
        setControlsEnabled(false);
        tvStatus.setText("Starting");

        int port = prefs.getInt(ServerService.KEY_PORT, 8080);

        Intent serviceIntent = new Intent(this, ServerService.class);
        serviceIntent.setAction(ServerService.ACTION_START);
        serviceIntent.putExtra(ServerService.EXTRA_PORT, port);
        serviceIntent.putExtra(ServerService.EXTRA_FOLDER_URI, selectedFolderUri.toString());

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    private void stopServerService() {
        // Disable controls while server is stopping
        setControlsEnabled(false);
        tvStatus.setText("Stopping");

        Intent serviceIntent = new Intent(this, ServerService.class);
        serviceIntent.setAction(ServerService.ACTION_STOP);
        startService(serviceIntent);
    }

    private void setControlsEnabled(boolean enabled) {
        btnToggleServer.setEnabled(enabled);
        btnChooseFolder.setEnabled(enabled);
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
    }

    private void checkBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                boolean alreadyPrompted = prefs.getBoolean("battery_opt_prompted", false);
                if (!alreadyPrompted) {
                    new AlertDialog.Builder(this)
                            .setTitle("Keep server running in background?")
                            .setMessage("To prevent Android from killing PouchStream in background, please allow it to run without battery restrictions.\n\nTap \"Allow\" to open settings and choose \"Don't optimize\".")
                            .setPositiveButton("Allow", (d, w) -> {
                                prefs.edit().putBoolean("battery_opt_prompted", true).apply();
                                try {
                                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                                    intent.setData(Uri.parse("package:" + getPackageName()));
                                    startActivity(intent);
                                } catch (Exception e) {
                                    try {
                                        startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                                    } catch (Exception ignored) {}
                                }
                            })
                            .setNegativeButton("Later", (d, w) -> prefs.edit().putBoolean("battery_opt_prompted", true).apply())
                            .setCancelable(false)
                            .show();
                }
            }
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.menu_main, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(@NonNull MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_qrcode) {
            showQrCodeDialog();
            return true;
        } else if (id == R.id.action_logs) {
            startActivity(new Intent(this, LogActivity.class));
            return true;
        } else if (id == R.id.action_settings) {
            startActivity(new Intent(this, SettingsActivity.class));
            return true;
        } else if (id == R.id.action_about) {
            showAboutDialog();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private void showQrCodeDialog() {
        if (!ServerService.isRunning() || TextUtils.isEmpty(ServerService.getServerUrl())) {
            if (selectedFolderUri == null) {
                new AlertDialog.Builder(this)
                        .setTitle("Server Not Running")
                        .setMessage("No folder is selected and server is stopped. Please choose a folder to start the server.")
                        .setPositiveButton("Choose Folder", (d, w) -> folderPickerLauncher.launch(null))
                        .setNegativeButton("Cancel", null)
                        .show();
            } else {
                new AlertDialog.Builder(this)
                        .setTitle("Server Not Running")
                        .setMessage("The server is currently stopped. Would you like to start the server now to share the QR code?")
                        .setPositiveButton("Start Server", (d, w) -> {
                            startServerService();
                            mainHandler.postDelayed(this::showQrCodeDialog, 800);
                        })
                        .setNegativeButton("Cancel", null)
                        .show();
            }
            return;
        }

        if (qrDialog != null && qrDialog.isShowing()) {
            try {
                qrDialog.dismiss();
            } catch (Exception ignored) {}
            qrDialog = null;
        }
        if (qrExecutor != null && !qrExecutor.isShutdown()) {
            qrExecutor.shutdownNow();
            qrExecutor = null;
        }

        String url = ServerService.getServerUrl();
        View dialogView = getLayoutInflater().inflate(R.layout.dialog_qr_code, null);
        TextView tvUrl = dialogView.findViewById(R.id.tvQrServerUrl);
        android.widget.ProgressBar progressBar = dialogView.findViewById(R.id.qrProgressBar);
        android.widget.ImageView ivQr = dialogView.findViewById(R.id.ivQrCode);

        tvUrl.setText(url);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle("Share Server via QR Code")
                .setView(dialogView)
                .setPositiveButton("Close", null)
                .setNeutralButton("Copy Link", (d, w) -> {
                    ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    ClipData clip = ClipData.newPlainText("PouchStream URL", url);
                    clipboard.setPrimaryClip(clip);
                    Toast.makeText(this, "Copied URL to clipboard", Toast.LENGTH_SHORT).show();
                })
                .create();

        dialog.setOnDismissListener(d -> {
            if (qrDialog == dialog) {
                qrDialog = null;
            }
            if (qrExecutor != null && !qrExecutor.isShutdown()) {
                qrExecutor.shutdownNow();
                qrExecutor = null;
            }
        });

        qrDialog = dialog;
        dialog.show();

        qrExecutor = java.util.concurrent.Executors.newSingleThreadExecutor();
        qrExecutor.execute(() -> {
            try {
                int size = 600;
                com.google.zxing.qrcode.QRCodeWriter writer = new com.google.zxing.qrcode.QRCodeWriter();
                java.util.Map<com.google.zxing.EncodeHintType, Object> hints = new java.util.EnumMap<>(com.google.zxing.EncodeHintType.class);
                hints.put(com.google.zxing.EncodeHintType.MARGIN, 1);
                com.google.zxing.common.BitMatrix bitMatrix = writer.encode(url, com.google.zxing.BarcodeFormat.QR_CODE, size, size, hints);
                if (Thread.currentThread().isInterrupted()) return;
                int width = bitMatrix.getWidth();
                int height = bitMatrix.getHeight();
                int[] pixels = new int[width * height];
                for (int y = 0; y < height; y++) {
                    int offset = y * width;
                    for (int x = 0; x < width; x++) {
                        pixels[offset + x] = bitMatrix.get(x, y) ? Color.BLACK : Color.WHITE;
                    }
                }
                if (Thread.currentThread().isInterrupted()) return;
                android.graphics.Bitmap bitmap = android.graphics.Bitmap.createBitmap(width, height, android.graphics.Bitmap.Config.RGB_565);
                bitmap.setPixels(pixels, 0, width, 0, 0, width, height);

                runOnUiThread(() -> {
                    if (!isFinishing() && !isDestroyed() && qrDialog != null && qrDialog.isShowing()) {
                        progressBar.setVisibility(View.GONE);
                        ivQr.setImageBitmap(bitmap);
                        ivQr.setVisibility(View.VISIBLE);
                    }
                });
            } catch (Exception e) {
                AppLogger.log("MainActivity", "Failed to generate QR code: " + e.getMessage(), e);
                runOnUiThread(() -> {
                    if (!isFinishing() && !isDestroyed() && qrDialog != null && qrDialog.isShowing()) {
                        progressBar.setVisibility(View.GONE);
                        Toast.makeText(MainActivity.this, "Failed to generate QR code", Toast.LENGTH_SHORT).show();
                    }
                });
            }
        });
    }

    private void showAboutDialog() {
        new AlertDialog.Builder(this)
                .setTitle("About PouchStream")
                .setMessage("PouchStream by theonlyasdk\n\nA lightweight local server for media streaming and remote file management.")
                .setPositiveButton("OK", null)
                .show();
    }

    private void updateKeepAwake(boolean running) {
        boolean keepAwake = prefs.getBoolean(ServerService.KEY_KEEP_AWAKE, false);
        if (running && keepAwake) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        ServerService.setListener(this);
        loadSavedPreferences();
        boolean nowRunning = ServerService.isRunning();
        // Animate only if running state changed while paused (e.g., stopped via notification). Button stop while resumed is handled via onServerStateChanged with animate=true.
        boolean animate = nowRunning != lastRunningState;
        updateUiState(nowRunning, ServerService.getServerUrl(), animate);
        updateKeepAwake(nowRunning);
        lastRunningState = nowRunning;
    }

    @Override
    protected void onPause() {
        super.onPause();
        lastRunningState = ServerService.isRunning();
        ServerService.setListener(null);
    }

    private void updateUiState(boolean running, String url) {
        updateUiState(running, url, true);
    }

    private android.view.animation.Interpolator getEaseInOutInterpolator() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            return new PathInterpolator(0.4f, 0f, 0.2f, 1f);
        } else {
            return new AccelerateDecelerateInterpolator();
        }
    }

    private void beginEaseInOutTransition() {
        if (mainContent == null) return;
        AutoTransition transition = new AutoTransition();
        transition.setDuration(420);
        transition.setInterpolator(getEaseInOutInterpolator());
        // Let ChangeBounds + Fade animate together for smooth slide of siblings
        TransitionManager.beginDelayedTransition(mainContent, transition);
    }

    private void updateUiState(boolean running, String url, boolean animate) {
        updateKeepAwake(running);
        if (running) {
            boolean wasVisible = layoutUrlContainer.getVisibility() == View.VISIBLE;
            tvStatus.setText("Running");
            tvServerUrl.setText(url);
            btnToggleServer.setText("Stop Server");
            btnToggleServer.setBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#C62828")));
            btnChooseFolder.setEnabled(false);
            btnToggleServer.setEnabled(true);

            if (animate) {
                // Animate status text: scale pop + fade with ease in-out
                tvStatus.animate().cancel();
                tvStatus.setScaleX(0.85f);
                tvStatus.setScaleY(0.85f);
                tvStatus.setAlpha(0f);
                tvStatus.animate().scaleX(1f).scaleY(1f).alpha(1f)
                        .setDuration(380).setInterpolator(new OvershootInterpolator(2f)).start();

                // Animate toggle button color change with scale bounce
                btnToggleServer.animate().cancel();
                btnToggleServer.setScaleX(0.92f);
                btnToggleServer.setScaleY(0.92f);
                btnToggleServer.animate().scaleX(1f).scaleY(1f)
                        .setDuration(320).setInterpolator(new OvershootInterpolator(1.8f)).start();

                // Fade + slide in the Web Access URL section fully — siblings slide via parent Transition
                if (!wasVisible) {
                    layoutUrlContainer.animate().cancel();
                    // Prepare children for staggered fade
                    tvServerUrl.setAlpha(0f);
                    btnCopyUrl.setAlpha(0f);
                    btnOpenBrowser.setAlpha(0f);
                    btnCopyUrl.setTranslationY(16f);
                    btnOpenBrowser.setTranslationY(16f);

                    layoutUrlContainer.setAlpha(0f);
                    layoutUrlContainer.setTranslationY(28f);
                    if (mainContent != null) {
                        beginEaseInOutTransition();
                    }
                    layoutUrlContainer.setVisibility(View.VISIBLE);
                    layoutUrlContainer.animate().alpha(1f).translationY(0f)
                            .setDuration(420).setInterpolator(getEaseInOutInterpolator()).start();

                    tvServerUrl.animate().alpha(1f).setDuration(320).setStartDelay(120)
                            .setInterpolator(new DecelerateInterpolator()).start();
                    btnCopyUrl.animate().alpha(1f).translationY(0f).setDuration(340).setStartDelay(160)
                            .setInterpolator(getEaseInOutInterpolator()).start();
                    btnOpenBrowser.animate().alpha(1f).translationY(0f).setDuration(340).setStartDelay(200)
                            .setInterpolator(getEaseInOutInterpolator()).start();
                } else {
                    // Already visible — just fade in the URL text change
                    tvServerUrl.setAlpha(0f);
                    tvServerUrl.animate().alpha(1f).setDuration(280).setInterpolator(getEaseInOutInterpolator()).start();
                    layoutUrlContainer.setAlpha(1f);
                    layoutUrlContainer.setTranslationY(0f);
                }
            } else {
                layoutUrlContainer.animate().cancel();
                tvServerUrl.animate().cancel();
                btnCopyUrl.animate().cancel();
                btnOpenBrowser.animate().cancel();
                tvStatus.animate().cancel();
                btnToggleServer.animate().cancel();
                layoutUrlContainer.setAlpha(1f);
                layoutUrlContainer.setTranslationY(0f);
                layoutUrlContainer.setVisibility(View.VISIBLE);
                tvServerUrl.setAlpha(1f);
                btnCopyUrl.setAlpha(1f);
                btnOpenBrowser.setAlpha(1f);
                btnCopyUrl.setTranslationY(0f);
                btnOpenBrowser.setTranslationY(0f);
                tvStatus.setAlpha(1f);
                tvStatus.setScaleX(1f);
                tvStatus.setScaleY(1f);
                btnToggleServer.setScaleX(1f);
                btnToggleServer.setScaleY(1f);
            }
        } else {
            boolean wasVisible = layoutUrlContainer.getVisibility() == View.VISIBLE;
            tvStatus.setText("Stopped");
            btnToggleServer.setText("Start Server");
            if (defaultButtonTint != null) {
                btnToggleServer.setBackgroundTintList(defaultButtonTint);
            } else {
                btnToggleServer.setBackgroundTintList(ColorStateList.valueOf(Color.parseColor("#1E88E5")));
            }
            btnChooseFolder.setEnabled(true);
            btnToggleServer.setEnabled(true);

            if (animate && wasVisible) {
                // Ease-in-out slide: let Transition animate ChangeBounds so siblings (Shared Folder, button) glide smoothly
                tvStatus.animate().cancel();
                tvStatus.setScaleX(0.9f);
                tvStatus.setScaleY(0.9f);
                tvStatus.animate().scaleX(1f).scaleY(1f).setDuration(250).setInterpolator(getEaseInOutInterpolator()).start();

                // Cancel any ongoing animators and ensure clean state for Fade transition
                layoutUrlContainer.animate().cancel();
                tvServerUrl.animate().cancel();
                btnCopyUrl.animate().cancel();
                btnOpenBrowser.animate().cancel();
                tvServerUrl.setAlpha(1f);
                btnCopyUrl.setAlpha(1f);
                btnOpenBrowser.setAlpha(1f);
                layoutUrlContainer.setAlpha(1f);
                layoutUrlContainer.setTranslationY(0f);
                btnCopyUrl.setTranslationY(0f);
                btnOpenBrowser.setTranslationY(0f);

                // Begin transition immediately before visibility change so ChangeBounds+Fade animate siblings and container as a group
                if (mainContent != null) {
                    AutoTransition transition = new AutoTransition();
                    transition.setDuration(420);
                    transition.setInterpolator(getEaseInOutInterpolator());
                    transition.addListener(new androidx.transition.TransitionListenerAdapter() {
                        @Override
                        public void onTransitionEnd(androidx.transition.Transition trans) {
                            // Reset for next show after collapse completes
                            layoutUrlContainer.setAlpha(1f);
                            layoutUrlContainer.setTranslationY(0f);
                            tvServerUrl.setText("");
                            tvServerUrl.setAlpha(1f);
                            btnCopyUrl.setAlpha(1f);
                            btnOpenBrowser.setAlpha(1f);
                            btnCopyUrl.setTranslationY(0f);
                            btnOpenBrowser.setTranslationY(0f);
                            trans.removeListener(this);
                        }
                    });
                    TransitionManager.beginDelayedTransition(mainContent, transition);
                }
                layoutUrlContainer.setVisibility(View.GONE);
            } else {
                layoutUrlContainer.animate().cancel();
                layoutUrlContainer.setVisibility(View.GONE);
                layoutUrlContainer.setAlpha(1f);
                layoutUrlContainer.setTranslationY(0f);
                tvServerUrl.setText("");
                tvServerUrl.setAlpha(1f);
                btnCopyUrl.setAlpha(1f);
                btnOpenBrowser.setAlpha(1f);
                btnCopyUrl.setTranslationY(0f);
                btnOpenBrowser.setTranslationY(0f);
            }
        }
    }

    @Override
    public void onServerStateChanged(boolean running, String url, String error) {
        Runnable doUpdate = () -> {
            lastRunningState = running;
            updateUiState(running, url, true);

            if (error != null) {
                Toast.makeText(this, "Server error: " + error, Toast.LENGTH_LONG).show();
                // Open logs activity if an error happens while starting the server
                Intent logIntent = new Intent(MainActivity.this, LogActivity.class);
                startActivity(logIntent);
            }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) {
            doUpdate.run();
        } else {
            runOnUiThread(doUpdate);
        }
    }

    @Override
    protected void onDestroy() {
        if (qrDialog != null && qrDialog.isShowing()) {
            try {
                qrDialog.dismiss();
            } catch (Exception ignored) {}
            qrDialog = null;
        }
        if (qrExecutor != null && !qrExecutor.isShutdown()) {
            qrExecutor.shutdownNow();
            qrExecutor = null;
        }
        mainHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}