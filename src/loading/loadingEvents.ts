/**
 * Mapping from loading event type to metadata payload type.
 *
 * Example:
 * ```ts
 * type Events = {
 *   rendererReady: undefined
 *   spiceReady: { kernelCount: number }
 * }
 * ```
 */
export type LoadingEventMap = Record<string, unknown | undefined>

/** String event type names for a loading event map. */
export type LoadingEventType<TEvents extends LoadingEventMap = LoadingEventMap> = Extract<keyof TEvents, string>

/**
 * Event timestamp envelope used by loading traces.
 */
export interface LoadingEventTimestamp {
  /** Wall-clock timestamp in milliseconds since the UNIX epoch. */
  absoluteTimeMs: number
  /** Monotonic timestamp in milliseconds from the runtime clock. */
  monotonicTimeMs: number
  /** Monotonic milliseconds elapsed since this trace started. */
  relativeTimeMs: number
}

/**
 * Generic loading event envelope.
 */
export interface LoadingEventEnvelope<
  TEvents extends LoadingEventMap = LoadingEventMap,
  TType extends LoadingEventType<TEvents> = LoadingEventType<TEvents>,
> {
  /** Event type/name identifier. */
  type: TType
  /** Absolute + monotonic timestamp bundle. */
  timestamp: LoadingEventTimestamp
  /** Optional event-specific payload. */
  metadata?: TEvents[TType]
}

/**
 * Discriminated union of all events described by a loading event map.
 */
export type LoadingEvent<TEvents extends LoadingEventMap = LoadingEventMap> = {
  [TType in LoadingEventType<TEvents>]: LoadingEventEnvelope<TEvents, TType>
}[LoadingEventType<TEvents>]
