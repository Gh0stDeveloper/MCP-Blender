import Link from "next/link";

import PipelineConsole from "./PipelineConsole";

export const metadata = {
  title: "Production Pipeline | Nexora Forge Cloud",
  description:
    "Manage a private team workspace, pair Blender workstations, queue jobs and review results.",
};

export default function PipelinePage() {
  return (
    <main className="shell cloudShell">
      <header className="nav">
        <Link className="brand" href="/">
          NEXORA <span>FORGE</span>
        </Link>
        <nav>
          <Link href="/cloud">Agents</Link>
          <Link href="/dashboard">Gateway</Link>
        </nav>
      </header>
      <section className="reviewHero">
        <div className="eyebrow">PRODUCTION PIPELINE</div>
        <h1>Private team production without manual IDs.</h1>
        <p>
          Load your member workspace, pair Blender workstations with one-time codes, queue an
          allowlisted execution plan, then follow the leased job through preview and human approval.
        </p>
      </section>
      <PipelineConsole />
    </main>
  );
}
