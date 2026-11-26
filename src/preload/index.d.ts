import type { MemoTrailApi } from './index'

declare global {
  interface Window {
    api: MemoTrailApi
  }
}

export {}
