#import "ZiYouFangCameraViewController.h"

#import <AVFoundation/AVFoundation.h>

@interface ZiYouFangPracticeGridView : UIView
@end

@implementation ZiYouFangPracticeGridView
- (void)drawRect:(CGRect)rect {
    CGContextRef context = UIGraphicsGetCurrentContext();
    if (context == NULL) {
        return;
    }
    CGContextSetStrokeColorWithColor(context, [UIColor colorWithRed:0.88 green:0.29 blue:0.25 alpha:1].CGColor);
    CGContextSetLineWidth(context, 2.0);
    CGRect grid = CGRectInset(self.bounds, 24.0, 70.0);
    grid.size.height -= 72.0;
    CGContextStrokeRect(context, grid);
    for (NSInteger index = 1; index < 4; index += 1) {
        CGFloat fraction = (CGFloat)index / 4.0;
        CGFloat x = CGRectGetMinX(grid) + CGRectGetWidth(grid) * fraction;
        CGFloat y = CGRectGetMinY(grid) + CGRectGetHeight(grid) * fraction;
        CGContextMoveToPoint(context, x, CGRectGetMinY(grid));
        CGContextAddLineToPoint(context, x, CGRectGetMaxY(grid));
        CGContextMoveToPoint(context, CGRectGetMinX(grid), y);
        CGContextAddLineToPoint(context, CGRectGetMaxX(grid), y);
    }
    CGContextStrokePath(context);
}
@end

@interface ZiYouFangCameraViewController () <AVCapturePhotoCaptureDelegate>
@property(nonatomic, strong) AVCaptureSession *session;
@property(nonatomic, strong) AVCapturePhotoOutput *photoOutput;
@property(nonatomic, strong) AVCaptureVideoPreviewLayer *previewLayer;
@property(nonatomic, strong) UIButton *captureButton;
@end

@implementation ZiYouFangCameraViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = UIColor.blackColor;
    [self configureControls];
    [self configureCamera];
}

- (void)viewDidLayoutSubviews {
    [super viewDidLayoutSubviews];
    self.previewLayer.frame = self.view.bounds;
}

- (void)viewWillDisappear:(BOOL)animated {
    [super viewWillDisappear:animated];
    if (self.session.isRunning) {
        AVCaptureSession *session = self.session;
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
            [session stopRunning];
        });
    }
}

- (void)configureControls {
    ZiYouFangPracticeGridView *grid = [[ZiYouFangPracticeGridView alloc] initWithFrame:CGRectZero];
    grid.userInteractionEnabled = NO;
    grid.backgroundColor = UIColor.clearColor;
    grid.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:grid];

    UIView *controls = [[UIView alloc] initWithFrame:CGRectZero];
    controls.backgroundColor = [UIColor colorWithWhite:0 alpha:0.62];
    controls.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:controls];

    UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem];
    [cancel setTitle:@"取消" forState:UIControlStateNormal];
    [cancel setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    cancel.translatesAutoresizingMaskIntoConstraints = NO;
    [cancel addTarget:self action:@selector(cancelTapped) forControlEvents:UIControlEventTouchUpInside];
    [controls addSubview:cancel];

    self.captureButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.captureButton setTitle:@"拍照" forState:UIControlStateNormal];
    [self.captureButton setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    self.captureButton.backgroundColor = [UIColor colorWithRed:0.77 green:0.23 blue:0.19 alpha:1];
    self.captureButton.layer.cornerRadius = 28.0;
    self.captureButton.translatesAutoresizingMaskIntoConstraints = NO;
    [self.captureButton addTarget:self action:@selector(captureTapped) forControlEvents:UIControlEventTouchUpInside];
    [controls addSubview:self.captureButton];

    [NSLayoutConstraint activateConstraints:@[
        [grid.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [grid.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [grid.topAnchor constraintEqualToAnchor:self.view.topAnchor],
        [grid.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
        [controls.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [controls.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [controls.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
        [controls.heightAnchor constraintEqualToConstant:112.0],
        [cancel.leadingAnchor constraintEqualToAnchor:controls.leadingAnchor constant:28.0],
        [cancel.centerYAnchor constraintEqualToAnchor:controls.centerYAnchor],
        [self.captureButton.centerXAnchor constraintEqualToAnchor:controls.centerXAnchor],
        [self.captureButton.centerYAnchor constraintEqualToAnchor:controls.centerYAnchor],
        [self.captureButton.widthAnchor constraintEqualToConstant:104.0],
        [self.captureButton.heightAnchor constraintEqualToConstant:56.0]
    ]];
}

- (void)configureCamera {
    AVCaptureDevice *camera = [AVCaptureDevice defaultDeviceWithMediaType:AVMediaTypeVideo];
    if (camera == nil) {
        [self fail:@"CAMERA_UNAVAILABLE"];
        return;
    }
    NSError *inputError = nil;
    AVCaptureDeviceInput *input = [AVCaptureDeviceInput deviceInputWithDevice:camera error:&inputError];
    if (input == nil || inputError != nil) {
        [self fail:@"CAMERA_INITIALIZATION_FAILED"];
        return;
    }
    AVCaptureSession *session = [[AVCaptureSession alloc] init];
    session.sessionPreset = AVCaptureSessionPresetPhoto;
    AVCapturePhotoOutput *output = [[AVCapturePhotoOutput alloc] init];
    if (![session canAddInput:input] || ![session canAddOutput:output]) {
        [self fail:@"CAMERA_CONFIGURATION_FAILED"];
        return;
    }
    [session addInput:input];
    [session addOutput:output];
    self.session = session;
    self.photoOutput = output;

    self.previewLayer = [AVCaptureVideoPreviewLayer layerWithSession:session];
    self.previewLayer.videoGravity = AVLayerVideoGravityResizeAspectFill;
    [self.view.layer insertSublayer:self.previewLayer atIndex:0];
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        [session startRunning];
    });
}

- (void)cancelTapped {
    [self.delegate cameraViewControllerDidCancel:self];
}

- (void)captureTapped {
    if (!self.session.isRunning) {
        return;
    }
    self.captureButton.enabled = NO;
    AVCapturePhotoSettings *settings = [AVCapturePhotoSettings photoSettings];
    [self.photoOutput capturePhotoWithSettings:settings delegate:self];
}

- (void)captureOutput:(AVCapturePhotoOutput *)output
didFinishProcessingPhoto:(AVCapturePhoto *)photo
                error:(NSError *)error {
    if (error != nil) {
        [self fail:@"CAMERA_CAPTURE_FAILED"];
        return;
    }
    NSData *data = [photo fileDataRepresentation];
    UIImage *image = data == nil ? nil : [UIImage imageWithData:data];
    if (data == nil || image == nil) {
        [self fail:@"CAMERA_IMAGE_INVALID"];
        return;
    }
    NSURL *directory = [[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory
                                                               inDomains:NSUserDomainMask].firstObject;
    directory = [directory URLByAppendingPathComponent:@"practice-media" isDirectory:YES];
    NSError *directoryError = nil;
    [[NSFileManager defaultManager] createDirectoryAtURL:directory
                              withIntermediateDirectories:YES attributes:nil error:&directoryError];
    if (directoryError != nil) {
        [self fail:@"MEDIA_DIRECTORY_UNAVAILABLE"];
        return;
    }
    NSString *filename = [NSString stringWithFormat:@"%@.jpg", NSUUID.UUID.UUIDString];
    NSURL *fileURL = [directory URLByAppendingPathComponent:filename];
    NSError *writeError = nil;
    [data writeToURL:fileURL options:NSDataWritingAtomic error:&writeError];
    if (writeError != nil) {
        [self fail:@"MEDIA_WRITE_FAILED"];
        return;
    }
    NSInteger width = (NSInteger)CGImageGetWidth(image.CGImage);
    NSInteger height = (NSInteger)CGImageGetHeight(image.CGImage);
    dispatch_async(dispatch_get_main_queue(), ^{
        [self.delegate cameraViewController:self didCaptureFileURL:fileURL
                                      width:width height:height orientation:0];
    });
}

- (void)fail:(NSString *)errorCode {
    dispatch_async(dispatch_get_main_queue(), ^{
        self.captureButton.enabled = YES;
        [self.delegate cameraViewController:self didFailWithCode:errorCode];
    });
}

@end
