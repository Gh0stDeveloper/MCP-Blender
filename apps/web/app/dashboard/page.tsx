import Link from "next/link";

const tools = [
  "scene_snapshot",
  "create_mesh",
  "create_primitive",
  "create_material",
  "smart_uv_project",
  "create_armature",
  "add_bone",
  "parent_with_auto_weights",
  "keyframe_insert",
  "render_preview",
  "import_asset",
  "export_asset",
  "batch_execute",
];

export default function Dashboard() {
  return (
    <main className="shell dashboard">
      <header className="nav">
        <Link className="brand" href="/">NEXORA <span>FORGE</span></Link>
        <Link href="/">Back to site</Link>
      </header>

      <section className="dashboardHero">
        <div>
          <div className="eyebrow">CONTROL CENTER</div>
          <h1>Local production gateway</h1>
          <p>
            The web shell intentionally does not store your Blender token or bridge secret.
            Runtime connectivity is configured on the workstation.
          </p>
        </div>
        <div className="statusCard"><i/><span>Gateway design</span><b>Local-first</b></div>
      </section>

      <section className="dashboardGrid">
        <article className="panel">
          <span className="panelLabel">MCP endpoint</span>
          <code>https://YOUR-HOST/mcp</code>
          <p>Public HTTPS hostname from Cloudflare Tunnel, ngrok or another trusted ingress.</p>
        </article>
        <article className="panel">
          <span className="panelLabel">Blender bridge</span>
          <code>http://127.0.0.1:9876</code>
          <p>Loopback-only. Never expose this port directly.</p>
        </article>
        <article className="panel full">
          <span className="panelLabel">Structured tool surface</span>
          <div className="toolGrid">
            {tools.map((tool) => <code key={tool}>{tool}</code>)}
          </div>
        </article>
      </section>
    </main>
  );
}
