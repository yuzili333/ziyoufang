package com.ziyoufang.client;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONException;
import org.json.JSONObject;

import ohos.ace.adapter.capability.bridge.BridgeManager;
import ohos.ace.adapter.capability.bridge.BridgePlugin;

/** ArkUI-X asynchronous bridge for the independent CameraX capture page. */
public final class ZiYouFangCameraBridge extends BridgePlugin {
    static final int CAPTURE_REQUEST_CODE = 7301;
    private static final int CAMERA_PERMISSION_REQUEST_CODE = 7302;

    private final Activity activity;

    ZiYouFangCameraBridge(Activity activity, String name, BridgeManager bridgeManager) {
        super(activity, name, bridgeManager);
        this.activity = activity;
    }

    public String requestCameraPermission(String ignored) {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED) {
            return "granted";
        }
        ActivityCompat.requestPermissions(activity,
                new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST_CODE);
        return "pending";
    }

    public String startCapture(String ignored) {
        Intent intent = new Intent(activity, CameraCaptureActivity.class);
        activity.startActivityForResult(intent, CAPTURE_REQUEST_CODE);
        return "started";
    }

    public String cancelCapture(String ignored) {
        CameraCaptureActivity.cancelActive();
        return "cancelled";
    }

    void onRequestPermissionsResult(int requestCode, int[] grantResults) {
        if (requestCode != CAMERA_PERMISSION_REQUEST_CODE) {
            return;
        }
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        sendEvent(permissionEvent(granted));
    }

    void onCaptureResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != CAPTURE_REQUEST_CODE) {
            return;
        }
        if (resultCode == Activity.RESULT_FIRST_USER && data != null) {
            sendEvent(captureEvent("error", "", 0, 0, 0,
                    data.getStringExtra(CameraCaptureActivity.EXTRA_ERROR_CODE)));
            return;
        }
        if (resultCode != Activity.RESULT_OK || data == null) {
            sendEvent(captureEvent("cancelled", "", 0, 0, 0, ""));
            return;
        }
        sendEvent(captureEvent(
                "success",
                data.getStringExtra(CameraCaptureActivity.EXTRA_URI),
                data.getIntExtra(CameraCaptureActivity.EXTRA_WIDTH, 0),
                data.getIntExtra(CameraCaptureActivity.EXTRA_HEIGHT, 0),
                data.getIntExtra(CameraCaptureActivity.EXTRA_ORIENTATION, 0),
                ""));
    }

    private String permissionEvent(boolean granted) {
        JSONObject object = new JSONObject();
        try {
            object.put("type", "permission");
            object.put("granted", granted);
        } catch (JSONException ignored) {
            return "{\"type\":\"permission\",\"granted\":false}";
        }
        return object.toString();
    }

    private String captureEvent(String status, String uri, int width, int height,
                                int orientation, String errorCode) {
        JSONObject object = new JSONObject();
        try {
            object.put("type", "capture");
            object.put("status", status);
            object.put("uri", uri == null ? "" : uri);
            object.put("width", width);
            object.put("height", height);
            object.put("orientation", orientation);
            object.put("errorCode", errorCode);
        } catch (JSONException ignored) {
            return "{\"type\":\"capture\",\"status\":\"error\",\"errorCode\":\"SERIALIZE_FAILED\"}";
        }
        return object.toString();
    }

    private void sendEvent(String json) {
        sendMessage(json);
    }
}
