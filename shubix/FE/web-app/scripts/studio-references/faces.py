# Used by the rebuild test (FE/mobile-app/tests/human-rebuild.test.ts): python faces.py reels/*.mp4 writes <reel>.faces.json.
# Needs opencv-python-headless 4.x (5.x has no Haar cascades). The faces are an approximation of the phone's BlazeFace.
# Faces in a video, 5 readings a second, as the studio keeps them: {t, n, fx, fy, fs} (centre and width as fractions)
import sys, json, cv2
def faces(path):
    cap = cv2.VideoCapture(path); fps = cap.get(cv2.CAP_PROP_FPS) or 30
    det = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    out, k, every = [], 0, max(1, round(fps / 5))
    while True:
        ok, fr = cap.read()
        if not ok: break
        if k % every == 0:
            h, w = fr.shape[:2]; s = 360 / w; g = cv2.cvtColor(cv2.resize(fr, (360, int(h * s))), cv2.COLOR_BGR2GRAY)
            R = [r for r in det.detectMultiScale(g, 1.1, 5, minSize=(22, 22)) if r[2] > 360 * 0.06]
            if len(R):
                x, y, fw, fh = max(R, key=lambda r: r[2])
                out.append({'t': round(k / fps, 3), 'n': len(R), 'fx': (x + fw / 2) / 360, 'fy': (y + fh / 2) / (h * s), 'fs': fw / 360})
            else: out.append({'t': round(k / fps, 3), 'n': 0, 'fx': 0.5, 'fy': 0.5, 'fs': 0})
        k += 1
    return out
for p in sys.argv[1:]:
    json.dump(faces(p), open(p + '.faces.json', 'w')); print(__import__('os').path.basename(p), 'done')
