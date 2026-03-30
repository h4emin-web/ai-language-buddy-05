const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const MODEL = 'gemini-2.0-flash'

const systemPrompts: Record<string, string> = {
  english: `You are an English conversation partner for Korean language learners.
STRICT RULES — follow every rule without exception:
- You MUST respond in English ONLY. NEVER use Korean, not even a single word.
- If the user writes in Korean or mixes Korean, still reply in English only.
- Keep responses short and conversational, like a phone call (2-3 sentences max).
- ALWAYS end with a follow-up question to keep the conversation going.
- Be warm and encouraging.`,

  japanese: `あなたは韓国人向けの日本語会話パートナーです。
厳守ルール — 例外なく守ること：
- 必ず日本語のみで返答すること。韓国語は一切使わないこと。
- ユーザーが韓国語を使っても、日本語のみで返答すること。
- 短く自然な会話（2〜3文以内）にすること。
- 必ず質問で締めくくること。
- 温かく励ますこと。`,

  chinese: `你是韩国学习者的中文会话伙伴。
严格规则 — 不得有任何例外：
- 只能用中文回答。绝对不能使用韩语，哪怕一个字也不行。
- 即使用户说韩语，也只用中文回答。
- 回答要简短自然，像打电话一样（2-3句以内）。
- 每次必须以问题结尾。
- 态度温暖，给予鼓励。`,
}

const topicStarters: Record<string, Record<string, string>> = {
  english: {
    daily: "Start by warmly asking about the learner's day or daily routine.",
    travel: "Start by asking about their travel experiences or dream destinations.",
    food: "Start by asking about their favorite food or a recent meal.",
    movies: "Start by asking about a movie or TV show they watched recently.",
    work: "Start by asking about their job or career aspirations.",
    free: "Start with a warm greeting and let the conversation flow naturally.",
  },
  japanese: {
    daily: 'まず今日の出来事や日常について聞いてください。',
    travel: 'まず旅行の経験や行きたい場所について聞いてください。',
    food: 'まず好きな食べ物や最近の食事について聞いてください。',
    movies: 'まず最近見た映画やドラマについて聞いてください。',
    work: 'まず仕事やキャリアの目標について聞いてください。',
    free: 'フレンドリーな挨拶から始めて、自然に会話を進めてください。',
  },
  chinese: {
    daily: '先问问他们今天过得怎么样或者日常生活。',
    travel: '先问问他们的旅行经历或者想去的地方。',
    food: '先问问他们喜欢的食物或最近吃了什么。',
    movies: '先问问他们最近看了什么电影或电视剧。',
    work: '先问问他们的工作或职业目标。',
    free: '用友好的问候开始，让对话自然进行。',
  },
}

const correctionPrompts: Record<string, string> = {
  english: `You are an English tutor for Korean learners.
The user wrote a sentence in English. Respond in this exact format:
📝 원문: (원래 문장 그대로)
✅ 교정: (corrected sentence in English — if no errors, write the original)
💡 설명: (한국어로 짧게 설명. 오류 없으면 "완벽한 문장이에요! 👏")

IMPORTANT: The 교정 line must always be in English. Only 설명 is in Korean.`,

  japanese: `あなたは韓国人向けの日本語教師です。次の形式で答えてください：
📝 원문: (원래 문장 그대로)
✅ 교정: (日本語で교정된 문장 — 오류 없으면 원문 그대로)
💡 설명: (한국어로 짧게 설명. 오류 없으면 "완벽한 문장이에요! 👏")

중요: 교정 줄은 반드시 일본어로. 설명만 한국어로.`,

  chinese: `你是面向韩国学习者的中文老师。请按以下格式回答：
📝 원문: (원래 문장 그대로)
✅ 교정: (用中文写교정된 문장 — 없으면 원문 그대로)
💡 설명: (한국어로 짧게 설명. 오류 없으면 "완벽한 문장이에요! 👏")

重要: 교정 줄은 반드시 중국어로. 설명만 한국어로.`,
}

export type Msg = { role: 'user' | 'assistant'; content: string }

// AI가 이미 "해당 언어로만 말하겠다"고 확인한 것처럼 히스토리를 시작
// → Gemini가 언어 지시를 훨씬 잘 따름
const languagePriming: Record<string, { user: string; model: string }> = {
  english: {
    user: "Let's start our English conversation practice.",
    model: "Sounds great! I'll speak English only for our entire session — no Korean at all. Let's go!",
  },
  japanese: {
    user: '日本語の練習を始めましょう。',
    model: 'はい、もちろんです！今日のセッションはずっと日本語のみで話します。韓国語は一切使いません。始めましょう！',
  },
  chinese: {
    user: '让我们开始中文练习。',
    model: '好的！整个对话我只说中文，绝对不用韩语。我们开始吧！',
  },
}

function toGeminiContents(messages: Msg[], language: string) {
  const priming = languagePriming[language]
  const primingTurns = priming
    ? [
        { role: 'user', parts: [{ text: priming.user }] },
        { role: 'model', parts: [{ text: priming.model }] },
      ]
    : []

  if (messages.length === 0) {
    return [...primingTurns, { role: 'user', parts: [{ text: 'Start.' }] }]
  }
  return [
    ...primingTurns,
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
  ]
}

export async function streamChat({
  messages,
  language,
  topic,
  apiKey,
  onDelta,
  onDone,
}: {
  messages: Msg[]
  language: string
  topic: string
  apiKey: string
  onDelta: (chunk: string) => void
  onDone: () => void
}) {
  const lang = language || 'english'
  const systemPrompt = `${systemPrompts[lang] || systemPrompts.english}\n\n${topicStarters[lang]?.[topic] || topicStarters.english.free}`

  const resp = await fetch(
    `${GEMINI_BASE}/models/${MODEL}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: toGeminiContents(messages, language),
        generationConfig: { temperature: 0.9, maxOutputTokens: 400 },
      }),
    }
  )

  if (!resp.ok || !resp.body) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${resp.status}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIdx: number
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).replace(/\r$/, '')
      buffer = buffer.slice(newlineIdx + 1)
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6).trim()
      if (!jsonStr) continue
      try {
        const parsed = JSON.parse(jsonStr)
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text as string | undefined
        if (text) onDelta(text)
      } catch {
        // ignore malformed chunks
      }
    }
  }

  onDone()
}

export interface KoreanTranslateResult {
  hasKorean: boolean
  translated: string
  explanation: string
}

const langNames: Record<string, string> = {
  english: 'English',
  japanese: '日本語',
  chinese: '中文',
}

export async function autoTranslateKorean(
  text: string,
  language: string,
  apiKey: string,
): Promise<KoreanTranslateResult> {
  const targetLang = langNames[language] || 'English'

  const prompt = `The user is practicing ${targetLang} but mixed in some Korean words or phrases.

User's message: "${text}"

Your job:
1. Find every Korean word or phrase in the message
2. Translate each one into ${targetLang} naturally in context
3. Return the entire message rewritten fully in ${targetLang}

Respond ONLY with valid JSON, no markdown:
{
  "hasKorean": true,
  "translated": "complete message rewritten in ${targetLang}",
  "explanation": "한 줄로 변환 내용 설명 (예: 배고파→I'm hungry, 시장→market)"
}`

  const resp = await fetch(
    `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
      }),
    }
  )

  if (!resp.ok) throw new Error(`translate HTTP ${resp.status}`)

  const data = await resp.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const clean = raw.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(clean) as KoreanTranslateResult
  } catch {
    return { hasKorean: false, translated: text, explanation: '' }
  }
}

export async function correctText(text: string, language: string, apiKey: string): Promise<string> {
  const lang = language || 'english'
  const prompt = correctionPrompts[lang] || correctionPrompts.english

  const resp = await fetch(
    `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nSentence: "${text}"` }] }],
      }),
    }
  )

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${resp.status}`)
  }

  const data = await resp.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '교정 결과를 가져올 수 없습니다.'
}
