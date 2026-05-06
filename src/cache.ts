// C2: route cache — Map-based LRU
// C5: cal buffer — async FIFO queue with bounded concurrency

// ── C2: RouteCache ────────────────────────────────────────────────────────────

interface LRUNode<K, V> {
  key: K;
  value: V;
  prev: LRUNode<K, V> | null;
  next: LRUNode<K, V> | null;
}

/**
 * C2: Route cache — LRU eviction cache for routing decisions.
 *
 * Stores at most `capacity` entries; on overflow the least-recently-used
 * entry is evicted. All operations are O(1).
 *
 * @typeParam K - Key type (must be a valid `Map` key).
 * @typeParam V - Value type.
 *
 * @example
 * ```ts
 * const cache = new RouteCache<string, string>(128);
 * cache.set("task-abc", "adapter-v2");
 * const adapter = cache.get("task-abc"); // "adapter-v2"
 * ```
 */
export class RouteCache<K, V> {
  private readonly capacity: number;
  private readonly map: Map<K, LRUNode<K, V>>;
  private head: LRUNode<K, V> | null = null; // most-recently-used
  private tail: LRUNode<K, V> | null = null; // least-recently-used

  constructor(capacity: number) {
    if (capacity <= 0) throw new RangeError("RouteCache capacity must be > 0");
    this.capacity = capacity;
    this.map = new Map();
  }

  /** Number of entries currently in the cache. */
  get size(): number {
    return this.map.size;
  }

  /**
   * Returns the value for `key` and marks it as most-recently-used, or
   * `undefined` if not present.
   */
  get(key: K): V | undefined {
    const node = this.map.get(key);
    if (node === undefined) return undefined;
    this.moveToFront(node);
    return node.value;
  }

  /**
   * Inserts or updates the entry for `key`. If inserting would exceed
   * `capacity`, the least-recently-used entry is evicted first.
   */
  set(key: K, value: V): void {
    const existing = this.map.get(key);
    if (existing !== undefined) {
      existing.value = value;
      this.moveToFront(existing);
      return;
    }
    const node: LRUNode<K, V> = { key, value, prev: null, next: null };
    this.map.set(key, node);
    this.addToFront(node);
    if (this.map.size > this.capacity) this.evictLRU();
  }

  /** Returns `true` if `key` is present without altering LRU order. */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Removes the entry for `key`. Returns `true` if the entry existed. */
  delete(key: K): boolean {
    const node = this.map.get(key);
    if (node === undefined) return false;
    this.removeNode(node);
    this.map.delete(key);
    return true;
  }

  /** Removes all entries. */
  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  private addToFront(node: LRUNode<K, V>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head !== null) this.head.prev = node;
    this.head = node;
    if (this.tail === null) this.tail = node;
  }

  private removeNode(node: LRUNode<K, V>): void {
    if (node.prev !== null) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next !== null) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private moveToFront(node: LRUNode<K, V>): void {
    if (node === this.head) return;
    this.removeNode(node);
    this.addToFront(node);
  }

  private evictLRU(): void {
    if (this.tail === null) return;
    const lru = this.tail;
    this.removeNode(lru);
    this.map.delete(lru.key);
  }
}

// ── C5: CalendarBuffer ────────────────────────────────────────────────────────

type CalTask<T> = () => Promise<T>;

interface QueuedItem<T> {
  task: CalTask<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * C5: Calendar buffer — async FIFO task queue with bounded concurrency.
 *
 * Tasks are processed in the order they are enqueued. At most `concurrency`
 * tasks run simultaneously. Each {@link enqueue} call returns a `Promise`
 * that resolves (or rejects) when that task completes.
 *
 * @typeParam T - The resolved value type of enqueued tasks.
 *
 * @example
 * ```ts
 * const buffer = new CalendarBuffer<string>(3);
 *
 * const p = buffer.enqueue(async () => {
 *   const result = await myHeavyOperation();
 *   return result;
 * });
 *
 * const value = await p;
 * await buffer.flush(); // wait until the queue is drained
 * ```
 */
export class CalendarBuffer<T = unknown> {
  private readonly queue: QueuedItem<T>[] = [];
  private running = 0;
  private readonly concurrency: number;

  constructor(concurrency = 1) {
    if (concurrency <= 0) throw new RangeError("CalendarBuffer concurrency must be > 0");
    this.concurrency = concurrency;
  }

  /** Number of tasks waiting in the queue (not yet started). */
  get size(): number {
    return this.queue.length;
  }

  /** Number of tasks currently executing. */
  get activeCount(): number {
    return this.running;
  }

  /**
   * Adds `task` to the queue and returns a `Promise` that settles when the
   * task completes.
   */
  enqueue(task: CalTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.drain();
    });
  }

  /**
   * Returns a `Promise` that resolves once every queued and in-flight task
   * has settled.
   */
  async flush(): Promise<void> {
    while (this.queue.length > 0 || this.running > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  private drain(): void {
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running++;
      item
        .task()
        .then(item.resolve, item.reject)
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }
}
