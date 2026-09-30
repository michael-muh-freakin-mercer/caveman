export function Panel({
  title,
  action,
  children,
  className = "",
  id,
  description,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
  description?: React.ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={`panel ${className}`} aria-labelledby={title ? headingId : undefined} id={id}>
      {title ? (
        <header className="flex items-start justify-between gap-3 border-b-2 border-ink px-5 py-3.5">
          <div>
            <h2 id={headingId} className="text-sm font-bold text-fg">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-ink/40 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-muted">{icon}</div> : null}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {children ? <div className="mt-1.5 max-w-md text-sm text-muted">{children}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  role,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  title: string;
  children?: React.ReactNode;
  role?: "alert" | "status";
}) {
  const styles = {
    info: "border-glacier/30 bg-glacier/5",
    warn: "border-warn/30 bg-warn/5",
    bad: "border-bad/35 bg-bad/5",
    ok: "border-ok/30 bg-ok/5",
  }[tone];
  const titleColor = { info: "text-glacier", warn: "text-warn", bad: "text-bad", ok: "text-ok" }[tone];
  return (
    <div role={role} className={`rounded-xl border px-4 py-3 ${styles}`}>
      <p className={`text-sm font-semibold ${titleColor}`}>{title}</p>
      {children ? <div className="mt-1 text-sm text-fg-soft">{children}</div> : null}
    </div>
  );
}
