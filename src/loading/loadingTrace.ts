import type {
  LoadingEvent,
  LoadingEventEnvelope,
  LoadingEventMap,
  LoadingEventTimestamp,
  LoadingEventType,
} from './loadingEvents.js'

/**
 * Snapshot returned by the trace clock.
 */
export interface LoadingTraceClockSnapshot {
  /** Wall-clock milliseconds since UNIX epoch. */
  absoluteTimeMs: number
  /** Monotonic milliseconds from the current runtime clock. */
  monotonicTimeMs: number
}

/**
 * Clock abstraction used by loading trace internals.
 */
export interface LoadingTraceClock {
  /** Return the current absolute + monotonic clock values. */
  now(): LoadingTraceClockSnapshot
}

/**
 * Timestamp model abstraction for deterministic testing and custom timing.
 */
export interface LoadingTimestampModel {
  /** Build the next loading event timestamp. */
  timestamp(): LoadingEventTimestamp
}

/**
 * Sink contract for consuming emitted loading events.
 */
export interface LoadingTraceSink<TEvents extends LoadingEventMap = LoadingEventMap> {
  /** Handle an emitted loading event. */
  emit(event: LoadingEvent<TEvents>): void
}

/**
 * Loading trace API used by instrumentation call-sites.
 */
export interface LoadingTrace<TEvents extends LoadingEventMap = LoadingEventMap> {
  /** Emit a typed loading event and return the emitted envelope. */
  emit<TType extends LoadingEventType<TEvents>>(
    type: TType,
    metadata?: TEvents[TType],
  ): LoadingEventEnvelope<TEvents, TType>
}

/** Options for constructing a loading trace clock. */
export type CreateLoadingTraceClockOptions = {
  /** Absolute wall-clock function (defaults to `Date.now`). */
  getAbsoluteTimeMs?: () => number
  /** Monotonic clock function (defaults to `performance.now` fallback `Date.now`). */
  getMonotonicTimeMs?: () => number
}

const getDefaultMonotonicTimeMs = () => {
  if (globalThis.performance?.now) return globalThis.performance.now()
  return Date.now()
}

/**
 * Create a trace clock using provided (or default) time sources.
 */
export function createLoadingTraceClock(options: CreateLoadingTraceClockOptions = {}): LoadingTraceClock {
  const getAbsoluteTimeMs = options.getAbsoluteTimeMs ?? (() => Date.now())
  const getMonotonicTimeMs = options.getMonotonicTimeMs ?? getDefaultMonotonicTimeMs

  return {
    now: () => ({
      absoluteTimeMs: getAbsoluteTimeMs(),
      monotonicTimeMs: getMonotonicTimeMs(),
    }),
  }
}

/** Options for constructing a loading timestamp model. */
export type CreateLoadingTimestampModelOptions = {
  /** Clock implementation used to build timestamps. */
  clock?: LoadingTraceClock
  /** Optional monotonic start anchor in milliseconds. */
  startMonotonicTimeMs?: number
}

/**
 * Create a timestamp model that tracks trace-relative monotonic elapsed time.
 */
export function createLoadingTimestampModel(options: CreateLoadingTimestampModelOptions = {}): LoadingTimestampModel {
  const clock = options.clock ?? createLoadingTraceClock()
  const startMonotonicTimeMs = options.startMonotonicTimeMs ?? clock.now().monotonicTimeMs

  return {
    timestamp: () => {
      const now = clock.now()
      return {
        absoluteTimeMs: now.absoluteTimeMs,
        monotonicTimeMs: now.monotonicTimeMs,
        relativeTimeMs: now.monotonicTimeMs - startMonotonicTimeMs,
      }
    },
  }
}

/** Options for creating a loading trace instance. */
export type CreateLoadingTraceOptions<TEvents extends LoadingEventMap> = {
  /** Optional event sink. Omit or pass `null` for no-op sink behavior. */
  sink?: LoadingTraceSink<TEvents> | null
  /** Optional custom timestamp model. */
  timestampModel?: LoadingTimestampModel
}

/**
 * Create a loading trace that emits typed timestamped events.
 */
export function createLoadingTrace<TEvents extends LoadingEventMap = LoadingEventMap>(
  options: CreateLoadingTraceOptions<TEvents> = {},
): LoadingTrace<TEvents> {
  const sink = options.sink ?? null
  const timestampModel = options.timestampModel ?? createLoadingTimestampModel()

  return {
    emit: <TType extends LoadingEventType<TEvents>>(type: TType, metadata?: TEvents[TType]) => {
      const event: LoadingEventEnvelope<TEvents, TType> = {
        type,
        timestamp: timestampModel.timestamp(),
      }

      if (metadata !== undefined) {
        event.metadata = metadata
      }

      sink?.emit(event as LoadingEvent<TEvents>)
      return event
    },
  }
}

/**
 * Create a trace with no configured sink.
 */
export function createNoopLoadingTrace<TEvents extends LoadingEventMap = LoadingEventMap>(): LoadingTrace<TEvents> {
  return createLoadingTrace<TEvents>({ sink: null })
}
