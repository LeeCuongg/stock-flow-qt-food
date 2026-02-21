declare module 'jspdf' {
  export default class jsPDF {
    constructor(options?: {
      orientation?: 'portrait' | 'landscape'
      unit?: 'mm' | 'pt' | 'cm' | 'in'
      format?: 'a4' | 'letter' | string | [number, number]
    })
    internal: { pageSize: { getWidth(): number; getHeight(): number } }
    addImage(imageData: string, format: string, x: number, y: number, w: number, h: number): void
    addPage(): void
    save(filename: string): void
  }
}
