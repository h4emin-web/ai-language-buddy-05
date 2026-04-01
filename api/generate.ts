export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const { model, payload } = await req.json()
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return new Response('Server misconfigured: missing GEMINI_API_KEY', { status: 500 })

  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  )

  const data = await upstream.json()
  return Response.json(data, { status: upstream.status })
}
