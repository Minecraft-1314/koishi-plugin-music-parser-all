export class SimpleLRUCache<V> {
  private map = new Map<string, { value: V; expireAt: number }>()

  constructor(private max: number, private ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (entry.expireAt <= Date.now()) {
      this.map.delete(key)
      return undefined
    }
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.value
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { value, expireAt: Date.now() + this.ttlMs })
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next()
      if (oldest.done) break
      this.map.delete(oldest.value)
    }
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}

export class ConcurrencyLimiter {
  private running = 0
  private queue: (() => void)[] = []

  constructor(private max: number) {
    if (!this.max || this.max < 1) this.max = 1
  }

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return
    }
    await new Promise<void>(resolve => this.queue.push(resolve))
    this.running++
  }

  release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) next()
  }
}
