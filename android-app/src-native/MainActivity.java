package com.ethvelle.app;

import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.util.Log;

import androidx.annotation.Nullable;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.io.IOException;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "Ethvelle";
    private static final String HOST = "localhost";
    private WebView ethvelleWebView;

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        registerPlugin(EthvelleMediaPlugin.class);
        registerPlugin(EthvelleStoragePlugin.class);
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(8, 11, 18));
        getWindow().setNavigationBarColor(Color.rgb(8, 11, 18));
    }

    @Override
    protected void load() {
        bridge = bridgeBuilder.addPlugins(initialPlugins).setConfig(config).create();
        keepRunning = bridge.shouldKeepRunning();
        ethvelleWebView = bridge.getWebView();
        if (ethvelleWebView != null) {
            WebSettings settings = ethvelleWebView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);
            settings.setDisplayZoomControls(false);
            settings.setLoadsImagesAutomatically(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            ethvelleWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            ethvelleWebView.setWebViewClient(new EthvelleWebViewClient(bridge));
        }
        onNewIntent(getIntent());
    }

    private final class EthvelleWebViewClient extends BridgeWebViewClient {
        EthvelleWebViewClient(Bridge bridge) { super(bridge); }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri url = request.getUrl();
            if (!HOST.equalsIgnoreCase(url.getHost())) return super.shouldInterceptRequest(view, request);
            String path = url.getPath() == null ? "" : url.getPath();
            if ("/_ethvelle/bootstrap".equals(path)) return bootstrapResponse();
            if (path.startsWith("/_media/")) {
                String id = url.getLastPathSegment();
                String range = header(request, "Range");
                return servePickedMedia(id, range);
            }
            return super.shouldInterceptRequest(view, request);
        }
    }

    private String header(WebResourceRequest request, String wanted) {
        for (Map.Entry<String, String> entry : request.getRequestHeaders().entrySet()) {
            if (wanted.equalsIgnoreCase(entry.getKey())) return entry.getValue();
        }
        return null;
    }

    private WebResourceResponse bootstrapResponse() {
        try {
            String json = EthvelleStoragePlugin.createBootstrap(getFilesDir()).toString();
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            headers.put("Pragma", "no-cache");
            headers.put("Content-Type", "application/json; charset=utf-8");
            return new WebResourceResponse("application/json", "UTF-8", 200, "OK", headers,
                    new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            Log.e(TAG, "Storage bootstrap endpoint failed", e);
            return textResponse(500, "Storage Error", "Could not load native project storage.");
        }
    }

    private WebResourceResponse servePickedMedia(String id, String rangeHeader) {
        if (id == null || id.isEmpty() || id.contains("/") || id.contains("..")) {
            return textResponse(404, "Not Found", "Unknown media reference.");
        }
        try {
            android.content.SharedPreferences prefs = getSharedPreferences("ethvelle_persisted_media", MODE_PRIVATE);
            String recordText = prefs.getString("media_" + id, null);
            if (recordText == null) return textResponse(404, "Not Found", "Media missing — Relink this clip.");
            org.json.JSONObject record = new org.json.JSONObject(recordText);
            Uri source = Uri.parse(record.optString("uri"));
            String mime = record.optString("mime", "application/octet-stream");
            if (!"content".equalsIgnoreCase(source.getScheme())) return textResponse(404, "Not Found", "Invalid media permission.");
            android.content.res.AssetFileDescriptor afd = getContentResolver().openAssetFileDescriptor(source, "r");
            if (afd == null) return textResponse(404, "Not Found", "Media missing — Relink this clip.");
            long length = afd.getLength();
            if (length < 0 && afd.getParcelFileDescriptor() != null) {
                length = afd.getParcelFileDescriptor().getStatSize();
            }
            if (length < 0) length = -1;
            long start = 0, end = length >= 0 ? length - 1 : -1;
            boolean partial = rangeHeader != null && length >= 0;
            if (partial) {
                Matcher matcher = Pattern.compile("^bytes=(\\d*)-(\\d*)$").matcher(rangeHeader.trim());
                if (!matcher.matches()) {
                    afd.close();
                    return rangeNotSatisfiable(mime, length);
                }
                String first = matcher.group(1), last = matcher.group(2);
                if (first.isEmpty()) {
                    long suffix = Long.parseLong(last);
                    if (suffix <= 0) { afd.close(); return rangeNotSatisfiable(mime, length); }
                    start = Math.max(0, length - suffix);
                } else {
                    start = Long.parseLong(first);
                    if (!last.isEmpty()) end = Long.parseLong(last);
                }
                if (length == 0 || start < 0 || start >= length || end < start) {
                    afd.close(); return rangeNotSatisfiable(mime, length);
                }
                end = Math.min(end, length - 1);
            }
            InputStream stream = afd.createInputStream();
            skipFully(stream, start);
            long byteCount = length >= 0 ? (partial ? (end - start + 1) : length) : -1;
            if (byteCount >= 0) stream = new LimitedInputStream(stream, byteCount);
            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Cache-Control", "no-store");
            headers.put("Content-Type", mime);
            if (byteCount >= 0) headers.put("Content-Length", String.valueOf(byteCount));
            if (partial) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
            return new WebResourceResponse(mime, null, partial ? 206 : 200,
                    partial ? "Partial Content" : "OK", headers, stream);
        } catch (SecurityException e) {
            Log.w(TAG, "Persisted media permission was revoked for " + id, e);
            return textResponse(404, "Not Found", "Media missing — Relink this clip.");
        } catch (Exception e) {
            Log.e(TAG, "Could not stream picked media " + id, e);
            return textResponse(404, "Not Found", "Media missing — Relink this clip.");
        }
    }

    private WebResourceResponse rangeNotSatisfiable(String mime, long length) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Accept-Ranges", "bytes");
        headers.put("Content-Range", "bytes */" + length);
        return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", headers,
                new ByteArrayInputStream(new byte[0]));
    }

    private void skipFully(InputStream in, long amount) throws IOException {
        long left = amount;
        while (left > 0) {
            long skipped = in.skip(left);
            if (skipped <= 0) {
                if (in.read() == -1) throw new IOException("Unexpected end of selected file.");
                skipped = 1;
            }
            left -= skipped;
        }
    }

    private WebResourceResponse textResponse(int code, String reason, String body) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        return new WebResourceResponse("text/plain", "UTF-8", code, reason, headers,
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    private static final class LimitedInputStream extends FilterInputStream {
        private long remaining;
        LimitedInputStream(InputStream in, long count) { super(in); remaining = count; }
        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = super.read(); if (value >= 0) remaining--; return value;
        }
        @Override public int read(byte[] buffer, int offset, int len) throws IOException {
            if (remaining <= 0) return -1;
            int count = super.read(buffer, offset, (int) Math.min((long) len, remaining));
            if (count > 0) remaining -= count;
            return count;
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (ethvelleWebView == null) { super.onBackPressed(); return; }
        ethvelleWebView.evaluateJavascript(
            "(function(){try{return window.__ethvelleHandleBack && window.__ethvelleHandleBack()===true ? 'handled' : 'exit';}catch(e){return 'exit';}})()",
            value -> { if (!"\"handled\"".equals(value)) finish(); }
        );
    }
}
