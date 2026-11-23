// Candle (design: "UI Components", MainScreen and Candle; Requirements 2.1, 4.1).
//
// The wax height is `scaleY(candleFraction)`, so the candle shrinks with the remaining time. The candle
// is decorative, because the countdown text carries the same information, so it is hidden from assistive
// technology. The flame shows only while the candle is lit.

export interface CandleProps {
  /** True in Calm_State. The flame is shown only while the candle is lit. */
  readonly lit: boolean;
  /** Share of the Work_Interval that remains, in [0, 1]. Zero leaves only the stub of the candle. */
  readonly fraction: number;
}

export function Candle({ lit, fraction }: CandleProps) {
  const height = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;

  return (
    <div class="sbr-candle" data-lit={lit ? 'true' : 'false'} aria-hidden="true">
      <div class="sbr-candle-flame sbr-move" />
      <div class="sbr-candle-body">
        <div class="sbr-candle-wax sbr-move" style={{ transform: `scaleY(${height})` }} />
      </div>
      <div class="sbr-candle-base" />
    </div>
  );
}
