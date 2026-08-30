export class SimpleLRUCache<V> {
  private map = new Map<string, { value: V; expireAt: number }>()

  constructor(private max: number, private ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expireAt) {
      this.map.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: V): void {
    this.map.delete(key)
    while (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value
      if (oldest === undefined) break
      this.map.delete(oldest)
    }
    this.map.set(key, { value, expireAt: Date.now() + this.ttlMs })
  }

  clear(): void {
    this.map.clear()
  }
}

export class ConcurrencyLimiter {
  private running = 0
  private queue: (() => void)[] = []

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    return new Promise(resolve => {
      this.queue.push(() => {
        this.running++
        resolve()
      })
    })
  }

  release(): void {
    this.running = Math.max(0, this.running - 1)
    const next = this.queue.shift()
    if (next) next()
  }
}
