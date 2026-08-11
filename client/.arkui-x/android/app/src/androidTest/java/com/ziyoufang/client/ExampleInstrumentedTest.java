package com.ziyoufang.client;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.IOException;

import static org.junit.Assert.*;

/**
 * Instrumented test, which will execute on an Android device.
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
@RunWith(AndroidJUnit4.class)
public class ExampleInstrumentedTest {
    @Test
    public void useAppContext() {
        // Context of the app under test.
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.ziyoufang.client", appContext.getPackageName());
    }

    @Test
    public void nativeCameraPageLaunchesWithGrantedPermission() throws IOException {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ParcelFileDescriptor grantCommand = InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .executeShellCommand("pm grant " + appContext.getPackageName() + " " + Manifest.permission.CAMERA);
        grantCommand.close();
        SystemClock.sleep(200);
        assertEquals(PackageManager.PERMISSION_GRANTED,
                appContext.checkSelfPermission(Manifest.permission.CAMERA));

        Intent intent = new Intent(appContext, CameraCaptureActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(intent);

        assertTrue(activity instanceof CameraCaptureActivity);
        assertFalse(activity.isFinishing());
        InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
    }
}
