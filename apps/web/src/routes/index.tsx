import { createFileRoute, redirect } from "@tanstack/react-router";

// Root path redirects to default locale; the bilingual marketing pages live
// under /[locale]/. This is the v1 default; runtime locale detection added
// later in the marketing layout.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/$locale", params: { locale: "en" } });
  },
});
