import { m } from "@/paraglide/messages.js";

// Swell height in metres for each three-hour step, and whether the spot's criteria are met then.
const FORECAST = [
  { meters: 0.9, works: false },
  { meters: 1.0, works: false },
  { meters: 1.1, works: false },
  { meters: 1.2, works: false },
  { meters: 1.3, works: false },
  { meters: 1.4, works: false },
  { meters: 1.5, works: false },
  { meters: 1.6, works: false },
  { meters: 1.7, works: false },
  { meters: 1.8, works: true },
  { meters: 1.8, works: true },
  { meters: 1.7, works: false },
  { meters: 1.6, works: false },
  { meters: 1.4, works: false },
  { meters: 1.3, works: false },
  { meters: 1.1, works: false },
];
const HIGHEST = Math.max(...FORECAST.map((step) => step.meters));

function Measure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-s py-s shadow-[inset_0_calc(var(--border-s)*-1)_0_var(--neutral-4)] last:shadow-none">
      <dt className="text-neutral-7">{label}</dt>
      <dd className="font-mono text-s font-medium">{value}</dd>
    </div>
  );
}

// The spot screen of the app, with example data.
export function SpotPreview() {
  return (
    <div className="grid gap-l p-l">
      <div className="grid gap-xs">
        <h3 className="text-l font-medium">La Torche</h3>
        <p className="flex items-center gap-xs font-medium">
          <span aria-hidden className="size-2 rounded-full bg-success" />
          {m.preview_spot_status()}
        </p>
      </div>

      <dl>
        <Measure label={m.preview_swell()} value={m.preview_swell_value()} />
        <Measure label={m.preview_wind()} value={m.preview_wind_value()} />
        <Measure label={m.preview_tide()} value={m.preview_tide_value()} />
      </dl>

      <figure className="grid gap-xs">
        <figcaption className="text-s text-neutral-7">{m.preview_forecast()}</figcaption>
        <div aria-hidden className="flex h-24 items-end gap-xxs">
          {FORECAST.map((step, index) => (
            <span
              key={index}
              className={
                step.works ? "flex-1 rounded-full bg-color-1" : "flex-1 rounded-full bg-neutral-4"
              }
              style={{ height: `${(step.meters / HIGHEST) * 100}%` }}
            />
          ))}
        </div>
        <div aria-hidden className="flex justify-between text-xs text-neutral-6">
          <span>{m.preview_day_today()}</span>
          <span>{m.preview_day_next()}</span>
        </div>
      </figure>
    </div>
  );
}
