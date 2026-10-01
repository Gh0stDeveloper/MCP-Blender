import Link from "next/link";

import PipelineConsole from "./PipelineConsole";

export const metadata = {
  title: "Production Pipeline | Nexora Forge Cloud",
  description:
    "Provision projects, enroll Blender devices, queue structured jobs and follow human approval.",
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
        <h1>From project setup to an approved Blender asset.</h1>
        <p>
          Bootstrap the control plane, enroll a workstation, queue an allowlisted execution plan,
          then follow the leased job through Blender, preview upload and human approval.
        </p>
      </section>
      <PipelineConsole />
    </main>
  );
}
