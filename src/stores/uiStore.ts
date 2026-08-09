import { create } from 'zustand'
import type { LayoutState } from '../types'

interface UIStore extends LayoutState {
  toggleWeekend: () => void
  toggleImmersive: () => void
}

export const useUIStore = create<UIStore>((set) => ({
  showWeekend: true,
  immersive: false,
  toggleWeekend: () => set((s) => ({ showWeekend: !s.showWeekend })),
  toggleImmersive: () => set((s) => ({ immersive: !s.immersive })),
}))
