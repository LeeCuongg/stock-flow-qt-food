import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format tiền VND: luôn số nguyên (110.234) */
export function formatVN(n: number): string {
  return Math.round(Number(n)).toLocaleString('vi-VN')
}

/** Format số lượng: giữ lẻ nếu có (0,5 hay 4,326), số nguyên thì không hiện lẻ */
export function formatQty(n: number): string {
  const v = Number(n)
  if (Number.isInteger(v)) return v.toLocaleString('vi-VN')
  return v.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 3 })
}

/** Lấy ngày hiện tại theo giờ Việt Nam (YYYY-MM-DD) */
export function vnToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
}

/** Tạo ISO timestamp từ ngày custom + giờ thực tế Việt Nam hiện tại */
export function vnDateTimeISO(dateStr: string): string {
  const vnTime = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false })
  return new Date(dateStr + 'T' + vnTime + '+07:00').toISOString()
}

/** Format ngày hiển thị theo giờ Việt Nam */
export function formatVNDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
}
