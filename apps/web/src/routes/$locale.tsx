import { Outlet, createFileRoute, notFound } from "@tanstack/react-router";

const SUPPORTED_LOCALES = ["en", "ja"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export const Route = createFileRoute("/$locale")({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) throw notFound();
  },
  component: LocaleLayout,
});

function LocaleLayout() {
  // Marketing chrome (header + locale switch + footer) lands in Phase 3.
  // For Phase 1 we render a minimal placeholder so the routing graph compiles.
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Nuansu</h1>
      <p className="text-text-secondary mt-4">
        Translation copilot — scaffolding ready. Marketing pages land in Phase 3.
      </p>
      <Outlet />
    </main>
  );
}
