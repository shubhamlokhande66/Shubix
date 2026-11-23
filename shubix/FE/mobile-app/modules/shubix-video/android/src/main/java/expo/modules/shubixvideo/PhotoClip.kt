package expo.modules.shubixvideo

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.media.ExifInterface
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.MatrixTransformation
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.DefaultEncoderFactory
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import androidx.media3.transformer.VideoEncoderSettings
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** as the website's photoClip (components/studio/steps.ts): a 3 s shot that pushes in by 8% */
private const val PHOTO_SECONDS = 3.0
private const val PHOTO_FPS = 30
private const val PHOTO_PUSH = 0.08f
private const val PHOTO_LONG = 1920

/** A photo (JPG, PNG, WEBP, HEIC from Android 9) as a short silent H.264 clip with a slow push-in, made by the phone's
 * hardware: everything after it (scan, faces, preview, export) reads it as any clip. Blocks, and throws when it fails. */
@UnstableApi
internal fun makePhotoClip(context: Context, from: File, to: File) {
  val still = File(to.path + ".jpg")
  val part = File(to.path + ".part").apply { delete() }
  val worker = HandlerThread("shubix-photo").apply { start() }
  val done = CountDownLatch(1)
  var failure: Exception? = null
  var running: Transformer? = null
  try {
    val pic = photoUpright(from)
    val w = pic.width; val h = pic.height
    try { still.outputStream().use { check(pic.compress(Bitmap.CompressFormat.JPEG, 95, it)) { "The photo could not be kept." } } } finally { pic.recycle() }
    Handler(worker.looper).post {
      try {
        val push = MatrixTransformation { us ->
          val z = 1f + PHOTO_PUSH * min(1f, us / (PHOTO_SECONDS * 1_000_000).toFloat())
          Matrix().apply { setScale(z, z) }
        }
        val media = MediaItem.Builder().setUri(Uri.fromFile(still)).setMimeType(MimeTypes.IMAGE_JPEG).setImageDurationMs((PHOTO_SECONDS * 1000).toLong()).build()
        val video = listOf(Presentation.createForWidthAndHeight(w, h, Presentation.LAYOUT_SCALE_TO_FIT), push)
        val item = EditedMediaItem.Builder(media).setFrameRate(PHOTO_FPS).setEffects(Effects(emptyList(), video)).build()
        running = Transformer.Builder(context)
          .setLooper(worker.looper)
          .setVideoMimeType(MimeTypes.VIDEO_H264)
          .setEncoderFactory(DefaultEncoderFactory.Builder(context).setRequestedVideoEncoderSettings(VideoEncoderSettings.Builder().setBitrate(10_000_000).setiFrameIntervalSeconds(0.5f).build()).build())
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, exportResult: ExportResult) { done.countDown() }
            override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) { failure = exportException; done.countDown() }
          })
          .build().also { it.start(Composition.Builder(EditedMediaItemSequence.Builder(listOf(item)).build()).build(), part.path) }
      } catch (e: Exception) { failure = e; done.countDown() }
    }
    if (!done.await(2, TimeUnit.MINUTES)) { Handler(worker.looper).post { running?.cancel() }; throw IllegalStateException("the photo took too long") }
    failure?.let { throw it }
    if (!part.renameTo(to)) throw IllegalStateException("The photo's clip could not be kept.")
  } finally {
    still.delete(); part.delete()
    worker.quitSafely()
  }
}

/** The photo upright (its EXIF turn applied), on black, at most 1920 on its long side, both sides even. A long panorama is
 * shown whole on a 2:1 picture: the phone's encoder refuses a thin strip. */
private fun photoUpright(file: File): Bitmap {
  val raw: Bitmap = if (Build.VERSION.SDK_INT >= 28) ImageDecoder.decodeBitmap(ImageDecoder.createSource(file)) { d, info, _ ->
    d.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
    d.setTargetColorSpace(android.graphics.ColorSpace.get(android.graphics.ColorSpace.Named.SRGB))
    val s = min(1f, PHOTO_LONG.toFloat() / max(info.size.width, info.size.height))
    d.setTargetSize(max(1, (info.size.width * s).roundToInt()), max(1, (info.size.height * s).roundToInt()))
  } else olderPhoto(file)
  val s = min(1f, PHOTO_LONG.toFloat() / max(raw.width, raw.height))
  val pw = even(raw.width * s); val ph = even(raw.height * s)
  val w = max(256, even(max(pw, ph / 2).toFloat())); val h = max(256, even(max(ph, pw / 2).toFloat()))
  val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
  val l = (w - pw) / 2; val t = (h - ph) / 2
  Canvas(out).apply { drawColor(Color.BLACK); drawBitmap(raw, null, Rect(l, t, l + pw, t + ph), Paint(Paint.FILTER_BITMAP_FLAG)) }
  raw.recycle()
  return out
}

private fun even(x: Float) = max(2, (x / 2).roundToInt() * 2)

/** before Android 9: no ImageDecoder (and no HEIC), and the turn is the EXIF's */
private fun olderPhoto(file: File): Bitmap {
  val size = BitmapFactory.Options().apply { inJustDecodeBounds = true }
  BitmapFactory.decodeFile(file.path, size)
  var sample = 1
  while (max(size.outWidth, size.outHeight) / (sample * 2) >= PHOTO_LONG) sample *= 2
  val b = BitmapFactory.decodeFile(file.path, BitmapFactory.Options().apply { inSampleSize = sample }) ?: throw IllegalStateException("This phone cannot open this photo. Save it as JPG.")
  val m = Matrix()
  when (try { ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) } catch (_: Exception) { 1 }) {
    2 -> m.postScale(-1f, 1f)
    3 -> m.postRotate(180f)
    4 -> m.postScale(1f, -1f)
    5 -> { m.postRotate(90f); m.postScale(-1f, 1f) }
    6 -> m.postRotate(90f)
    7 -> { m.postRotate(270f); m.postScale(-1f, 1f) }
    8 -> m.postRotate(270f)
  }
  if (m.isIdentity) return b
  val turned = Bitmap.createBitmap(b, 0, 0, b.width, b.height, m, true)
  if (turned !== b) b.recycle()
  return turned
}
