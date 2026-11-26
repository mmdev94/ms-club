declare module '@letele/playing-cards' {
  import type { ComponentType, CSSProperties } from 'react'
  const cards: Record<string, ComponentType<{ style?: CSSProperties }>>
  export = cards
}
