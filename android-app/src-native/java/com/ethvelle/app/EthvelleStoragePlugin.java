package com.ethvelle.app;

import android.system.Os;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "EthvelleStorage")
public class EthvelleStoragePlugin extends Plugin {
    private static final String TAG = "EthvelleStorage";

    @PluginMethod
    public void atomicReplace(PluginCall call) {
        try {
            File temp = resolve(call.getString("tempPath", ""));
            File target = resolve(call.getString("targetPath", ""));
            if (!temp.exists() || !temp.isFile()) throw new IllegalStateException("Temporary storage file does not exist.");
            File parent = target.getParentFile();
            if (parent == null || (!parent.exists() && !parent.mkdirs())) throw new IllegalStateException("Could not create storage folder.");
            if (!temp.getParentFile().getCanonicalPath().equals(parent.getCanonicalPath())) {
                throw new SecurityException("Atomic rename must remain inside one storage folder.");
            }
            Os.rename(temp.getAbsolutePath(), target.getAbsolutePath());
            JSObject out = new JSObject(); out.put("saved", true); call.resolve(out);
        } catch (Exception e) {
            Log.e(TAG, "Atomic file replacement failed", e);
            call.reject("Atomic device storage write failed: " + e.getMessage(), e);
        }
    }

    private File resolve(String relative) throws Exception {
        if (relative == null || relative.trim().isEmpty() || relative.startsWith("/") || relative.contains("..")) {
            throw new SecurityException("Invalid app storage path.");
        }
        File root = getContext().getFilesDir().getCanonicalFile();
        File file = new File(root, relative).getCanonicalFile();
        if (!file.getPath().startsWith(root.getPath() + File.separator)) throw new SecurityException("Storage path escaped the app sandbox.");
        return file;
    }

    public static JSONObject createBootstrap(File filesDir) {
        JSONObject root = new JSONObject();
        JSONObject values = new JSONObject();
        try {
            File projects = new File(filesDir, "ethvelle/projects");
            JSONArray projectArray = readJsonDirectory(projects, "index.json");
            values.put("riggy.projects.v1", projectArray.toString());
            File models = new File(filesDir, "ethvelle/model-assets");
            JSONArray modelArray = readJsonDirectory(models, "index.json");
            values.put("riggy.modelAssets.v1", modelArray.toString());
            root.put("storageMode", "Capacitor Filesystem (Directory.Data)");
            root.put("values", values);
            root.put("projectCount", projectArray.length());
        } catch (Exception e) {
            Log.e(TAG, "Could not create storage bootstrap", e);
            try { root.put("storageMode", "Capacitor Filesystem (Directory.Data)"); root.put("values", new JSONObject()); root.put("error", e.getMessage()); }
            catch (Exception ignored) {}
        }
        return root;
    }

    private static JSONArray readJsonDirectory(File dir, String ignoredIndex) throws Exception {
        JSONArray items = new JSONArray();
        File[] files = dir.listFiles((folder, name) -> name.endsWith(".json") && !name.equals(ignoredIndex) && !name.contains(".tmp-"));
        if (files == null) return items;
        java.util.Arrays.sort(files, (a, b) -> a.getName().compareTo(b.getName()));
        for (File file : files) {
            try {
                String raw = readUtf8(file);
                items.put(new JSONObject(raw));
            } catch (Exception e) { Log.e(TAG, "Skipping unreadable JSON file " + file, e); }
        }
        return items;
    }

    private static String readUtf8(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[32 * 1024]; int count;
            while ((count = input.read(buf)) >= 0) out.write(buf, 0, count);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
