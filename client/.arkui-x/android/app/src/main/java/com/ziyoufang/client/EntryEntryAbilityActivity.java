package com.ziyoufang.client;

import android.content.Intent;
import android.os.Bundle;

import ohos.stage.ability.adapter.StageActivity;


/**
 * Example ace activity class, which will load ArkUI-X ability instance.
 * StageActivity is provided by ArkUI-X
 *
 * @since 2025-01-15
 */
public class EntryEntryAbilityActivity extends StageActivity {
    private ZiYouFangCameraBridge cameraBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        cameraBridge = new ZiYouFangCameraBridge(this, "ZiYouFangCamera", getBridgeManager());
        setInstanceName("com.ziyoufang.client:entry:EntryAbility:");
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        cameraBridge.onCaptureResult(requestCode, resultCode, data);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        cameraBridge.onRequestPermissionsResult(requestCode, grantResults);
    }
}
