import { Logo } from "@/components/brand/logo";

export function AuthShell({ title, subtitle, pendingPrompt, children }: { title: string; subtitle: string; pendingPrompt: string | null; children: React.ReactNode }) {
  return (
    <div className="stone relative flex min-h-dvh flex-col">
      <div aria-hidden="true" className="hairline-grid absolute inset-0 -z-10" />
      <header className="mx-auto flex h-16 w-full max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        <Logo />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 pb-20 pt-6">
        <div className="w-full max-w-md">
          <h1 className="text-center text-3xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-3 text-center text-sm text-muted">{subtitle}</p>
          {pendingPrompt ? (
            <div className="mt-6 rounded-xl border border-ember/30 bg-ember/5 px-4 py-3" data-testid="pending-prompt">
              <p className="eyebrow text-[0.62rem] text-ember">Your build request is saved</p>
              <p className="mt-1.5 line-clamp-3 text-sm text-fg">“{pendingPrompt}”</p>
            </div>
          ) : null}
          <div className="panel mt-6 p-6 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
