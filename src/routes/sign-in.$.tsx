import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { localPreview } from '#/lib/local-preview';

export const Route = createFileRoute("/sign-in/$")({
  component: Page,
});

function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {localPreview ? <p>Sign-in is unavailable in local preview.</p> : <SignIn />}
    </div>
  );
}
