import type { CounterApi } from '@shared/ipc'

declare global {
  interface Window {
    counter: CounterApi
  }
}

export {}
