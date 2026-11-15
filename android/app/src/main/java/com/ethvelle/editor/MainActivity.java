package com.ethvelle.editor;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final int PICK_FILE = 42;
    private ValueCallback<Uri[]> chooser;
    private WebView web;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        setContentView(web);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = cb;
                try { startActivityForResult(p.createIntent(), PICK_FILE); return true; }
                catch (Exception e) { chooser = null; cb.onReceiveValue(null); return false; }
            }
        });
        web.setWebViewClient(new WebViewClient());
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
            catch (Exception e) { Toast.makeText(this, "Download link could not be opened", Toast.LENGTH_SHORT).show(); }
        });
        web.loadUrl("https://uttamdas5830-creator.github.io/ethvelle-editor/");
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && chooser != null) {
            Uri[] resultUris = WebChromeClient.FileChooserParams.parseResult(result, data);
            chooser.onReceiveValue(resultUris);
            chooser = null;
        }
    }
    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
}
