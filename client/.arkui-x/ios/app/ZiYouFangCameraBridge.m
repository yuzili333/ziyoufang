#import "ZiYouFangCameraBridge.h"

#import <AVFoundation/AVFoundation.h>

@interface ZiYouFangCameraBridge ()
@property(nonatomic, weak) ZiYouFangCameraViewController *activeCamera;
@end

@implementation ZiYouFangCameraBridge

- (NSString *)requestCameraPermission:(id)param {
    AVAuthorizationStatus status = [AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeVideo];
    if (status == AVAuthorizationStatusAuthorized) {
        return @"granted";
    }
    if (status != AVAuthorizationStatusNotDetermined) {
        return @"denied";
    }
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {
        dispatch_async(dispatch_get_main_queue(), ^{
            [self sendJSON:@{ @"type": @"permission", @"granted": @(granted) }];
        });
    }];
    return @"pending";
}

- (NSString *)startCapture:(id)param {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.activeCamera != nil) {
            [self sendCaptureStatus:@"error" errorCode:@"CAMERA_CAPTURE_ALREADY_ACTIVE"];
            return;
        }
        if (self.presentingViewController == nil) {
            [self sendCaptureStatus:@"error" errorCode:@"CAMERA_HOST_UNAVAILABLE"];
            return;
        }
        ZiYouFangCameraViewController *controller = [[ZiYouFangCameraViewController alloc] init];
        controller.delegate = self;
        controller.modalPresentationStyle = UIModalPresentationFullScreen;
        self.activeCamera = controller;
        [self.presentingViewController presentViewController:controller animated:YES completion:nil];
    });
    return @"started";
}

- (NSString *)cancelCapture:(id)param {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self.activeCamera != nil) {
            [self dismissCamera:self.activeCamera completion:nil];
        }
    });
    return @"cancelled";
}

- (void)cameraViewControllerDidCancel:(ZiYouFangCameraViewController *)controller {
    [self dismissCamera:controller completion:^{
        [self sendCaptureStatus:@"cancelled" errorCode:@""];
    }];
}

- (void)cameraViewController:(ZiYouFangCameraViewController *)controller
            didCaptureFileURL:(NSURL *)fileURL
                        width:(NSInteger)width
                       height:(NSInteger)height
                  orientation:(NSInteger)orientation {
    NSString *uri = fileURL.absoluteString ?: @"";
    [self dismissCamera:controller completion:^{
        [self sendJSON:@{
            @"type": @"capture", @"status": @"success", @"uri": uri,
            @"width": @(width), @"height": @(height), @"orientation": @(orientation),
            @"errorCode": @""
        }];
    }];
}

- (void)cameraViewController:(ZiYouFangCameraViewController *)controller
            didFailWithCode:(NSString *)errorCode {
    [self dismissCamera:controller completion:^{
        [self sendCaptureStatus:@"error" errorCode:errorCode];
    }];
}

- (void)dismissCamera:(ZiYouFangCameraViewController *)controller completion:(void (^ _Nullable)(void))completion {
    if (self.activeCamera == controller) {
        self.activeCamera = nil;
    }
    [controller dismissViewControllerAnimated:YES completion:completion];
}

- (void)sendCaptureStatus:(NSString *)status errorCode:(NSString *)errorCode {
    [self sendJSON:@{
        @"type": @"capture", @"status": status, @"uri": @"", @"width": @0,
        @"height": @0, @"orientation": @0, @"errorCode": errorCode
    }];
}

- (void)sendJSON:(NSDictionary *)payload {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:payload options:0 error:&error];
    if (data == nil || error != nil) {
        [self sendMessage:@"{\"type\":\"capture\",\"status\":\"error\",\"errorCode\":\"SERIALIZE_FAILED\"}"];
        return;
    }
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    [self sendMessage:json ?: @"{}"];
}

@end
