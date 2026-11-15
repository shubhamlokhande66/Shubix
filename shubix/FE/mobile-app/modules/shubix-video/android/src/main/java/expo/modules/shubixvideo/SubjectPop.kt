package expo.modules.shubixvideo

import android.graphics.Bitmap
import java.io.File
import java.io.OutputStream
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** The subject pop on the phone: the brain decides (Shared/video-engine/src/pop.ts, as the website's engine.ts), this reads
 * the frame, runs U²-Net small (u2netp.onnx, Apache-2.0) as the page's vision worker does, and cuts the subject out. */
const val POP_MODEL = "/api/studio/model/u2netp.onnx"
private const val POP_SIDE = 320
private val MEAN = floatArrayOf(0.485f, 0.456f, 0.406f)
private val SPREAD = floatArrayOf(0.229f, 0.224f, 0.225f)

/** The frame of `file` at `t` (seconds), POP_SIDE square, and its subject: written as 1 byte (1: a frame, 0: none), then the
 * mask (POP_SIDE² bytes, 0..255 stretched from its lowest to its highest value, as popMaskBytes), then the RGBA pixels. */
internal fun popMaskOf(file: File, t: Double, models: Models, out: OutputStream) {
  models.fetch(POP_MODEL) {}
  val n = POP_SIDE * POP_SIDE
  var rgba: ByteArray? = null
  readFrames(file, POP_SIDE, POP_SIDE, doubleArrayOf(max(0.0, t)), FrameSink(n * 4) { _, b -> rgba = b?.copyOf() }) {}
  val px = rgba ?: run { out.write(0); out.flush(); return }
  val input = FloatArray(3 * n)
  for (i in 0 until n) for (c in 0 until 3) input[c * n + i] = ((px[i * 4 + c].toInt() and 255) / 255f - MEAN[c]) / SPREAD[c]
  val o = models.runFloats(POP_MODEL, "input.1", input, longArrayOf(1, 3, POP_SIDE.toLong(), POP_SIDE.toLong()))
  val raw = o["1959"] ?: o.values.first()
  var lo = Float.MAX_VALUE; var hi = -Float.MAX_VALUE
  for (i in 0 until n) { lo = min(lo, raw[i]); hi = max(hi, raw[i]) }
  val k = if (hi - lo > 1e-6f) 255f / (hi - lo) else 0f
  val mask = ByteArray(n) { ((raw[it] - lo) * k).roundToInt().coerceIn(0, 255).toByte() }
  out.write(1); out.write(mask); out.write(px); out.flush()
}

/** The cut-out: the frame of `file` at `t` at w x h (as shown), its alpha the brain's (POP_SIDE² bytes, popAlpha) enlarged
 * smoothly, cropped to `box` (0..1 of the frame), kept as a PNG in `dir`. Answers the file and its size. */
internal fun popCutOf(file: File, t: Double, w: Int, h: Int, alpha: ByteArray, box: DoubleArray, dir: File): Triple<File, Int, Int> {
  require(alpha.size == POP_SIDE * POP_SIDE && box.size == 4)
  var rgba: ByteArray? = null
  readFrames(file, w, h, doubleArrayOf(max(0.0, t)), FrameSink(w * h * 4) { _, b -> rgba = b?.copyOf() }) {}
  val px = rgba ?: throw IllegalStateException("The frame could not be read.")
  val x0 = (box[0] * w).roundToInt().coerceIn(0, w - 2); val y0 = (box[1] * h).roundToInt().coerceIn(0, h - 2)
  val x1 = (box[2] * w).roundToInt().coerceIn(x0 + 2, w); val y1 = (box[3] * h).roundToInt().coerceIn(y0 + 2, h)
  val cw = x1 - x0; val ch = y1 - y0; val pixels = IntArray(cw * ch)
  fun a(x: Int, y: Int) = (alpha[y.coerceIn(0, POP_SIDE - 1) * POP_SIDE + x.coerceIn(0, POP_SIDE - 1)].toInt() and 255).toDouble()
  for (y in 0 until ch) for (x in 0 until cw) {
    val fx = (x0 + x + 0.5) * POP_SIDE / w - 0.5; val fy = (y0 + y + 0.5) * POP_SIDE / h - 0.5
    val ax = floor(fx).toInt(); val ay = floor(fy).toInt(); val dx = fx - ax; val dy = fy - ay
    val al = ((a(ax, ay) * (1 - dx) + a(ax + 1, ay) * dx) * (1 - dy) + (a(ax, ay + 1) * (1 - dx) + a(ax + 1, ay + 1) * dx) * dy).roundToInt().coerceIn(0, 255)
    val o = ((y0 + y) * w + x0 + x) * 4
    pixels[y * cw + x] = (al shl 24) or ((px[o].toInt() and 255) shl 16) or ((px[o + 1].toInt() and 255) shl 8) or (px[o + 2].toInt() and 255)
  }
  val pic = Bitmap.createBitmap(pixels, cw, ch, Bitmap.Config.ARGB_8888)
  val to = File(dir.apply { mkdirs() }, "pop-${(file.path + file.length() + t + w + h + box.joinToString() + alpha.contentHashCode()).hashCode().toUInt()}.png")
  try { to.outputStream().use { pic.compress(Bitmap.CompressFormat.PNG, 100, it) } } finally { pic.recycle() }
  return Triple(to, cw, ch)
}
