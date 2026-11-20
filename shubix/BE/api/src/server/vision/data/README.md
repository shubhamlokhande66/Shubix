# On-device vision models (Fast Studio)

From MediaPipe 0.10.18 (Apache License 2.0, see LICENSE-mediapipe), converted from TensorFlow Lite to ONNX with tf2onnx
1.17 (opset 17) so ONNX Runtime Web runs them in the browser:

- `selfie_segmentation.onnx`: MediaPipe Selfie Segmentation (256x256 RGB in [0,1], NHWC → person mask 256x256).
  MediaPipe's custom `Convolution2DTransposeBias` (2x2, stride 2, SAME) is replaced by an ONNX `ConvTranspose` + `Transpose`
  (weights OHWI → IOHW); checked on a photo against the expected cutout.
- `face_detection_short_range.onnx`: BlazeFace short range (128x128 RGB in [-1,1], NHWC → 896 anchors x 16 regressors, scores).

`u2netp.onnx`: U²-Net small (Qin et al., github.com/xuebinqin/U-2-Net, Apache License 2.0), the ONNX file rembg
publishes (github.com/danielgatis/rembg, release v0.0.0, sha256 309c8469…ddd8). 320x320 RGB, NCHW, ImageNet mean and
spread → the frame's most salient subject (first output, 320x320). The studio's subject pop cuts a car, a bike, a person
or a sign out of a shot with it (Shared/video-engine/src/pop.ts).
