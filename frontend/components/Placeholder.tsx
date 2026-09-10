type PlaceholderProps = {
  index: string;
  title: string;
  note: string;
};

export function Placeholder({ index, title, note }: PlaceholderProps) {
  return (
    <section className="flex min-h-[52vh] flex-col justify-center py-20">
      <span className="font-mono text-xs uppercase tracking-[0.35em] text-[var(--color-ink-faint)]">
        {index}
      </span>
      <h1 className="mt-4 font-mono text-4xl font-bold tracking-tight text-[var(--color-ink)] md:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-ink-dim)]">{note}</p>
      <div className="mt-8 inline-flex w-fit items-center gap-2 border border-[var(--color-hairline-hi)] px-3 py-1.5">
        <span className="size-1.5 rounded-full bg-[var(--color-warn)]" />
        <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-ink-dim)]">
          Ships in a later task
        </span>
      </div>
    </section>
  );
}
