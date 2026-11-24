package com.ethvelle.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.ActivityCallback;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@CapacitorPlugin(name = "EthvelleMedia")
public class EthvelleMediaPlugin extends Plugin {
    private static final String TAG = "EthvelleMedia";
    private static final String PREFS = "ethvelle_persisted_media";
    private final Map<String, OutputStream> activeStreams = new HashMap<>();
    private final Map<String, Uri> activeUris = new HashMap<>();
    private final Map<String, File> activeFiles = new HashMap<>();
    private final Map<String, String> activeMime = new HashMap<>();

    @PluginMethod
    public void pickMedia(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        JSArray types = call.getArray("types");
        java.util.ArrayList<String> mimeTypes = new java.util.ArrayList<>();
        if (types != null) {
            for (int i = 0; i < types.length(); i++) {
                String type = types.optString(i, "");
                if ("image".equals(type)) mimeTypes.add("image/*");
                else if ("video".equals(type)) mimeTypes.add("video/*");
                else if ("audio".equals(type)) mimeTypes.add("audio/*");
            }
        }
        if (mimeTypes.isEmpty()) {
            mimeTypes.add("image/*"); mimeTypes.add("video/*"); mimeTypes.add("audio/*");
        }
        intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes.toArray(new String[0]));
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, Boolean.TRUE.equals(call.getBoolean("multiple", false)));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "pickMediaResult");
    }

    @ActivityCallback
    private void pickMediaResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject cancelled = new JSObject(); cancelled.put("cancelled", true); call.resolve(cancelled); return;
        }
        try {
            Intent data = result.getData();
            int flags = data.getFlags() & Intent.FLAG_GRANT_READ_URI_PERMISSION;
            if (flags == 0) flags = Intent.FLAG_GRANT_READ_URI_PERMISSION;
            JSArray files = new JSArray();
            if (data.getClipData() != null) {
                for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                    Uri uri = data.getClipData().getItemAt(i).getUri();
                    JSObject item = registerPickedUri(uri, flags);
                    if (item != null) files.put(item);
                }
            } else if (data.getData() != null) {
                JSObject item = registerPickedUri(data.getData(), flags);
                if (item != null) files.put(item);
            }
            JSObject response = new JSObject(); response.put("files", files); call.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "Unable to persist selected media", e);
            call.reject("Could not link this file. Choose it again using the Android file picker.", e);
        }
    }

    private JSObject registerPickedUri(Uri uri, int grantFlags) throws Exception {
        if (uri == null || !"content".equalsIgnoreCase(uri.getScheme())) {
            throw new IllegalArgumentException("The picker did not return a content URI.");
        }
        getContext().getContentResolver().takePersistableUriPermission(uri, grantFlags);
        String name = displayName(uri);
        String mime = getContext().getContentResolver().getType(uri);
        if (mime == null || mime.isEmpty()) mime = guessMime(name);
        long size = fileSize(uri);
        long modified = lastModified(uri);
        String id = sha256(uri.toString());
        JSONObject record = new JSONObject();
        record.put("id", id); record.put("uri", uri.toString()); record.put("name", name);
        record.put("mime", mime); record.put("size", size); record.put("lastModified", modified);
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
        if (!prefs.edit().putString("media_" + id, record.toString()).commit()) {
            throw new IllegalStateException("Could not save the selected file permission.");
        }
        JSObject out = new JSObject();
        out.put("id", id); out.put("uri", uri.toString()); out.put("name", name);
        out.put("mime", mime); out.put("size", size); out.put("lastModified", modified);
        return out;
    }

    private String displayName(Uri uri) {
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (i >= 0 && !c.isNull(i)) return c.getString(i);
            }
        } catch (Exception e) { Log.w(TAG, "display name lookup failed", e); }
        finally { if (c != null) c.close(); }
        String last = uri.getLastPathSegment();
        return last == null ? "Device media" : last;
    }

    private long fileSize(Uri uri) {
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(uri, new String[]{OpenableColumns.SIZE}, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(OpenableColumns.SIZE);
                if (i >= 0 && !c.isNull(i)) return c.getLong(i);
            }
        } catch (Exception e) { Log.w(TAG, "size lookup failed", e); }
        finally { if (c != null) c.close(); }
        return -1L;
    }

    private long lastModified(Uri uri) {
        if (Build.VERSION.SDK_INT < 24) return 0L;
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(uri,
                new String[]{DocumentsContract.Document.COLUMN_LAST_MODIFIED}, null, null, null);
            if (c != null && c.moveToFirst()) {
                int i = c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED);
                if (i >= 0 && !c.isNull(i)) return c.getLong(i);
            }
        } catch (Exception e) { Log.d(TAG, "last-modified lookup unavailable", e); }
        finally { if (c != null) c.close(); }
        return 0L;
    }

    private String guessMime(String name) {
        String ext = "";
        int dot = name == null ? -1 : name.lastIndexOf('.');
        if (dot >= 0) ext = name.substring(dot + 1).toLowerCase(Locale.ROOT);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return mime == null ? "application/octet-stream" : mime;
    }

    private String sha256(String text) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(text.getBytes("UTF-8"));
        StringBuilder out = new StringBuilder();
        for (byte b : digest) out.append(String.format(Locale.ROOT, "%02x", b));
        return out.toString();
    }

    @PluginMethod
    public void testMediaLinks(PluginCall call) {
        JSArray checked = new JSArray();
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, Activity.MODE_PRIVATE);
        ContentResolver resolver = getContext().getContentResolver();
        int ok = 0, missing = 0;
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            if (!entry.getKey().startsWith("media_") || !(entry.getValue() instanceof String)) continue;
            try {
                JSONObject media = new JSONObject((String) entry.getValue());
                Uri uri = Uri.parse(media.optString("uri"));
                boolean available = false;
                String error = "";
                try (InputStream in = resolver.openInputStream(uri)) {
                    if (in != null) { in.read(); available = true; }
                    else error = "Provider returned no stream";
                } catch (Exception e) { error = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage(); }
                if (available) ok++; else missing++;
                JSObject row = new JSObject();
                row.put("id", media.optString("id")); row.put("name", media.optString("name"));
                row.put("uri", media.optString("uri")); row.put("available", available); row.put("error", error);
                checked.put(row);
            } catch (Exception e) { missing++; }
        }
        JSObject response = new JSObject();
        response.put("checked", checked); response.put("available", ok); response.put("missing", missing);
        call.resolve(response);
    }

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        getActivity().runOnUiThread(() -> {
            if (enabled) getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod
    public void saveBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, safeName(call.getString("filename", "Ethvelle-Backup.json")));
        startActivityForResult(call, intent, "saveBackupResult");
    }

    @ActivityCallback
    private void saveBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject out = new JSObject(); out.put("cancelled", true); call.resolve(out); return;
        }
        try {
            Uri uri = result.getData().getData();
            String content = call.getString("content", "");
            try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                if (out == null) throw new IllegalStateException("The selected backup destination is not writable.");
                out.write(content.getBytes("UTF-8")); out.flush();
            }
            JSObject response = new JSObject(); response.put("uri", uri.toString()); response.put("saved", true); call.resolve(response);
        } catch (Exception e) { call.reject("Could not write the backup file.", e); }
    }

    @PluginMethod
    public void restoreBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"application/json", "text/json", "text/plain"});
        startActivityForResult(call, intent, "restoreBackupResult");
    }

    @ActivityCallback
    private void restoreBackupResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject out = new JSObject(); out.put("cancelled", true); call.resolve(out); return;
        }
        try (InputStream in = getContext().getContentResolver().openInputStream(result.getData().getData())) {
            if (in == null) throw new IllegalStateException("Could not read the selected backup.");
            java.io.ByteArrayOutputStream buffer = new java.io.ByteArrayOutputStream();
            byte[] chunk = new byte[32 * 1024]; int n;
            while ((n = in.read(chunk)) >= 0) buffer.write(chunk, 0, n);
            JSObject response = new JSObject(); response.put("content", new String(buffer.toByteArray(), "UTF-8")); call.resolve(response);
        } catch (Exception e) { call.reject("Could not read the backup file.", e); }
    }

    @PluginMethod
    public void startExport(PluginCall call) {
        String id = UUID.randomUUID().toString();
        String name = safeName(call.getString("filename", "Ethvelle-v399.mp4"));
        String mime = call.getString("mime", "video/mp4");
        try {
            Uri uri;
            OutputStream stream;
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Video.Media.DISPLAY_NAME, name);
                values.put(MediaStore.Video.Media.MIME_TYPE, mime);
                values.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/Ethvelle");
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
                uri = getContext().getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("MediaStore did not create an export entry.");
                stream = getContext().getContentResolver().openOutputStream(uri, "w");
            } else {
                File folder = new File(getContext().getExternalFilesDir(Environment.DIRECTORY_MOVIES), "Ethvelle");
                if (!folder.exists() && !folder.mkdirs()) throw new IllegalStateException("Could not create the app export folder.");
                File file = new File(folder, name);
                stream = new java.io.FileOutputStream(file);
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                activeFiles.put(id, file);
            }
            if (stream == null) throw new IllegalStateException("Could not open the export destination.");
            activeStreams.put(id, stream); activeUris.put(id, uri); activeMime.put(id, mime);
            JSObject response = new JSObject(); response.put("id", id); response.put("uri", uri.toString()); call.resolve(response);
        } catch (Exception e) { call.reject("Could not create the export file.", e); }
    }

    @PluginMethod
    public void appendExportChunk(PluginCall call) {
        String id = call.getString("id", "");
        try {
            OutputStream out = activeStreams.get(id);
            if (out == null) throw new IllegalStateException("Export session is no longer available.");
            byte[] bytes = Base64.decode(call.getString("base64", ""), Base64.DEFAULT);
            out.write(bytes); call.resolve();
        } catch (Exception e) { call.reject("Could not write the exported video chunk.", e); }
    }

    @PluginMethod
    public void finishExport(PluginCall call) {
        String id = call.getString("id", "");
        try {
            OutputStream out = activeStreams.remove(id);
            Uri uri = activeUris.remove(id);
            if (out == null || uri == null) throw new IllegalStateException("Export session was not found.");
            out.flush(); out.close();
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues values = new ContentValues(); values.put(MediaStore.Video.Media.IS_PENDING, 0);
                getContext().getContentResolver().update(uri, values, null, null);
            }
            JSObject response = new JSObject(); response.put("uri", uri.toString()); response.put("saved", true); call.resolve(response);
        } catch (Exception e) { call.reject("Could not finish the exported file.", e); }
    }

    @PluginMethod
    public void shareExport(PluginCall call) {
        String value = call.getString("uri", "");
        try {
            Uri uri = Uri.parse(value);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(call.getString("mime", "video/*"));
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, "Share Ethvelle export"));
            call.resolve();
        } catch (Exception e) { call.reject("Could not open the Android share sheet.", e); }
    }

    private String safeName(String name) {
        String clean = name == null ? "Ethvelle-export.mp4" : name.replaceAll("[^a-zA-Z0-9._ -]", "_");
        if (clean.trim().isEmpty()) clean = "Ethvelle-export.mp4";
        return clean.length() > 120 ? clean.substring(clean.length() - 120) : clean;
    }
}
