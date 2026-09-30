export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line px-4 py-6 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-8">
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow text-muted">{eyebrow}</p> : null}
        <h1 className="mt-2 truncate text-2xl font-extrabold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {description ? <div className="mt-2 max-w-3xl text-sm text-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
