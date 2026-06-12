package com.forwardtecno.forwardchat;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.BridgeActivity;

import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Cold start: el WebView aún carga; diferir hasta que el bridge exista
        handleSendIntent(getIntent(), 2500);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSendIntent(intent, 300);
    }

    /** Recibe texto/URLs del menú Compartir del sistema y los pasa al WebView. */
    private void handleSendIntent(Intent intent, long delayMs) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (intent.getType() == null || !intent.getType().startsWith("text/")) return;
        final String shared = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (shared == null || shared.trim().isEmpty()) return;

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("text", shared);
                getBridge().triggerWindowJSEvent("shareReceived", payload.toString());
            } catch (Exception ignored) {
                // Sin bridge todavía: el usuario puede volver a compartir
            }
        }, delayMs);
    }
}
