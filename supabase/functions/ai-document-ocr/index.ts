import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const MAX_FILE_BYTES = 15 * 1024 * 1024

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
})

async function authenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization') || ''
  if (!authorization.startsWith('Bearer ')) throw new Error('ログインが必要です。')
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw new Error('ログイン情報を確認できません。')
  return { userClient }
}

async function hasPermission(userClient: any, key: string) {
  const { data, error } = await userClient.rpc('has_app_permission', { p_permission_key: key })
  if (error) throw error
  return data === true
}

async function canUseKind(userClient: any, kind: string) {
  if (kind === 'EXPENSE_RECEIPT') {
    const [own, review] = await Promise.all([
      hasPermission(userClient, 'expenses.manage_own'),
      hasPermission(userClient, 'expenses.review'),
    ])
    return own || review
  }
  if (kind === 'VENDOR_INVOICE' || kind === 'PAYMENT_PROOF') {
    return hasPermission(userClient, 'vendor_invoices.manage')
  }
  return false
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)))
  }
  return btoa(binary)
}

function allowedFile(file: File) {
  if (file.type === 'application/pdf') return true
  if (['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) return true
  return /\.(pdf|jpe?g|png|webp|gif)$/i.test(file.name)
}

const categories = [
  'FERTILIZER','PESTICIDE','FRESH_LEAF','TENCHA_PROCESSING','MATCHA_PROCESSING',
  'PACKAGING','SHIPPING','REPAIR','OUTSOURCING','OTHER',
]

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendor: { type: 'string' },
    documentNo: { type: 'string' },
    date: { type: 'string' },
    dueDate: { type: 'string' },
    billingPeriodStart: { type: 'string' },
    billingPeriodEnd: { type: 'string' },
    subtotalYen: { type: 'integer' },
    taxYen: { type: 'integer' },
    totalYen: { type: 'integer' },
    previousBalanceYen: { type: 'integer' },
    paymentYen: { type: 'integer' },
    carryoverBalanceYen: { type: 'integer' },
    referenceNo: { type: 'string' },
    paymentMethod: { type: 'string' },
    suggestedCategory: { type: 'string', enum: categories },
    warnings: { type: 'array', items: { type: 'string' } },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          transactionDate: { type: 'string' },
          slipNo: { type: 'string' },
          description: { type: 'string' },
          capacity: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          unitPriceYen: { type: 'integer' },
          lineTotalYen: { type: 'integer' },
          taxRate: { type: 'number' },
          suggestedCategory: { type: 'string', enum: categories },
        },
        required: ['transactionDate','slipNo','description','capacity','quantity','unit','unitPriceYen','lineTotalYen','taxRate','suggestedCategory'],
      },
    },
  },
  required: [
    'vendor','documentNo','date','dueDate','billingPeriodStart','billingPeriodEnd',
    'subtotalYen','taxYen','totalYen','previousBalanceYen','paymentYen','carryoverBalanceYen',
    'referenceNo','paymentMethod','suggestedCategory','warnings','items',
  ],
}

function instructions(kind: string) {
  return [
    'あなたは日本の経理帳票を高精度でデータ化するエンジンです。',
    '画像/PDFの文字だけでなく、表の列・罫線・左右の配置・見出しの意味を使って読み取ってください。',
    '出力は与えられたJSON Schemaだけに従い、帳票にない値を推測で作らないでください。不明は文字列なら空文字、金額なら0、配列なら空配列にしてください。',
    '帳票種別: ' + kind,
    '「御中」「様」が付いた会社名は通常は宛先です。請求元/vendorには発行者・販売者を入れてください。',
    '「前回繰越」「入金額」「繰越残高」「お買上げ額/小計」「消費税」「今回請求金額/合計」を別々の意味として扱ってください。',
    'totalYen は今回実際に請求される金額です。前回繰越や入金額をtotalYenにしないでください。',
    '「振込み」「入金」「相殺」だけの行は商品購入明細itemsに入れないでください。',
    'itemsには商品・サービスの購入明細だけを入れてください。',
    '表で日付・伝票番号が空欄の継続行は、直前の同じ伝票の値を transactionDate / slipNo に引き継いでください。',
    '商品名は原文をできるだけ忠実に保持し、③④などの丸数字も保持してください。',
    'capacityは250ml、500ml、500g等の容量欄です。unitは帳票に明記された数量単位のみ。空欄なら空文字です。',
    'unitPriceYen と lineTotalYen は帳票に印字された金額をそのまま返してください。税抜単価を勝手に税込へ変更しないでください。',
    '税率が明記されない場合でも、subtotalとtaxから明確に10%または8%と判断できる場合だけ設定してください。それ以外は0です。',
    '請求日の明記がなく請求期間しかない場合は、dateには請求期間末日を入れ、warningsに「請求日の明記がないため請求期間末日を使用」と入れてください。',
    '商品名から明確に分類できる場合、農薬はPESTICIDE、肥料はFERTILIZER等を設定してください。',
    'itemsの印字金額合計とsubtotalYen、subtotalYen+taxYenとtotalYenを内部で検算してください。不一致ならwarningsに理由を書いてください。',
    '数字の桁区切りカンマは数値として正しく解釈してください。',
  ].join('\n')
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  for (const out of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(out?.content) ? out.content : []) {
      if (part?.type === 'output_text' && typeof part?.text === 'string') return part.text
    }
  }
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { userClient } = await authenticatedUser(req)
    const form = await req.formData()
    const file = form.get('file')
    const kind = String(form.get('kind') || '').trim()

    if (!(file instanceof File)) return json({ error: '解析するファイルを選択してください。' }, 400)
    if (!['EXPENSE_RECEIPT','VENDOR_INVOICE','PAYMENT_PROOF'].includes(kind)) return json({ error: '帳票種別が不正です。' }, 400)
    if (!(await canUseKind(userClient, kind))) return json({ error: 'AI帳票解析を利用する権限がありません。' }, 403)
    if (file.size <= 0) return json({ error: '空のファイルは解析できません。' }, 400)
    if (file.size > MAX_FILE_BYTES) return json({ error: 'AI帳票解析は1ファイル15MBまでです。' }, 413)
    if (!allowedFile(file)) return json({ error: 'AI帳票解析はPDF/JPEG/PNG/WebP/GIFに対応しています。' }, 415)

    const { data: config, error: configError } = await admin.rpc('ai_ocr_get_private_config')
    if (configError) throw configError
    const enabled = config?.enabled === true
    const apiKey = String(config?.api_key || '')
    const model = String(config?.model || 'gpt-6-astra')
    if (!enabled || !apiKey) return json({ error: 'AI OCRが未設定です。管理者が設定画面からOpenAI APIキーを登録してください。', code: 'AI_OCR_NOT_CONFIGURED' }, 409)

    const bytes = new Uint8Array(await file.arrayBuffer())
    const base64 = bytesToBase64(bytes)
    const mime = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
    const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(file.name)
    const filePart = isPdf
      ? { type: 'input_file', filename: file.name || 'document.pdf', file_data: 'data:application/pdf;base64,' + base64, detail: 'high' }
      : { type: 'input_image', image_url: 'data:' + mime + ';base64,' + base64, detail: 'high' }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: instructions(kind),
        input: [{
          role: 'user',
          content: [
            filePart,
            { type: 'input_text', text: 'この帳票を読み取り、指定されたJSON Schemaに従って構造化してください。' },
          ],
        }],
        text: {
          format: {
            type: 'json_schema',
            name: 'japanese_accounting_document',
            strict: true,
            schema,
          },
        },
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      const apiMessage = String(payload?.error?.message || ('OpenAI API error (' + response.status + ')'))
      const safeMessage = response.status === 401
        ? 'OpenAI APIキーを確認してください。'
        : response.status === 429
          ? 'AI OCRの利用上限に達したか、一時的に混雑しています。'
          : response.status === 404
            ? '設定中のAI OCRモデルを利用できません。設定画面でモデルを確認してください。'
            : 'AI帳票解析に失敗しました：' + apiMessage
      return json({ error: safeMessage, code: 'OPENAI_ERROR' }, response.status >= 500 ? 502 : 400)
    }

    const outputText = extractOutputText(payload)
    if (!outputText) return json({ error: 'AIから解析結果を取得できませんでした。', code: 'EMPTY_AI_RESPONSE' }, 502)

    let result: any
    try { result = JSON.parse(outputText) }
    catch { return json({ error: 'AI解析結果をJSONとして読み取れませんでした。', code: 'INVALID_AI_JSON' }, 502) }

    return json({
      ok: true,
      provider: 'OPENAI',
      model,
      requestId: String(response.headers.get('x-request-id') || ''),
      result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('権限') ? 403 : message.includes('ログイン') ? 401 : 500
    return json({ error: message }, status)
  }
})
