import Link from "next/link";

import CloudConsole from "./CloudConsole";

export const metadata = {
  title: "Forge Cloud | Nexora Forge",
  description:
    "Multi-agent, multi-model production control plane for Blender teams using Nexora Forge MCP.",
};

export default function CloudPage() {
  return (
    <main className="shell cloudShell">
      <header className="nav">
        <Link className="brand" href="/">
          NEXORA <span>FORGE</span>
        </Link>
        <nav>
          <Link href="/cloud/pipeline">Pipeline</Link>
          <Link href="/dashboard">Gateway</Link>
          <Link href="/">Site</Link>
        </nav>
      </header>

      <section className="cloudHero">
        <div>
          <div className="eyebrow">FORGE CLOUD BETA</div>
          <h1>One project. Multiple agents. Any model.</h1>
          <p>
            Configure a production team where every agent can use a different AI provider.
            The coordinator creates the plan, specialists work in parallel, and the reviewer
            consolidates the final Blender execution sequence.
          </p>
        </div>
        <div className="cloudArchitecture">
          <code>Human team</code>
          <span>→</span>
          <code>Agent team</code>
          <span>→</span>
          <code>Nexora Forge MCP</code>
          <span>→</span>
          <code>Blender devices</code>
        </div>
      </section>

      <CloudConsole />
    </main>
  );
}
