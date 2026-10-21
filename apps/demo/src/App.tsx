import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EditorSkeleton } from "@syncscribe/editor/ui";
import { DemoBanner } from "./components/DemoBanner";
import { DocumentListPage } from "./components/DocumentListPage";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { DemoProvider } from "./demo-context";
import { LIST_HREF, parseRoute } from "./lib/route";

// The editor, ProseMirror and Yjs are most of the bundle, so the list page loads without them.
const DocumentPage = lazy(() => import("./components/DocumentPage"));

export function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <DemoProvider>
      {/* A plain #main link would change the hash route, so the skip link moves focus itself. */}
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <DemoBanner />
      <SiteHeader />
      <main id="main" ref={mainRef} tabIndex={-1} className="outline-none">
        {route.name === "list" ? (
          <DocumentListPage />
        ) : route.name === "doc" ? (
          <Suspense
            fallback={
              <div className="mx-auto max-w-4xl px-4 py-6">
                <EditorSkeleton />
              </div>
            }
          >
            <DocumentPage docId={route.docId} role={route.role} />
          </Suspense>
        ) : (
          <div className="mx-auto max-w-4xl px-4 py-10">
            <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
            <p className="mt-2 text-ink-muted">
              <a href={LIST_HREF} className="text-accent underline">
                Back to your documents
              </a>
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </DemoProvider>
  );
}
