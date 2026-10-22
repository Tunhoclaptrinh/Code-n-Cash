type EventHandler<T = any> = (data: T) => void;
class EventEmitter {
  private events: Map<string, Set<EventHandler>> = new Map();
  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(handler);
    return () => {
      this.off(event, handler);
    };
  }
  off<T = any>(event: string, handler: EventHandler<T>): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.events.delete(event);
      }
    }
  }
  emit<T = any>(event: string, data?: T): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (err) {
          console.error(`[EventBus Error] Event "${event}":`, err);
        }
      });
    }
  }
  clear(): void {
    this.events.clear();
  }
}
export const eventBus = new EventEmitter();
