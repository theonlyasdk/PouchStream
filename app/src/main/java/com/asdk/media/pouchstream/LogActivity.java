package com.asdk.media.pouchstream;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Menu;
import android.view.MenuItem;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.EdgeToEdge;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.google.android.material.appbar.MaterialToolbar;

public class LogActivity extends AppCompatActivity implements AppLogger.LogListener {

    private TextView tvLogs;
    private ScrollView scrollView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        ThemeHelper.applyFromPrefs(this);
        ThemeHelper.applyDynamicColorsIfAvailable(this);
        super.onCreate(savedInstanceState);
        EdgeToEdge.enable(this);
        setContentView(R.layout.activity_log);

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.log_root), (v, insets) -> {
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

        tvLogs = findViewById(R.id.tvLogs);
        scrollView = findViewById(R.id.scrollView);

        renderLogs();
    }

    private void renderLogs() {
        String allLogs = AppLogger.getAllLogsText();
        if (TextUtils.isEmpty(allLogs.trim())) {
            tvLogs.setText(getString(R.string.no_logs_recorded));
        } else {
            tvLogs.setText(allLogs);
            scrollView.post(() -> scrollView.fullScroll(ScrollView.FOCUS_DOWN));
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        AppLogger.setListener(this);
        renderLogs();
    }

    @Override
    protected void onPause() {
        super.onPause();
        AppLogger.setListener(null);
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.menu_log, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(@NonNull MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_copy_logs) {
            String logs = AppLogger.getAllLogsText();
            if (!logs.isEmpty()) {
                ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                ClipData clip = ClipData.newPlainText(getString(R.string.clip_label_logs), logs);
                clipboard.setPrimaryClip(clip);
                Toast.makeText(this, getString(R.string.toast_logs_copied), Toast.LENGTH_SHORT).show();
            }
            return true;
        } else if (id == R.id.action_clear_logs) {
            AppLogger.clear();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    @Override
    public void onNewLog(String logEntry) {
        runOnUiThread(() -> {
            String current = tvLogs.getText().toString();
            if (current.equals(getString(R.string.no_logs_recorded))) {
                tvLogs.setText(logEntry + "\n");
            } else {
                tvLogs.append(logEntry + "\n");
            }
            scrollView.post(() -> scrollView.fullScroll(ScrollView.FOCUS_DOWN));
        });
    }

    @Override
    public void onLogsCleared() {
        runOnUiThread(() -> tvLogs.setText(getString(R.string.no_logs_recorded)));
    }
}
