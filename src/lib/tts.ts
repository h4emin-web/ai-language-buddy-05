// Gemini TTS — Pro 모델 우선, 실패시 Flash 자동 폴백
// Returns base64 LINEAR16 PCM (24kHz, mono)

const TTS_MODELS = [
  'gemini-2.5-pro-preview-tts',
  'gemini-2.5-flash-preview-tts',
]

// Aoede: breezy & natural / Sulafat: warm / Achernar: soft
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

async function fetchAudioB64(text: string, apiKey: string): Promise<string> {
  for (const model of TTS_MODELS) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
          },
        }),
      }
    )

    if (!resp.ok) {
      if (resp.status === 404) continue // 모델 없으면 다음 시도
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `TTS HTTP ${resp.status}`)
    }

    const data = await resp.json()
    const b64: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
    if (b64) return b64
  }
  throw new Error('TTS: 사용 가능한 모델 없음')
}

export async function speakWithGemini(
  text: string,
  apiKey: string,
  onStart?: () => void,
  onEnd?: () => void,
): Promise<void> {
  cleanup()

  const audioB64 = await fetchAudioB64(text, apiKey)

  // Decode base64 → Uint8Array (PCM 16-bit LE, 24kHz, mono)
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
