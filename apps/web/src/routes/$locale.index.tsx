import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/$locale/")({
  component: LocaleIndex,
});

function LocaleIndex() {
  return <p className="text-text-muted mt-8 text-sm">(Landing page content lands in Phase 3.)</p>;
}
