import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { localPreview } from '#/lib/local-preview';

export const Route = createFileRoute("/sign-up/$")({
  component: Page,
});

function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      {localPreview ? <p>Sign-up is unavailable in local preview.</p> : <SignUp />}
    </div>
  );
}
