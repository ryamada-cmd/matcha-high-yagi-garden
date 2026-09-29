const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://mdbtngousidfanmrjybt.supabase.co'
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_f9P6hsToK8BbDUFJjLvIHg_-vEUW2h_'

export const config = {
  api: {
    bodyParser: false,
  },
}

async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > maxBytes) throw new Error('UPLOAD_TOO_LARGE')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

async function verifyUser(auth) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: auth,
    },
  })
  return response.ok
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' })

  const auth = String(req.headers.authorization || '')
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'ログインが必要です' })

  const gatewayUrl = String(process.env.OCR_GATEWAY_URL || '').replace(/\/$/, '')
  const gatewayApiKey = String(process.env.OCR_GATEWAY_API_KEY || '')
  if (!gatewayUrl) return res.status(503).json({ error: 'Apple Vision OCR Gateway is not configured' })

  try {
    if (!(await verifyUser(auth))) return res.status(401).json({ error: 'ログイン情報を確認できませんでした' })

    // Vercel Functions are intended here for normal invoice scans. Larger documents
    // automatically fall back to the existing client-side OCR in documentOcr.ts.
    const body = await readBody(req, 4 * 1024 * 1024)
    const contentType = String(req.headers['content-type'] || '')
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      return res.status(400).json({ error: 'multipart/form-data が必要です' })
    }

    const headers = {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
    }
    if (gatewayApiKey) headers['X-API-Key'] = gatewayApiKey

    const upstream = await fetch(`${gatewayUrl}/invoice`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(120000),
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json; charset=utf-8')
    return res.send(text)
  } catch (error) {
    if (error instanceof Error && error.message === 'UPLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Apple Vision OCRは4MB以下のファイルで利用できます。既存OCRへ切り替えます。' })
    }
    console.error('iOS OCR proxy failed', error)
    return res.status(502).json({ error: error instanceof Error ? error.message : String(error) })
  }
}
