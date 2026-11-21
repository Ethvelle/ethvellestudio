package com.ethvelle.editor;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import android.content.res.AssetFileDescriptor;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

public class MainActivity extends Activity {
    private static final String TAG = "Ethvelle";
    private static final int REQ_NATIVE_MEDIA = 4101;
    private static final int REQ_WEB_FILE = 4102;
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String PREFS = "ethvelle_native_media";

    private WebView webView;
    private ValueCallback<Uri[]> webFileCallback;
    private final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

    @Override protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = webView.getSettings();
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
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new AndroidBridge(), "EthvelleAndroid");
        webView.setWebViewClient(new LocalWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d(TAG, message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (webFileCallback != null) webFileCallback.onReceiveValue(null);
                webFileCallback = callback;
                Intent intent;
                try {
                    intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(intent, REQ_WEB_FILE);
                } catch (Exception ex) {
                    try {
                        intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("*/*");
                        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*", "audio/*", "font/*", "application/*"});
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                        startActivityForResult(intent, REQ_WEB_FILE);
                    } catch (Exception fallback) {
                        webFileCallback = null;
                        callback.onReceiveValue(null);
                    }
                }
                return true;
            }
        });
        webView.loadUrl("https://" + APP_HOST + "/assets/index.html");
    }

    private class AndroidBridge {
        @JavascriptInterface public void pickMedia() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*", "image/*"});
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    startActivityForResult(intent, REQ_NATIVE_MEDIA);
                } catch (ActivityNotFoundException ex) {
                    sendNativeResult(errorJson("No Android file picker is available."));
                } catch (Exception ex) {
                    sendNativeResult(errorJson("Could not open the device file picker."));
                }
            });
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_NATIVE_MEDIA) {
            if (resultCode != RESULT_OK || data == null || data.getData() == null) {
                sendNativeResult("{\"cancelled\":true}");
                return;
            }
            Uri uri = data.getData();
            int grantedFlags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            try { getContentResolver().takePersistableUriPermission(uri, grantedFlags); }
            catch (Exception ex) { Log.w(TAG, "Persistable URI permission unavailable; current grant may be temporary", ex); }
            try {
                String key = "native-" + UUID.randomUUID().toString().replace("-", "");
                String name = queryDisplayName(uri);
                long size = querySize(uri);
                String mime = getContentResolver().getType(uri);
                if (mime == null || mime.trim().isEmpty()) mime = guessMime(name);
                SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
                prefs.edit().putString("uri_" + key, uri.toString())
                        .putString("name_" + key, name).putString("mime_" + key, mime)
                        .putLong("size_" + key, size).apply();
                JSONObject item = new JSONObject();
                item.put("key", key); item.put("uri", uri.toString());
                item.put("url", "https://" + APP_HOST + "/native-media/" + key);
                item.put("name", name); item.put("type", mime); item.put("size", size);
                item.put("lastModified", 0);
                sendNativeResult(item.toString());
            } catch (Exception ex) {
                Log.e(TAG, "Could not register selected device media", ex);
                sendNativeResult(errorJson("Could not link the selected file."));
            }
        } else if (requestCode == REQ_WEB_FILE) {
            if (webFileCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) results = new Uri[]{data.getData()};
            }
            webFileCallback.onReceiveValue(results);
            webFileCallback = null;
        }
    }

    private String errorJson(String message) {
        try { JSONObject o = new JSONObject(); o.put("error", message); return o.toString(); }
        catch (Exception ignored) { return "{\"error\":\"Picker error\"}"; }
    }

    private void sendNativeResult(String json) {
        if (webView == null) return;
        String quoted = JSONObject.quote(json);
        runOnUiThread(() -> webView.evaluateJavascript(
                "if(window.__ethvelleNativePickerResolve){window.__ethvelleNativePickerResolve(" + quoted + ");}", null));
    }

    private String queryDisplayName(Uri uri) {
        Cursor c = null;
        try {
            c = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0) return c.getString(i);
            }
        } catch (Exception ex) { Log.w(TAG, "Display name lookup failed", ex); }
        finally { if (c != null) c.close(); }
        String segment = uri.getLastPathSegment();
        return segment == null ? "Device media" : segment;
    }

    private long querySize(Uri uri) {
        Cursor c = null;
        try {
            c = getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.SIZE);
                if (i >= 0 && !c.isNull(i)) return c.getLong(i);
            }
        } catch (Exception ex) { Log.w(TAG, "File size lookup failed", ex); }
        finally { if (c != null) c.close(); }
        return -1;
    }

    private String guessMime(String name) {
        String n = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (n.endsWith(".mp4") || n.endsWith(".m4v")) return "video/mp4";
        if (n.endsWith(".mov")) return "video/quicktime";
        if (n.endsWith(".webm")) return "video/webm";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".m4a")) return "audio/mp4";
        if (n.endsWith(".aac")) return "audio/aac";
        if (n.endsWith(".wav")) return "audio/wav";
        if (n.endsWith(".ogg")) return "audio/ogg";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private class LocalWebViewClient extends WebViewClient {
        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (APP_HOST.equalsIgnoreCase(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/native-media/")) {
                String key = uri.getLastPathSegment();
                String range = null;
                for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
                    if ("range".equalsIgnoreCase(header.getKey())) { range = header.getValue(); break; }
                }
                return serveNativeMedia(key, range);
            }
            return assetLoader.shouldInterceptRequest(uri);
        }

        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if ("https".equals(scheme) || "http".equals(scheme)) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
                return true;
            }
            return true;
        }

        @Override public boolean onRenderProcessGone(WebView view, android.webkit.RenderProcessGoneDetail detail) {
            Log.e(TAG, "WebView renderer exited; didCrash=" + detail.didCrash());
            view.destroy();
            webView = new WebView(MainActivity.this);
            setContentView(webView);
            configureRecoveredWebView();
            return true;
        }
    }

    private void configureRecoveredWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true); settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false); settings.setAllowFileAccess(false); settings.setAllowContentAccess(false);
        webView.addJavascriptInterface(new AndroidBridge(), "EthvelleAndroid");
        webView.setWebViewClient(new LocalWebViewClient());
        webView.loadUrl("https://" + APP_HOST + "/assets/index.html");
    }

    private WebResourceResponse serveNativeMedia(String key, String rangeHeader) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            String uriString = prefs.getString("uri_" + key, null);
            if (uriString == null) return response(404, "Not Found", "Media link is no longer available.");
            Uri uri = Uri.parse(uriString);
            AssetFileDescriptor afd = getContentResolver().openAssetFileDescriptor(uri, "r");
            if (afd == null) return response(404, "Not Found", "Source file is unavailable.");
            long length = afd.getLength();
            if (length < 0 && afd.getParcelFileDescriptor() != null) length = afd.getParcelFileDescriptor().getStatSize();
            String mime = prefs.getString("mime_" + key, null);
            if (mime == null) mime = getContentResolver().getType(uri);
            if (mime == null) mime = "application/octet-stream";
            long start = 0, end = length > 0 ? length - 1 : -1;
            boolean partial = rangeHeader != null && rangeHeader.startsWith("bytes=") && length >= 0;
            if (partial) {
                String[] pieces = rangeHeader.substring(6).split("-", 2);
                if (pieces.length > 0 && !pieces[0].isEmpty()) start = Long.parseLong(pieces[0]);
                if (pieces.length > 1 && !pieces[1].isEmpty()) end = Long.parseLong(pieces[1]);
                if (pieces.length > 0 && pieces[0].isEmpty() && pieces.length > 1) {
                    long suffix = Long.parseLong(pieces[1]); start = Math.max(0, length - suffix); end = length - 1;
                }
                if (start < 0 || start >= length || end < start) {
                    afd.close();
                    Map<String,String> h = new HashMap<>(); h.put("Content-Range", "bytes */" + length); h.put("Accept-Ranges", "bytes");
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, new java.io.ByteArrayInputStream(new byte[0]));
                }
                end = Math.min(end, length - 1);
            }
            InputStream input = new AssetFileDescriptor.AutoCloseInputStream(afd);
            skipFully(input, start);
            long count = (length >= 0) ? (partial ? end - start + 1 : length) : -1;
            if (count >= 0) input = new LimitedInputStream(input, count);
            Map<String,String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-store");
            if (count >= 0) headers.put("Content-Length", String.valueOf(count));
            int status = partial ? 206 : 200;
            String reason = partial ? "Partial Content" : "OK";
            if (partial) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
            return new WebResourceResponse(mime, null, status, reason, headers, input);
        } catch (Exception ex) {
            Log.e(TAG, "Could not stream native media key=" + key, ex);
            return response(500, "Media Error", "Could not read the selected file.");
        }
    }

    private void skipFully(InputStream input, long amount) throws IOException {
        long left = amount;
        while (left > 0) {
            long skipped = input.skip(left);
            if (skipped <= 0) { if (input.read() == -1) throw new IOException("Unexpected end of media stream"); skipped = 1; }
            left -= skipped;
        }
    }

    private WebResourceResponse response(int status, String reason, String body) {
        Map<String,String> headers = new HashMap<>(); headers.put("Content-Type", "text/plain; charset=utf-8");
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, headers,
                new java.io.ByteArrayInputStream(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }

    private static class LimitedInputStream extends FilterInputStream {
        private long remaining;
        LimitedInputStream(InputStream in, long remaining) { super(in); this.remaining = remaining; }
        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = super.read(); if (value != -1) remaining--; return value;
        }
        @Override public int read(byte[] buffer, int offset, int length) throws IOException {
            if (remaining <= 0) return -1;
            int request = (int)Math.min((long)length, remaining);
            int read = super.read(buffer, offset, request); if (read > 0) remaining -= read; return read;
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (webFileCallback != null) { webFileCallback.onReceiveValue(null); webFileCallback = null; }
        if (webView != null) { webView.removeJavascriptInterface("EthvelleAndroid"); webView.destroy(); webView = null; }
        super.onDestroy();
    }
}
