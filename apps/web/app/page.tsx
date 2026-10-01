import Link from "next/link";

const capabilities = [
  "Characters & creatures",
  "Rigging & auto weights",
  "Animations & emotes",
  "Weapons & game props",
  "Zombies & enemies",
  "Lobbies & environments",
  "Materials, skins & UVs",
  "Rendering & previews",
];

const workflow = [
  ["01", "Plan", "The AI inspects the active Blender scene before editing."],
  ["02", "Build", "Typed MCP tools create geometry, materials, rigs and animation."],
  ["03", "Iterate", "Batch operations keep multi-step generation fast and traceable."],
  ["04", "Deliver", "Assets export to GLB, glTF, FBX, OBJ or STL inside the workspace."],
];

export default function Home() {
  const diagram = "AI Client\n   ↓  HTTPS / MCP\nCloudflare or ngrok\n   ↓\nGateway :8765  ── audit + auth + policy\n   ↓  localhost\nBlender Bridge :9876\n   ↓\nbpy / scene / render / export";
  return (
    <main>
      <header className="nav shell">
        <Link className="brand" href="/">NEXORA <span>FORGE</span></Link>
        <nav>
          <a href="#capabilities">Capabilities</a>
          <Link href="/cloud">Cloud</Link>
          <a href="#security">Security</a>
          <a href="#credits">Credits</a>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      </header>

      <section className="hero shell">
        <div className="eyebrow">MCP × BLENDER × AI</div>
        <h1>Turn intent into <em>production-ready 3D workflows.</em></h1>
        <p>
          Nexora Forge MCP gives AI systems a secure, structured control plane for Blender:
          modeling, rigging, animation, game assets, environments and controlled Python automation.
        </p>
        <div className="actions">
          <a className="primary" href="https://github.com/Gh0stDeveloper/MCP-Blender">View repository</a>
          <Link className="secondary" href="/dashboard">Open control center</Link>
        </div>
        <div className="terminal">
          <div className="terminalTop"><i/><i/><i/><span>nexora-forge-mcp</span></div>
          <pre><code>{diagram}</code></pre>
        </div>
      </section>

      <section id="capabilities" className="section shell">
        <div className="sectionTitle">
          <span>Built for game production</span>
          <h2>One control surface. Full Blender workflows.</h2>
        </div>
        <div className="grid">
          {capabilities.map((item) => <article className="card" key={item}><b>{item}</b><p>Structured tools plus auditable batch execution.</p></article>)}
        </div>
      </section>

      <section className="section shell">
        <div className="sectionTitle">
          <span>Pipeline</span>
          <h2>Designed for iterative AI work.</h2>
        </div>
        <div className="workflow">
          {workflow.map(([n, title, text]) => (
            <article key={n}><small>{n}</small><h3>{title}</h3><p>{text}</p></article>
          ))}
        </div>
      </section>

      <section id="security" className="security shell">
        <div>
          <span className="pill">LOCAL-FIRST SECURITY</span>
          <h2>Blender never listens on a public interface.</h2>
        </div>
        <p>
          The bridge is fixed to 127.0.0.1. Public access terminates at the MCP gateway with
          Bearer authentication, host/origin allowlists, a separate bridge secret, workspace
          path confinement, audit logs and an explicit unrestricted-mode gate.
        </p>
      </section>

      <section id="credits" className="credits shell">
        <div>
          <span className="pill">PROJECT & CONTACT</span>
          <h2>Built and maintained by Ghost Developer.</h2>
          <p>
            Open-source development, Blender automation and AI-native production workflows.
          </p>
        </div>
        <div className="creditLinks">
          <a href="https://github.com/Gh0stDeveloper" target="_blank" rel="noreferrer">
            <span>Owner</span><strong>Ghost Developer</strong>
          </a>
          <a href="https://github.com/Gh0stDeveloper/MCP-Blender" target="_blank" rel="noreferrer">
            <span>Source</span><strong>GitHub repository</strong>
          </a>
          <a href="mailto:ghostnexora@gmail.com">
            <span>Email</span><strong>ghostnexora@gmail.com</strong>
          </a>
          <a href="https://t.me/Gh0stDeveloper" target="_blank" rel="noreferrer">
            <span>Telegram</span><strong>@Gh0stDeveloper</strong>
          </a>
        </div>
      </section>

      <footer className="shell">
        <div className="brand">NEXORA <span>FORGE</span></div>
        <div className="footerLinks">
          <Link href="/cloud">Forge Cloud</Link>
          <Link href="/cloud/pipeline">Pipeline</Link>
          <a href="https://github.com/Gh0stDeveloper/MCP-Blender">GitHub</a>
        </div>
      </footer>
    </main>
  );
}
