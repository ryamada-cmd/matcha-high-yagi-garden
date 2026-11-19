export const MEDIA_MAX_BYTES = 20_000_000_000
export const MEDIA_CHUNK_BYTES = 10 * 1024 * 1024
export const MEDIA_CATEGORIES = ['茶摘み','イベント','圃場','機械設備','作業記録','商品・制作','その他'] as const

const formats = {
  jpg:['photo','image/jpeg'], jpeg:['photo','image/jpeg'], png:['photo','image/png'],
  webp:['photo','image/webp'], gif:['photo','image/gif'],
  heic:['photo','image/heic'], heif:['photo','image/heif'],
  tif:['photo','image/tiff'], tiff:['photo','image/tiff'], dng:['photo','image/x-adobe-dng'],
  cr2:['photo','image/x-canon-cr2'], cr3:['photo','image/x-canon-cr3'],
  nef:['photo','image/x-nikon-nef'], arw:['photo','image/x-sony-arw'],
  raf:['photo','image/x-fuji-raf'], raw:['photo','application/octet-stream'],
  mp4:['video','video/mp4'], mov:['video','video/quicktime'],
} as const
type Extension = keyof typeof formats
export const MEDIA_ACCEPT = Object.keys(formats).map(extension => '.'+extension).join(',')

export function mediaFormat(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() as Extension
  if (!fileName.includes('.') || !Object.hasOwn(formats,extension)) return null
  const [kind,mime] = formats[extension]
  return {extension,kind,mime}
}

export function matchMediaSignature(format: NonNullable<ReturnType<typeof mediaFormat>>, bytes: Uint8Array) {
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.subarray(start,start+length))
  const tiff = ascii(0,4)==='II*\0' || ascii(0,4)==='MM\0*' || ascii(0,4)==='II+\0' || ascii(0,4)==='MM\0+'
  const iso = ascii(4,4)==='ftyp' && bytes.length>=16
  const brands: string[] = []
  if (iso) {
    const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
    const boxSize = view.getUint32(0)
    if (boxSize<16 || boxSize>bytes.length) return false
    brands.push(ascii(8,4))
    for (let i=16;i+4<=boxSize;i+=4) brands.push(ascii(i,4))
  }
  switch (format.extension) {
    case 'jpg': case 'jpeg': return bytes[0]===255 && bytes[1]===216 && bytes[2]===255
    case 'png': return [137,80,78,71,13,10,26,10].every((byte,i)=>bytes[i]===byte)
    case 'webp': return ascii(0,4)==='RIFF' && ascii(8,4)==='WEBP'
    case 'gif': return ['GIF87a','GIF89a'].includes(ascii(0,6))
    case 'heic': case 'heif': return brands.some(brand=>['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1'].includes(brand))
    case 'cr3': return brands.includes('crx ')
    case 'cr2': return tiff && ascii(8,4)==='CR\x02\0'
    case 'raf': return ascii(0,16)==='FUJIFILMCCD-RAW '
    case 'tif': case 'tiff': case 'dng': case 'nef': case 'arw': case 'raw': return tiff
    case 'mp4': return brands.some(brand=>/^(isom|iso[2-9]|mp4[12]|avc1|dash|M4V |MSNV|cmfc|cmfs)$/.test(brand))
    case 'mov': {
      if (brands.includes('qt  ')) return true
      if (iso || bytes.length<16) return false
      const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength)
      const size = view.getUint32(0)
      return size>=8 && ['moov','mdat','wide','free','skip'].includes(ascii(4,4))
    }
  }
}
