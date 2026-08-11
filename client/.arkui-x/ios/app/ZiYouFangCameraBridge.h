#import <UIKit/UIKit.h>
#import <libarkui_ios/BridgePlugin.h>

#import "ZiYouFangCameraViewController.h"

NS_ASSUME_NONNULL_BEGIN

@interface ZiYouFangCameraBridge : BridgePlugin <ZiYouFangCameraViewControllerDelegate>
@property(nonatomic, weak) UIViewController *presentingViewController;
- (NSString *)requestCameraPermission:(id)param;
- (NSString *)startCapture:(id)param;
- (NSString *)cancelCapture:(id)param;
@end

NS_ASSUME_NONNULL_END
