const TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const VOICE = 'Aoede'

let currentCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let pendingResolve: (() => void) | null = null

function cleanup() {
  try { currentSource?.stop() } catch { /* already stopped */ }
  try { currentCtx?.close() } catch { /* already closed */ }
  if (pendingResolve) { pendingResolve(); pendingResolve = null }
  currentSource = null
  currentCtx = null
}

export function stopSpeaking() {
  cleanup()
}

async function fetchAudioB64(text: string): Promise<string> {
  const resp = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: TTS_MODEL,
      payload: {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      },
    }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || `TTS HTTP ${resp.status}`)
  }

  const data = await resp.json()
  const b64: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
  if (!b64) throw new Error('TTS: 오디오 데이터 없음')
  return b64
}

export async function speakWithGemini(
  text: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  cleanup()

  const audioB64 = await fetchAudioB64(text)

  const binary = atob(audioB64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const sampleRate = 24000
  const numSamples = bytes.length / 2
  const ctx = new AudioContext({ sampleRate })
  currentCtx = ctx

  const buffer = ctx.createBuffer(1, numSamples, sampleRate)
  const channel = buffer.getChannelData(0)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < numSamples; i++) {
    channel[i] = view.getInt16(i * 2, true) / 32768
  }

  return new Promise<void>((resolve) => {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    currentSource = source

    pendingResolve = resolve
    source.onended = () => {
      ctx.close().catch(() => {})
      currentSource = null
      currentCtx = null
      pendingResolve = null
      onEnd?.()
      resolve()
    }

    onStart?.()
    source.start()
  })
}
