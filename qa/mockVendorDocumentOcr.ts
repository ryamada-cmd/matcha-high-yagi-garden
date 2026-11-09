// Explicitly prohibit OCR network and any external AI service in synthetic QA.
export async function recognizeDocument():Promise<never>{throw Error('OCR is disabled in QA')}
export async function recognizeInvoiceWithAppleVision():Promise<never>{throw Error('OCR is disabled in QA')}
