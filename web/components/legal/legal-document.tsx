import { LEGAL_UPDATED } from "@/lib/legal";

export type LegalSection = {
  id: string;
  title: string;
  body: string[];
  list?: string[];
};

export function LegalDocument({ title, intro, sections }: { title: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8">
      <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
        <p className="eyebrow text-muted">Legal</p>
        <ul className="mt-4 space-y-2 text-sm">
          {sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="text-fg-soft hover:text-fg">
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-3xl">
        <h1 className="display text-balance text-2xl leading-tight text-fg sm:text-3xl">{title}</h1>
        <p className="mt-3 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 text-lg text-fg-soft">{intro}</p>
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24 border-t border-line pt-10 mt-10">
            <h2 className="text-2xl font-semibold text-fg">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph.slice(0, 32)} className="mt-4 leading-relaxed text-fg-soft">
                {paragraph}
              </p>
            ))}
            {section.list ? (
              <ul className="mt-4 list-disc space-y-2 pl-6 leading-relaxed text-fg-soft">
                {section.list.map((item) => (
                  <li key={item.slice(0, 32)}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>
    </div>
  );
}
