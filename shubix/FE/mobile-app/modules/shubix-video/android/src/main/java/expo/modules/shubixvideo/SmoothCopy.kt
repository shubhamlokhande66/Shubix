package expo.modules.shubixvideo

import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.os.Build
import java.io.File
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Smooth slow-mo (the studio's Clip tools -> Smooth slow-mo, as CapCut's; the website's smoothPic in engine.ts): a slowed
 * part of a clip as its own silent H.264 file, already at the Reel's speed. Each picture of it is the moment the shot shows
 * then; between two real frames it is the two mixed by how far between them that moment is, so a 0.5× shot of 30 fps
 * footage glides instead of showing every picture twice. Where the shot runs at 1× or faster, the nearest real frame,
 * unmixed. `slices`: (from, to, speed) in seconds from `start` in the clip, as the export's ClipSpeed. Blocks; throws when it
 * fails. */
internal fun makeSmoothCopy(from: String, to: File, start: Double, slices: List<Triple<Double, Double, Double>>, fps: Int = 30, bitrate: Int = 12_000_000, longSide: Int = 1920) {
  require(slices.isNotEmpty()) { "Nothing to make smooth." }
  val srcFps = frameRateOf(from)
  val outLen = slices.sumOf { (it.second - it.first) / it.third }
  require(outLen > 0.0) { "Nothing to make smooth." }
  // the moment of the clip shown at `t` seconds of the shot, and how fast the shot runs there
  fun sourceAt(t: Double): Pair<Double, Double> {
    var left = t
    for ((a, b, rate) in slices) {
      val len = (b - a) / rate
      if (left <= len || (a == slices.last().first)) return Pair(start + a + min(left, len) * rate, rate)
      left -= len
    }
    val last = slices.last(); return Pair(start + last.second, last.third)
  }
  val reader = MediaMetadataRetriever()
  val part = File(to.path + ".part").apply { delete() }
  var codec: MediaCodec? = null
  var muxer: MediaMuxer? = null
  var started = false
  try {
    reader.setDataSource(from)
    val probe = reader.getFrameAtTime((start * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: throw IllegalStateException("The clip has no picture.")
    val scale = min(1f, longSide.toFloat() / max(probe.width, probe.height))
    val w = (probe.width * scale / 2).roundToInt() * 2; val h = (probe.height * scale / 2).roundToInt() * 2
    probe.recycle()
    // the clip's frames by their number (time × frame rate), the last two kept: a slowed shot asks each one several times
    val kept = LinkedHashMap<Long, IntArray>()
    fun frame(n: Long): IntArray? {
      kept[n]?.let { return it }
      val at = ((n + 0.5) / srcFps * 1_000_000).toLong()   // the middle of the frame: never its neighbour
      val got = (if (Build.VERSION.SDK_INT >= 27) reader.getScaledFrameAtTime(at, MediaMetadataRetriever.OPTION_CLOSEST, w, h) else reader.getFrameAtTime(at, MediaMetadataRetriever.OPTION_CLOSEST)) ?: return null
      val pic = if (got.width == w && got.height == h) got else Bitmap.createScaledBitmap(got, w, h, true).also { if (it !== got) got.recycle() }
      val px = IntArray(w * h); pic.getPixels(px, 0, w, 0, 0, w, h); pic.recycle()
      kept[n] = px; while (kept.size > 3) kept.remove(kept.keys.first())
      return px
    }
    val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible)
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate); setInteger(MediaFormat.KEY_FRAME_RATE, fps); setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).also { codec = it }
    enc.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE); enc.start()
    val mux = MediaMuxer(part.path, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4).also { muxer = it }
    val count = max(1, kotlin.math.ceil(outLen * fps + 1).toInt())   // a frame long: the export plays it to the exact length
    val info = MediaCodec.BufferInfo(); val mixed = IntArray(w * h)
    var track = -1; var fed = 0; var last: IntArray? = null; var finished = false
    while (!finished) {
      if (fed <= count) {
        val slot = enc.dequeueInputBuffer(10_000)
        if (slot >= 0) {
          if (fed == count) { enc.queueInputBuffer(slot, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); fed++ }
          else {
            val (t, rate) = sourceAt(fed.toDouble() / fps)
            val pos = t * srcFps - 0.5   // in frames, 0 = the middle of the first frame
            val shown: IntArray
            if (rate < 0.985) {
              val n = floor(pos).toLong().coerceAtLeast(0L); val f = (pos - n).coerceIn(0.0, 1.0)
              val a = frame(n) ?: last; val b = if (f > 0.01) frame(n + 1) ?: a else a
              if (a == null) throw IllegalStateException("A frame of the clip could not be read.")
              if (b == null || b === a) shown = a
              else { blend(a, b, f, mixed); shown = mixed }
            } else shown = frame(pos.roundToInt().toLong().coerceAtLeast(0L)) ?: last ?: throw IllegalStateException("A frame of the clip could not be read.")
            if (shown !== mixed) last = shown
            val image = enc.getInputImage(slot) ?: throw IllegalStateException("The encoder gave no picture to fill.")
            fillYuv(image, shown, w, h)
            enc.queueInputBuffer(slot, 0, w * h * 3 / 2, fed * 1_000_000L / fps, 0); fed++
          }
        }
      }
      val out = enc.dequeueOutputBuffer(info, 10_000)
      if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) { track = mux.addTrack(enc.outputFormat); mux.start(); started = true }
      else if (out >= 0) {
        val data = enc.getOutputBuffer(out)
        if (data != null && info.size > 0 && info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0) {
          check(started) { "The encoder wrote before it was ready." }
          data.position(info.offset); data.limit(info.offset + info.size); mux.writeSampleData(track, data, info)
        }
        finished = info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
        enc.releaseOutputBuffer(out, false)
      }
    }
    enc.stop(); mux.stop(); started = false
    mux.release(); muxer = null
    if (!part.renameTo(to)) throw IllegalStateException("The smooth clip could not be kept.")
  } finally {
    runCatching { codec?.release() }
    runCatching { if (started) muxer?.stop(); muxer?.release() }
    runCatching { reader.release() }
    part.delete()
  }
}

/** a and b mixed, b by f (0..1), each colour on its own */
private fun blend(a: IntArray, b: IntArray, f: Double, out: IntArray) {
  val k = (f * 256).roundToInt().coerceIn(0, 256); val j = 256 - k
  for (i in a.indices) {
    val x = a[i]; val y = b[i]
    val r = (((x shr 16) and 255) * j + ((y shr 16) and 255) * k) shr 8
    val g = (((x shr 8) and 255) * j + ((y shr 8) and 255) * k) shr 8
    val bl = ((x and 255) * j + (y and 255) * k) shr 8
    out[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or bl
  }
}

/** the clip's frame rate (30 when the file does not say) */
private fun frameRateOf(path: String): Double {
  val ex = MediaExtractor()
  return try {
    ex.setDataSource(path)
    (0 until ex.trackCount).map { ex.getTrackFormat(it) }.firstOrNull { it.getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true }
      ?.let { f -> if (f.containsKey(MediaFormat.KEY_FRAME_RATE)) runCatching { f.getInteger(MediaFormat.KEY_FRAME_RATE).toDouble() }.getOrElse { runCatching { f.getFloat(MediaFormat.KEY_FRAME_RATE).toDouble() }.getOrNull() } else null }
      ?.takeIf { it in 5.0..240.0 } ?: 30.0
  } catch (_: Throwable) { 30.0 } finally { runCatching { ex.release() } }
}
