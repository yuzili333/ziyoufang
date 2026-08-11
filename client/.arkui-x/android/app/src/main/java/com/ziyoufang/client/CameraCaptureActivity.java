package com.ziyoufang.client;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.Surface;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import androidx.activity.ComponentActivity;
import androidx.annotation.NonNull;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.exifinterface.media.ExifInterface;

import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.io.IOException;
import java.lang.ref.WeakReference;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Independent native CameraX page used when an embedded ArkUI-X preview is unsuitable. */
public final class CameraCaptureActivity extends ComponentActivity {
    public static final String EXTRA_URI = "capture_uri";
    public static final String EXTRA_WIDTH = "capture_width";
    public static final String EXTRA_HEIGHT = "capture_height";
    public static final String EXTRA_ORIENTATION = "capture_orientation";
    public static final String EXTRA_ERROR_CODE = "capture_error_code";

    private static WeakReference<CameraCaptureActivity> active = new WeakReference<>(null);
    private PreviewView previewView;
    private ImageCapture imageCapture;
    private ExecutorService cameraExecutor;

    public static void cancelActive() {
        CameraCaptureActivity activity = active.get();
        if (activity != null) {
            activity.setResult(Activity.RESULT_CANCELED);
            activity.finish();
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        active = new WeakReference<>(this);
        cameraExecutor = Executors.newSingleThreadExecutor();
        setContentView(createContentView());

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            finishWithError("CAMERA_PERMISSION_DENIED");
            return;
        }
        startCamera();
    }

    private View createContentView() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        previewView = new PreviewView(this);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(previewView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        root.addView(new PracticeGridOverlay(this), new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        LinearLayout controls = new LinearLayout(this);
        controls.setOrientation(LinearLayout.HORIZONTAL);
        controls.setGravity(Gravity.CENTER);
        controls.setPadding(dp(20), dp(12), dp(20), dp(28));
        controls.setBackgroundColor(0x99000000);

        Button cancel = new Button(this);
        cancel.setText("取消");
        cancel.setOnClickListener(view -> {
            setResult(Activity.RESULT_CANCELED);
            finish();
        });
        controls.addView(cancel, weightedButtonParams());

        Button shutter = new Button(this);
        shutter.setText("拍照");
        shutter.setTextColor(Color.WHITE);
        shutter.setBackgroundColor(0xFFC43A31);
        shutter.setOnClickListener(view -> takePhoto());
        controls.addView(shutter, weightedButtonParams());

        FrameLayout.LayoutParams controlParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(controls, controlParams);
        return root;
    }

    private LinearLayout.LayoutParams weightedButtonParams() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(56), 1f);
        params.setMargins(dp(8), 0, dp(8), 0);
        return params;
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> providerFuture = ProcessCameraProvider.getInstance(this);
        providerFuture.addListener(() -> {
            try {
                ProcessCameraProvider provider = providerFuture.get();
                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());
                int rotation = previewView.getDisplay() == null
                        ? Surface.ROTATION_0 : previewView.getDisplay().getRotation();
                imageCapture = new ImageCapture.Builder()
                        .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                        .setTargetRotation(rotation)
                        .build();
                provider.unbindAll();
                provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture);
            } catch (Exception error) {
                finishWithError("CAMERA_INITIALIZATION_FAILED");
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void takePhoto() {
        ImageCapture capture = imageCapture;
        if (capture == null) {
            return;
        }
        File directory = new File(getFilesDir(), "practice-media");
        if (!directory.exists() && !directory.mkdirs()) {
            finishWithError("MEDIA_DIRECTORY_UNAVAILABLE");
            return;
        }
        File output = new File(directory, UUID.randomUUID() + ".jpg");
        ImageCapture.OutputFileOptions options = new ImageCapture.OutputFileOptions.Builder(output).build();
        capture.takePicture(options, cameraExecutor, new ImageCapture.OnImageSavedCallback() {
            @Override
            public void onImageSaved(@NonNull ImageCapture.OutputFileResults result) {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeFile(output.getAbsolutePath(), bounds);
                int orientation = readOrientation(output);
                Intent data = new Intent();
                data.putExtra(EXTRA_URI, Uri.fromFile(output).toString());
                data.putExtra(EXTRA_WIDTH, bounds.outWidth);
                data.putExtra(EXTRA_HEIGHT, bounds.outHeight);
                data.putExtra(EXTRA_ORIENTATION, orientation);
                runOnUiThread(() -> {
                    setResult(Activity.RESULT_OK, data);
                    finish();
                });
            }

            @Override
            public void onError(@NonNull ImageCaptureException exception) {
                runOnUiThread(() -> finishWithError("CAMERA_CAPTURE_FAILED"));
            }
        });
    }

    private void finishWithError(String errorCode) {
        Intent data = new Intent();
        data.putExtra(EXTRA_ERROR_CODE, errorCode);
        setResult(Activity.RESULT_FIRST_USER, data);
        finish();
    }

    private int readOrientation(File file) {
        try {
            int value = new ExifInterface(file).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (value == ExifInterface.ORIENTATION_ROTATE_90) {
                return 90;
            }
            if (value == ExifInterface.ORIENTATION_ROTATE_180) {
                return 180;
            }
            if (value == ExifInterface.ORIENTATION_ROTATE_270) {
                return 270;
            }
        } catch (IOException ignored) {
            return 0;
        }
        return 0;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        active.clear();
        cameraExecutor.shutdown();
        super.onDestroy();
    }

    private static final class PracticeGridOverlay extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        PracticeGridOverlay(Activity context) {
            super(context);
            paint.setColor(0xFFE04B3F);
            paint.setStrokeWidth(context.getResources().getDisplayMetrics().density * 2f);
            paint.setStyle(Paint.Style.STROKE);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float margin = getResources().getDisplayMetrics().density * 24f;
            float bottomInset = getResources().getDisplayMetrics().density * 112f;
            float left = margin;
            float top = margin * 2f;
            float right = getWidth() - margin;
            float bottom = getHeight() - bottomInset;
            canvas.drawRect(left, top, right, bottom, paint);
            for (int index = 1; index < 4; index++) {
                float x = left + (right - left) * index / 4f;
                float y = top + (bottom - top) * index / 4f;
                canvas.drawLine(x, top, x, bottom, paint);
                canvas.drawLine(left, y, right, y, paint);
            }
        }
    }
}
