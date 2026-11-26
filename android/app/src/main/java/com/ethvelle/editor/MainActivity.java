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
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.Nullable;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import android.content.res.AssetFileDescriptor;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import org.json.JSONArray;

public class MainActivity extends Activity {
    private static final String TAG = "Ethvelle";
    private static final int REQ_NATIVE_MEDIA = 4101;
    private static final int REQ_WEB_FILE = 4102;
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String PREFS = "ethvelle_native_media";

    private WebView webView;
    private ValueCallback<Uri[]> webFileCallback;
    private String pendingMediaTarget = "overlay";
    private final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        webView = new WebView(this);
        setContentView(webView);

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

        webView.addJavascriptInterface(new AndroidBridge(), "EthvelleAndroid");
        webView.setWebViewClient(new LocalWebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (webFileCallback != null) webFileCallback.onReceiveValue(null);
                webFileCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                    startActivityForResult(intent, REQ_WEB_FILE);
                } catch (Exception ex) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType("*/*");
                        intent.putExtra(Intent.EXTRA_MIME_TYPES,
                                new String[]{"image/*", "video/*", "audio/*", "font/*", "application/*"});
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                        startActivityForResult(intent, REQ_WEB_FILE);
                    } catch (Exception fallback) {
                        webFileCallback = null;
                        callback.onReceiveValue(null);
                        Log.e(TAG, "Could not open the WebView file chooser", fallback);
                    }
                }
                return true;
            }

            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage message) {
                Log.d(TAG, message.message() + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
                return true;
            }
        });

        // Use a local HTTPS origin so WebView video playback and byte-range streaming work.
        webView.loadUrl("https://" + APP_HOST + "/assets/index.html");
    }

    private class AndroidBridge {
        @JavascriptInterface
        public void pickMedia(String target) {
            runOnUiThread(() -> launchNativeMediaPicker(target));
        }

        @JavascriptInterface
        public void pickMedia() {
            pickMedia("overlay");
        }
    }

    private void launchNativeMediaPicker(String target) {
        pendingMediaTarget = target == null ? "overlay" : target;
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");

            String[] mimeTypes;
            switch (pendingMediaTarget) {
                case "audio":
                    mimeTypes = new String[]{"audio/*"};
                    break;
                case "background":
                case "replace-background":
                    mimeTypes = new String[]{"image/*"};
                    break;
                case "overlay":
                case "media":
                    mimeTypes = new String[]{"image/*", "video/*"};
                    break;
                case "replace-overlay":
                    mimeTypes = new String[]{"image/*", "video/*", "audio/*"};
                    break;
                default:
                    mimeTypes = new String[]{"image/*", "video/*", "audio/*"};
                    break;
            }
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            boolean allowMultiple = !pendingMediaTarget.startsWith("replace-");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, allowMultiple);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            startActivityForResult(intent, REQ_NATIVE_MEDIA);
        } catch (ActivityNotFoundException ex) {
            sendNativeResult(errorJson("No Android file picker is available."));
        } catch (Exception ex) {
            Log.e(TAG, "Could not launch Android file picker", ex);
            sendNativeResult(errorJson("Could not open the device file picker."));
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_NATIVE_MEDIA) {
            if (resultCode != RESULT_OK || data == null) {
                sendNativeResult("{\\"cancelled\\":true}");
                return;
            }

            try {
                JSONArray items = new JSONArray();
                int grantedFlags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    for (int i = 0; i < count; i++) {
                        Uri uri = data.getClipData().getItemAt(i).getUri();
                        if (uri != null) items.put(registerNativeMedia(uri, grantedFlags));
                    }
                } else if (data.getData() != null) {
                    items.put(registerNativeMedia(data.getData(), grantedFlags));
                }

                JSONObject payload = new JSONObject();
                payload.put("items", items);
                payload.put("cancelled", items.length() == 0);
                sendNativeResult(payload.toString());
            } catch (Exception ex) {
                Log.e(TAG, "Could not register selected device media", ex);
                sendNativeResult(errorJson("Could not link the selected device media."));
            }
        } else if (requestCode == REQ_WEB_FILE) {
            if (webFileCallback == null) return;
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            webFileCallback.onReceiveValue(results);
            webFileCallback = null;
        }
    }

    private JSONObject registerNativeMedia(Uri uri, int grantedFlags) throws Exception {
        try {
            getContentResolver().takePersistableUriPermission(uri, grantedFlags);
        } catch (Exception ex) {
            Log.w(TAG, "Persistable URI permission unavailable; provider access may be temporary", ex);
        }

        String key = "native-" + UUID.randomUUID().toString().replace("-", "");
        String name = queryDisplayName(uri);
        long size = querySize(uri);
        String mime = getContentResolver().getType(uri);
        if (mime == null || mime.trim().isEmpty()) mime = guessMime(name);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit().putString("uri_" + key, uri.toString())
                .putString("name_" + key, name)
                .putString("mime_" + key, mime)
                .putLong("size_" + key, size)
                .apply();

        JSONObject item = new JSONObject();
        item.put("key", key);
        item.put("uri", uri.toString());
        item.put("url", "https://" + APP_HOST + "/native-media/" + key);
        item.put("name", name);
        item.put("type", mime);
        item.put("size", size);
        item.put("lastModified", 0);
        attachQuickMediaMetadata(item, uri, mime);
        return item;
    }

    /*
     * Reads only container/header metadata. The media bytes are never copied into the app,
     * IndexedDB, cache files, or Cloudinary. Playback is streamed from the selected content URI.
     */
    private void attachQuickMediaMetadata(JSONObject item, Uri uri, String mime) {
        if (mime != null && (mime.startsWith("video/") || mime.startsWith("audio/"))) {
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(this, uri);
                String duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
                String width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
                String height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
                if (duration != null) item.put("duration", Math.max(0, Long.parseLong(duration)) / 1000.0);
                if (width != null) item.put("width", Math.max(0, Integer.parseInt(width)));
                if (height != null) item.put("height", Math.max(0, Integer.parseInt(height)));
            } catch (Exception ex) {
                Log.w(TAG, "Could not read media header metadata", ex);
            } finally {
                try { retriever.release(); } catch (Exception ignored) {}
            }
        } else if (mime != null && mime.startsWith("image/")) {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            try (InputStream input = getContentResolver().openInputStream(uri)) {
                if (input != null) {
                    BitmapFactory.decodeStream(input, null, options);
                    item.put("width", Math.max(0, options.outWidth));
                    item.put("height", Math.max(0, options.outHeight));
                }
            } catch (Exception ex) {
                Log.w(TAG, "Could not read image header metadata", ex);
            }
        }
    }

    private String errorJson(String message) {
        try {
            JSONObject value = new JSONObject();
            value.put("error", message);
            return value.toString();
        } catch (Exception ignored) {
            return "{\"error\":\"Picker error\"}";
        }
    }

    private void sendNativeResult(String json) {
        if (webView == null) return;
        String quoted = JSONObject.quote(json);
        runOnUiThread(() -> webView.evaluateJavascript(
                "if(window.__ethvelleNativePickerResolve){window.__ethvelleNativePickerResolve(" + quoted + ");}", null));
    }

    private String queryDisplayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ex) {
            Log.w(TAG, "Display name lookup failed", ex);
        } finally {
            if (cursor != null) cursor.close();
        }
        String segment = uri.getLastPathSegment();
        return segment == null ? "Device media" : segment;
    }

    private long querySize(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (index >= 0 && !cursor.isNull(index)) return cursor.getLong(index);
            }
        } catch (Exception ex) {
            Log.w(TAG, "File size lookup failed", ex);
        } finally {
            if (cursor != null) cursor.close();
        }
        return -1;
    }

    private String guessMime(String filename) {
        String name = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        if (name.endsWith(".mp4") || name.endsWith(".m4v")) return "video/mp4";
        if (name.endsWith(".mov")) return "video/quicktime";
        if (name.endsWith(".webm")) return "video/webm";
        if (name.endsWith(".mp3")) return "audio/mpeg";
        if (name.endsWith(".m4a")) return "audio/mp4";
        if (name.endsWith(".aac")) return "audio/aac";
        if (name.endsWith(".wav")) return "audio/wav";
        if (name.endsWith(".ogg")) return "audio/ogg";
        if (name.endsWith(".png")) return "image/png";
        if (name.endsWith(".webp")) return "image/webp";
        if (name.endsWith(".gif")) return "image/gif";
        if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private class LocalWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (APP_HOST.equalsIgnoreCase(uri.getHost()) && uri.getPath() != null
                    && uri.getPath().startsWith("/native-media/")) {
                String key = uri.getLastPathSegment();
                String range = null;
                for (Map.Entry<String, String> header : request.getRequestHeaders().entrySet()) {
                    if ("range".equalsIgnoreCase(header.getKey())) {
                        range = header.getValue();
                        break;
                    }
                }
                return serveNativeMedia(key, range);
            }
            return assetLoader.shouldInterceptRequest(uri);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // Keep the local app-assets origin inside this WebView. External web links may open normally.
            Uri uri = request.getUrl();
            return false;
        }
    }

    private WebResourceResponse serveNativeMedia(String key, String rangeHeader) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            String uriString = prefs.getString("uri_" + key, null);
            if (uriString == null) return textResponse(404, "Not Found", "Media link is no longer available.");

            Uri source = Uri.parse(uriString);
            AssetFileDescriptor descriptor = getContentResolver().openAssetFileDescriptor(source, "r");
            if (descriptor == null) return textResponse(404, "Not Found", "Source file is unavailable.");

            long length = descriptor.getLength();
            if (length < 0 && descriptor.getParcelFileDescriptor() != null) {
                length = descriptor.getParcelFileDescriptor().getStatSize();
            }
            String mime = prefs.getString("mime_" + key, null);
            if (mime == null || mime.isEmpty()) mime = getContentResolver().getType(source);
            if (mime == null || mime.isEmpty()) mime = "application/octet-stream";

            long start = 0;
            long end = length > 0 ? length - 1 : -1;
            boolean partial = rangeHeader != null && rangeHeader.startsWith("bytes=") && length >= 0;
            if (partial) {
                String spec = rangeHeader.substring(6).trim();
                String[] parts = spec.split("-", 2);
                if (parts.length != 2) {
                    descriptor.close();
                    return textResponse(416, "Range Not Satisfiable", "Invalid byte range.");
                }
                if (parts[0].isEmpty()) {
                    long suffix = Long.parseLong(parts[1]);
                    start = Math.max(0, length - suffix);
                    end = length - 1;
                } else {
                    start = Long.parseLong(parts[0]);
                    if (!parts[1].isEmpty()) end = Long.parseLong(parts[1]);
                }
                if (start < 0 || start >= length || end < start) {
                    descriptor.close();
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Content-Range", "bytes */" + length);
                    headers.put("Accept-Ranges", "bytes");
                    return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable",
                            headers, new ByteArrayInputStream(new byte[0]));
                }
                end = Math.min(end, length - 1);
            }

            InputStream input = new AssetFileDescriptor.AutoCloseInputStream(descriptor);
            if (start > 0) skipFully(input, start);
            long count = length >= 0 ? (partial ? end - start + 1 : length) : -1;
            if (count >= 0) input = new LimitedInputStream(input, count);

            Map<String, String> headers = new HashMap<>();
            headers.put("Accept-Ranges", "bytes");
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-store");
            if (count >= 0) headers.put("Content-Length", String.valueOf(count));
            if (partial) headers.put("Content-Range", "bytes " + start + "-" + end + "/" + length);

            return new WebResourceResponse(mime, null, partial ? 206 : 200,
                    partial ? "Partial Content" : "OK", headers, input);
        } catch (Exception ex) {
            Log.e(TAG, "Could not stream native media key=" + key, ex);
            return textResponse(500, "Media Error", "Could not read the selected file.");
        }
    }

    private void skipFully(InputStream input, long amount) throws IOException {
        long remaining = amount;
        while (remaining > 0) {
            long skipped = input.skip(remaining);
            if (skipped <= 0) {
                if (input.read() == -1) throw new IOException("Unexpected end of media stream");
                skipped = 1;
            }
            remaining -= skipped;
        }
    }

    private WebResourceResponse textResponse(int status, String reason, String body) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "text/plain; charset=utf-8");
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, headers,
                new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
    }

    private static class LimitedInputStream extends FilterInputStream {
        private long remaining;
        LimitedInputStream(InputStream input, long remaining) {
            super(input);
            this.remaining = remaining;
        }
        @Override public int read() throws IOException {
            if (remaining <= 0) return -1;
            int value = super.read();
            if (value != -1) remaining--;
            return value;
        }
        @Override public int read(byte[] buffer, int offset, int length) throws IOException {
            if (remaining <= 0) return -1;
            int request = (int) Math.min((long) length, remaining);
            int read = super.read(buffer, offset, request);
            if (read > 0) remaining -= read;
            return read;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webFileCallback != null) {
            webFileCallback.onReceiveValue(null);
            webFileCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("EthvelleAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
