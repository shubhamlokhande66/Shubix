package expo.modules.shubixvideo

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.FloatBuffer
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

/** The AI model on the phone itself, with ONNX Runtime for Android: the faces. The file is downloaded once into `dir`. */
class Models(private val dir: File, private val api: String) {
  private class Held(val session: OrtSession, val bytes: Long, @Volatile var used: Long)
  private val env by lazy { OrtEnvironment.getEnvironment() }
  private val open = ConcurrentHashMap<String, Held>()
  // runs share the lock; closing a model waits until no run is using one
  private val gate = ReentrantReadWriteLock()
  private val downloading = Any()
  /** runs so far */
  val runs = AtomicLong()

  private fun fileOf(url: String): File {
    if (!url.startsWith("/api/studio/model/") || url.contains("..")) throw IllegalArgumentException("Not a model of this app")
    val name = MessageDigest.getInstance("SHA-1").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
    return File(dir.apply { mkdirs() }, "$name.onnx")
  }

  /** The model's file, downloaded when it is not here yet. A file only gets its name once it is complete. */
  fun fetch(url: String, onProgress: (Float) -> Unit) {
    val to = fileOf(url)
    synchronized(downloading) {
      if (to.isFile) return onProgress(1f)
      val part = File(to.path + ".part")
      try {
        val c = URL(api + url).openConnection() as HttpURLConnection
        c.connectTimeout = 30_000; c.readTimeout = 120_000
        if (c.responseCode != 200) throw IllegalStateException("Model download failed (${c.responseCode})")
        val total = c.contentLengthLong; var got = 0L; var told = 0L
        c.inputStream.use { i -> part.outputStream().use { o ->
          val buf = ByteArray(256 * 1024)
          while (true) {
            val n = i.read(buf); if (n < 0) break
            o.write(buf, 0, n); got += n
            if (total > 0 && got - told > total / 50) { told = got; onProgress(got.toFloat() / total) }
          }
        } }
        if (total > 0 && got != total) throw IllegalStateException("Model download was cut short")
        if (!part.renameTo(to)) throw IllegalStateException("Model could not be kept")
        onProgress(1f)
      } finally { part.delete() }
    }
  }

  private fun load(url: String) = gate.write {
    if (open.containsKey(url)) return@write
    val file = fileOf(url)
    if (!file.isFile) throw IllegalStateException("Model not downloaded")
    val options = OrtSession.SessionOptions().apply {
      setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
      setInterOpNumThreads(1)
      // a tiny model is fastest on one thread
      setIntraOpNumThreads(if (file.length() < SMALL) 1 else minOf(4, maxOf(1, Runtime.getRuntime().availableProcessors() - 1)))
    }
    // a file that does not open is not kept: the next time it is downloaded again
    val session = try { env.createSession(file.path, options) } catch (e: Exception) { file.delete(); throw e } finally { options.close() }
    open[url] = Held(session, file.length(), System.nanoTime())
    // the phone's memory: the models used longest ago go, and open again when they are needed
    while (open.values.sumOf { it.bytes } > MAX_OPEN && open.size > 1) {
      val oldest = open.entries.filter { it.key != url }.minByOrNull { it.value.used } ?: break
      open.remove(oldest.key)?.session?.close()
    }
  }

  private fun <T> using(url: String, job: (OrtSession) -> T): T {
    while (true) {
      gate.read { open[url]?.let { it.used = System.nanoTime(); runs.incrementAndGet(); return job(it.session) } }
      load(url)
    }
  }

  /** one run with a single float input, the outputs by name (for the phone's own code) */
  fun runFloats(url: String, input: String, data: FloatArray, shape: LongArray): Map<String, FloatArray> = using(url) { session ->
    OnnxTensor.createTensor(env, FloatBuffer.wrap(data), shape).use { t ->
      session.run(mapOf(input to t)).use { result -> result.associate { e -> val b = (e.value as OnnxTensor).floatBuffer; e.key to FloatArray(b.remaining()).also { b.get(it) } } }
    }
  }

  /** Where people speak (Silero VAD v6, MIT, 16 kHz): the probability of speech for every 32 ms (512 samples) of `x`, as
   * the website's lib/vad/vad.worker.ts and Silero's own wrapper compute it (each window sees the 64 samples before it,
   * the model's state carried from one window to the next). The model is downloaded once. */
  fun speechProbs(x: FloatArray): FloatArray {
    fetch(VAD_URL) {}
    val n = x.size / VAD_WIN; val out = FloatArray(n)
    using(VAD_URL) { session ->
      var state = FloatArray(2 * 128); val inp = FloatArray(VAD_CTX + VAD_WIN)
      OnnxTensor.createTensor(env, java.nio.LongBuffer.wrap(longArrayOf(16000L)), longArrayOf()).use { sr ->
        for (k in 0 until n) {
          java.util.Arrays.fill(inp, 0, VAD_CTX, 0f)
          if (k > 0) System.arraycopy(x, k * VAD_WIN - VAD_CTX, inp, 0, VAD_CTX)
          System.arraycopy(x, k * VAD_WIN, inp, VAD_CTX, VAD_WIN)
          OnnxTensor.createTensor(env, FloatBuffer.wrap(inp.copyOf()), longArrayOf(1, (VAD_CTX + VAD_WIN).toLong())).use { i ->
            OnnxTensor.createTensor(env, FloatBuffer.wrap(state), longArrayOf(2, 1, 128)).use { st ->
              session.run(mapOf("input" to i, "state" to st, "sr" to sr)).use { r ->
                val o = (r.get("output").get() as OnnxTensor).floatBuffer; out[k] = o.get(0)
                val s = (r.get("stateN").get() as OnnxTensor).floatBuffer; state = FloatArray(s.remaining()).also { s.get(it) }
              }
            }
          }
        }
      }
    }
    return out
  }

  private companion object {
    const val VAD_URL = "/api/studio/model/silero_vad_16k_op15.onnx"
    const val VAD_WIN = 512
    const val VAD_CTX = 64
    const val SMALL = 5L * 1024 * 1024
    const val MAX_OPEN = 60L * 1024 * 1024   // the beat tracker with the small models
  }
}
