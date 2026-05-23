export interface StatusUpdate {
  routedVia: string;
  fallbackAttempts: number;
  tokensToday: number;
}

type HeaderSource = Headers | Record<string, string>;

function getHeader(headers: HeaderSource, name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, string>;
  const lower = name.toLowerCase();
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) {
      return record[key];
    }
  }
  return undefined;
}

function utcDayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Parses the FreeLLMAPI routing headers and tracks the running token count for
// the day's session. Token count resets at UTC midnight to match the upstream
// daily quota reset (§8.8).
export class StatusTracker {
  private dailyTokens = 0;
  private dayKey: string;
  private readonly listeners = new Set<(update: StatusUpdate) => void>();
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
    this.dayKey = utcDayKey(this.clock());
  }

  subscribe(listener: (update: StatusUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  recordResponse(headers: HeaderSource, tokensUsed: number): StatusUpdate {
    this.rolloverIfNewDay();

    const routedVia = getHeader(headers, 'X-Routed-Via') ?? 'unknown';
    const fallbackAttempts = Number(getHeader(headers, 'X-Fallback-Attempts') ?? '0') || 0;
    this.dailyTokens += tokensUsed;

    const update: StatusUpdate = {
      routedVia,
      fallbackAttempts,
      tokensToday: this.dailyTokens,
    };
    for (const listener of this.listeners) {
      listener(update);
    }
    return update;
  }

  get tokensToday(): number {
    this.rolloverIfNewDay();
    return this.dailyTokens;
  }

  private rolloverIfNewDay(): void {
    const today = utcDayKey(this.clock());
    if (today !== this.dayKey) {
      this.dayKey = today;
      this.dailyTokens = 0;
    }
  }
}
