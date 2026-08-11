export const COMPACT_MAX_VP: number = 599
export const MEDIUM_MIN_VP: number = 600
export const EXPANDED_MIN_VP: number = 840
export const GRID_BREAKPOINTS: string[] = ['600vp', '840vp']

export enum LayoutClass {
  COMPACT = 'compact',
  MEDIUM = 'medium',
  EXPANDED = 'expanded'
}

export function layoutClassForWidth(widthVp: number): LayoutClass {
  if (widthVp < MEDIUM_MIN_VP) {
    return LayoutClass.COMPACT
  }
  if (widthVp < EXPANDED_MIN_VP) {
    return LayoutClass.MEDIUM
  }
  return LayoutClass.EXPANDED
}
