import Link from "next/link";

import ReviewConsole from "./ReviewConsole";

export const metadata = {
  title: "Human Review | Nexora Forge Cloud",
  description: "Review Blender previews and artifacts before publishing asset versions.",
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return (
    <main className="shell cloudShell">
      <header className="nav">
        <Link className="brand" href="/">
          NEXORA <span>FORGE</span>
        </Link>
        <nav>
          <Link href="/cloud">Forge Cloud</Link>
          <Link href="/dashboard">Gateway</Link>
        </nav>
      </header>
      <section className="reviewHero">
        <div className="eyebrow">HUMAN APPROVAL GATE</div>
        <h1>Review before the asset becomes a version.</h1>
        <p>
          Device Agent results remain unpublished until a reviewer approves them. Rejection closes
          the job; requesting changes returns it to the device queue.
        </p>
      </section>
      <ReviewConsole jobId={jobId} />
    </main>
  );
}
