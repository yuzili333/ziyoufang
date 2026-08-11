#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@class ZiYouFangCameraViewController;

@protocol ZiYouFangCameraViewControllerDelegate <NSObject>
- (void)cameraViewControllerDidCancel:(ZiYouFangCameraViewController *)controller;
- (void)cameraViewController:(ZiYouFangCameraViewController *)controller
            didCaptureFileURL:(NSURL *)fileURL
                        width:(NSInteger)width
                       height:(NSInteger)height
                  orientation:(NSInteger)orientation;
- (void)cameraViewController:(ZiYouFangCameraViewController *)controller
            didFailWithCode:(NSString *)errorCode;
@end

@interface ZiYouFangCameraViewController : UIViewController
@property(nonatomic, weak) id<ZiYouFangCameraViewControllerDelegate> delegate;
@end

NS_ASSUME_NONNULL_END
