import { Disposable, type IDisposable } from "./disposable";
import { sleep } from "./sleep";

/**
 * A typed event.
 */
export interface Event<T> {
  /**
   *
   * @param listener The listener function will be called when the event happens.
   * @return a disposable to remove the listener again.
   */
  (listener: (e: T) => void): IDisposable;
}

/**
 * Waits for the event to fire, then resolves the promise once finished
 */
export function listenOnce<T>(
  event: Event<T>,
  condition?: (ev: T) => boolean
): Promise<T> {
  return new Promise((resolve) => {
    const disposable = event((result) => {
      if (typeof condition === "undefined" || condition(result)) {
        disposable.dispose();
        resolve(result);
      }
    });
  });
}

export function onceEvent<T>(event: Event<T>): Event<T> {
  return (listener: (e: T) => unknown, thisArgs?: unknown) => {
    const result = event((e) => {
      result.dispose();
      return listener.call(thisArgs, e);
    });

    return result;
  };
}

export class Emitter<T> implements IDisposable {
  private registeredListeners = new Set<(e: T) => void>();
  private _event: Event<T> | undefined;

  get event(): Event<T> {
    if (!this._event) {
      this._event = (listener: (e: T) => void) => {
        this.registeredListeners.add(listener);

        return Disposable.create(() => {
          this.registeredListeners.delete(listener);
        });
      };
    }

    return this._event;
  }

  /** Invoke all listeners registered to this event. */
  fire(event: T): void {
    this.registeredListeners.forEach((listener) => {
      listener(event);
    });
  }

  dispose(): void {
    this.registeredListeners = new Set();
  }
}

/**
 * A typed event.
 */
export interface AsyncEvent<T> {
  /**
   *
   * @param listener The listener function will be called when the event happens
   * @return a disposable to remove the listener again.
   */
  (listener: (e: T) => Promise<void>): IDisposable;
}

/**
 * Works just like Emitter, but requires the listeners to return a promise. When "fire" is called
 * it will be resolved rejected, based on calling the listeners. The constructor takes a timeout
 */
export class AsyncEmitter<T> implements IDisposable {
  private registeredListeners = new Set<(e: T) => Promise<void>>();
  private _event: AsyncEvent<T> | undefined;

  constructor(private timeoutMs: number) {}

  get event(): AsyncEvent<T> {
    if (!this._event) {
      this._event = (listener: (e: T) => Promise<void>) => {
        this.registeredListeners.add(listener);

        return Disposable.create(() => {
          this.registeredListeners.delete(listener);
        });
      };
    }

    return this._event;
  }

  /** Invoke all listeners registered to this event and wait for them to resolve, unless timeout occurs. */
  fire(event: T): Promise<void> {
    return Promise.race([
      sleep(this.timeoutMs).then(() => {
        throw new Error("Timeout firing async event");
      }),
      // We run all listeners in parallel, where if any fails, the firing of the event fails
      Promise.allSettled(
        Array.from(this.registeredListeners).map((listener) => listener(event))
      ).then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            throw result.reason;
          }
        }
      }),
    ]);
  }

  dispose(): void {
    this.registeredListeners = new Set();
  }
}
