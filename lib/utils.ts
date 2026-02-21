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
