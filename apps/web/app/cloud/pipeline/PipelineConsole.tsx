"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Workspace = {
  actor: { kind: string; userId?: string; role: string };
  organization: { id: string; name: string; slug: string } | null;
  projects: Array<{ id: string; name: string; slug: string }>;
  assets: Array<{ id: string; project_id: string; name: string; asset_type: string }>;
  devices: Array<{
    id: string;
    owner_user_id: string;
    name: string;
    status: string;
    blender_version: string | null;
    agent_version: string | null;
    last_seen_at: string | null;
  }>;
  members: Array<{
    user_id: string;
    role: string;
    display_name: string | null;
  }>;
};

const examplePlan = JSON.stringify(
  [
    {
      operation: "object.create_primitive",
      params: { kind: "cube", name: "ForgeCube", location: [0, 0, 0], size: 2 },
    },
    {
      operation: "material.create",
      params: {
        name: "ForgeMaterial",
        base_color: [0.12, 0.24, 0.5, 1],
        metallic: 0.35,
        roughness: 0.28,
      },
    },
    {
      operation: "material.assign",
      params: { object_name: "ForgeCube", material_name: "ForgeMaterial" },
    },
    {
      operation: "camera.create",
      params: {
        name: "ReviewCamera",
        location: [6, -6, 4.5],
        rotation: [1.1, 0, 0.78],
        lens_mm: 50,
        make_active: true,
      },
    },
    {
      operation: "light.create",
      params: {
        name: "ReviewKey",
        light_type: "AREA",
        energy: 1400,
        location: [4, -3, 6],
      },
    },
  ],
  null,
  2,
);

export default function PipelineConsole() {
  const [token, setToken] = useState("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projectId, setProjectId] = useState("");
  const [assetId, setAssetId] = useState("");
  const [task, setTask] = useState("Build the queued asset and prepare it for human review.");
  const [plan, setPlan] = useState(examplePlan);
  const [jobId, setJobId] = useState("");
  const [jobState, setJobState] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpires, setPairingExpires] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("artist");
  const [memberPairing, setMemberPairing] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const projectAssets = useMemo(
    () => workspace?.assets.filter((asset) => asset.project_id === projectId) ?? [],
    [workspace, projectId],
  );
  const canManageMembers =
    workspace?.actor.role === "owner" || workspace?.actor.role === "admin";

  async function api(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(path, { ...init, headers, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
    return payload;
  }

  async function loadWorkspace() {
    setBusy(true);
    setMessage("");
    try {
      const result = (await api("/api/cloud/me")) as Workspace;
      setWorkspace(result);
      const firstProject = result.projects[0]?.id ?? "";
      setProjectId((current) =>
        current && result.projects.some((project) => project.id === current)
          ? current
          : firstProject,
      );
      setMessage("Private workspace loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load workspace");
    } finally {
      setBusy(false);
    }
  }

  async function createMyPairingCode() {
    setBusy(true);
    setMessage("");
    try {
      const result = (await api("/api/cloud/pairing", {
        method: "POST",
        body: JSON.stringify({ ttlSeconds: 900 }),
      })) as { code: string; expiresAt: string };
      setPairingCode(result.code);
      setPairingExpires(result.expiresAt);
      setMessage("One-time device pairing code created.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create pairing code");
    } finally {
      setBusy(false);
    }
  }

  async function addMember() {
    if (!memberName.trim()) {
      setMessage("Member name is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    setMemberPairing("");
    try {
      const member = (await api("/api/cloud/team/members", {
        method: "POST",
        body: JSON.stringify({ displayName: memberName, role: memberRole }),
      })) as { userId: string; role: string };
      const pair = (await api("/api/cloud/pairing", {
        method: "POST",
        body: JSON.stringify({ ownerUserId: member.userId, ttlSeconds: 900 }),
      })) as { code: string; expiresAt: string };
      setMemberPairing(pair.code);
      setMessage(`${memberName} is ready to join as ${member.role}.`);
      await loadWorkspace();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add member");
    } finally {
      setBusy(false);
    }
  }

  async function enqueue() {
    if (!projectId) {
      setMessage("Select a project first.");
      return;
    }
    let executionPlan: unknown;
    try {
      executionPlan = JSON.parse(plan);
    } catch {
      setMessage("Execution plan is not valid JSON.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const result = (await api("/api/cloud/jobs", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          assetId: assetId || null,
          task,
          executionPlan,
          requireApproval: true,
        }),
      })) as { jobId: string };
      setJobId(result.jobId);
      setMessage("Job queued for an eligible Blender workstation.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Job enqueue failed");
    } finally {
      setBusy(false);
    }
  }

  async function refreshJob() {
    if (!jobId) return;
    setBusy(true);
    try {
      const result = await api(`/api/cloud/jobs/${jobId}`);
      setJobState(JSON.stringify(result, null, 2));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh job");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pipelineConsole">
      <article className="panel pipelineStep">
        <span className="panelLabel">01 · PRIVATE WORKSPACE</span>
        <label>
          Member / owner token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="nfu_..."
          />
        </label>
        <button className="forgeButton" disabled={busy || !token} onClick={loadWorkspace}>
          Load my workspace
        </button>
        {workspace?.organization ? (
          <div className="reviewMeta">
            <div><span>Team</span><strong>{workspace.organization.name}</strong></div>
            <div><span>Role</span><strong>{workspace.actor.role}</strong></div>
            <div><span>Projects</span><strong>{workspace.projects.length}</strong></div>
            <div><span>Devices</span><strong>{workspace.devices.length}</strong></div>
          </div>
        ) : null}
      </article>

      <article className="panel pipelineStep">
        <span className="panelLabel">02 · PAIR A BLENDER DEVICE</span>
        <p>Create a short-lived code for another Blender workstation owned by this member.</p>
        <button className="forgeButton" disabled={busy || !workspace} onClick={createMyPairingCode}>
          Create pairing code
        </button>
        {pairingCode ? (
          <div className="deviceSecret">
            <strong>{pairingCode}</strong>
            <p>Expires: {pairingExpires}</p>
            <code>nexora-forge setup --mode join-team --server &lt;TEAM_URL&gt; --code {pairingCode}</code>
          </div>
        ) : null}
      </article>

      {canManageMembers ? (
        <article className="panel pipelineStep pipelineWide">
          <span className="panelLabel">03 · TEAM MEMBERS</span>
          <div className="teamMemberForm">
            <label>
              Member name
              <input value={memberName} onChange={(event) => setMemberName(event.target.value)} />
            </label>
            <label>
              Role
              <select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                <option value="admin">Admin</option>
                <option value="lead">Lead</option>
                <option value="artist">Artist</option>
                <option value="reviewer">Reviewer</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
          </div>
          <button className="secondaryButton" disabled={busy} onClick={addMember}>
            Add member & create setup code
          </button>
          {memberPairing ? (
            <div className="deviceSecret">
              <strong>Send only this one-time code to the member</strong>
              <code>{memberPairing}</code>
            </div>
          ) : null}
          {workspace?.members.length ? (
            <div className="memberList">
              {workspace.members.map((member) => (
                <span key={member.user_id}>
                  {member.display_name ?? member.user_id} · {member.role}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ) : null}

      <article className="panel pipelineStep pipelineWide">
        <span className="panelLabel">04 · STRUCTURED BLENDER JOB</span>
        <div className="teamMemberForm">
          <label>
            Project
            <select
              value={projectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setAssetId("");
              }}
            >
              <option value="">Select project</option>
              {workspace?.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label>
            Asset
            <select value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="">No specific asset</option>
              {projectAssets.map((asset) => (
                <option key={asset.id} value={asset.id}>{asset.name}</option>
              ))}
            </select>
          </label>
        </div>
        <label>Task<input value={task} onChange={(event) => setTask(event.target.value)} /></label>
        <label>
          Execution plan
          <textarea rows={18} value={plan} onChange={(event) => setPlan(event.target.value)} />
        </label>
        <button className="forgeButton" disabled={busy || !workspace || !projectId} onClick={enqueue}>
          Queue job
        </button>
      </article>

      <article className="panel pipelineStep pipelineWide">
        <span className="panelLabel">05 · LEASE → BLENDER → PREVIEW → REVIEW</span>
        {jobId ? (
          <>
            <code className="jobId">{jobId}</code>
            <div className="pipelineActions">
              <button className="secondaryButton" disabled={busy} onClick={refreshJob}>Refresh job</button>
              <Link className="secondaryButton" href={`/cloud/review/${jobId}`}>Open human review</Link>
            </div>
          </>
        ) : (
          <p>Queue a job to obtain its review URL.</p>
        )}
        {jobState ? <pre>{jobState}</pre> : null}
        {message ? <p className="reviewMessage">{message}</p> : null}
      </article>
    </section>
  );
}
