"use client";

import Link from "next/link";
import { useState } from "react";

type BootstrapResult = {
  organizationId: string;
  projectId: string;
  assetId: string | null;
};

type EnrollResult = {
  deviceId: string;
  enrollmentPublicId: string;
  token: string;
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
  const [cloudToken, setCloudToken] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [organizationName, setOrganizationName] = useState("Nexora Studio");
  const [projectName, setProjectName] = useState("Game Production");
  const [assetName, setAssetName] = useState("Forge Demo Asset");
  const [bootstrap, setBootstrap] = useState<BootstrapResult | null>(null);
  const [deviceName, setDeviceName] = useState("Blender Workstation");
  const [device, setDevice] = useState<EnrollResult | null>(null);
  const [plan, setPlan] = useState(examplePlan);
  const [task, setTask] = useState("Build the queued asset and prepare it for human review.");
  const [jobId, setJobId] = useState("");
  const [jobState, setJobState] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const authHeaders = cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {};

  function ensureOwnerId() {
    if (!ownerUserId) {
      setOwnerUserId(crypto.randomUUID());
    }
  }

  async function api(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...authHeaders,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
    return payload;
  }

  async function bootstrapProject() {
    setBusy(true);
    setMessage("");
    try {
      const userId = ownerUserId || crypto.randomUUID();
      setOwnerUserId(userId);
      const result = (await api("/api/cloud/bootstrap", {
        method: "POST",
        body: JSON.stringify({
          ownerUserId: userId,
          organizationName,
          projectName,
          assetName,
          assetType: "demo",
        }),
      })) as BootstrapResult;
      setBootstrap(result);
      setMessage("Workspace, project and asset are ready.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bootstrap failed");
    } finally {
      setBusy(false);
    }
  }

  async function enroll() {
    if (!bootstrap) {
      setMessage("Bootstrap the project first.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = (await api("/api/cloud/devices/enroll", {
        method: "POST",
        body: JSON.stringify({
          organizationId: bootstrap.organizationId,
          ownerUserId,
          name: deviceName,
        }),
      })) as EnrollResult;
      setDevice(result);
      setMessage("Device enrolled. Save the device token now; it is returned only at enrollment.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Enrollment failed");
    } finally {
      setBusy(false);
    }
  }

  async function enqueue() {
    if (!bootstrap) {
      setMessage("Bootstrap the project first.");
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
          projectId: bootstrap.projectId,
          requestedBy: ownerUserId,
          assetId: bootstrap.assetId,
          targetDeviceId: device?.deviceId ?? null,
          task,
          executionPlan,
          requireApproval: true,
        }),
      })) as { jobId: string };
      setJobId(result.jobId);
      setMessage("Job queued. Start the Device Agent on the enrolled workstation.");
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
        <span className="panelLabel">01 · CONTROL PLANE</span>
        <label>
          Cloud API token
          <input type="password" value={cloudToken} onChange={(e) => setCloudToken(e.target.value)} />
        </label>
        <label>
          Owner user UUID
          <div className="inlineField">
            <input value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} />
            <button type="button" onClick={ensureOwnerId}>Generate</button>
          </div>
        </label>
        <label>Organization<input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} /></label>
        <label>Project<input value={projectName} onChange={(e) => setProjectName(e.target.value)} /></label>
        <label>Initial asset<input value={assetName} onChange={(e) => setAssetName(e.target.value)} /></label>
        <button className="forgeButton" disabled={busy} onClick={bootstrapProject}>Bootstrap project</button>
        {bootstrap ? <pre>{JSON.stringify(bootstrap, null, 2)}</pre> : null}
      </article>

      <article className="panel pipelineStep">
        <span className="panelLabel">02 · DEVICE ENROLLMENT</span>
        <label>Device name<input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} /></label>
        <button className="forgeButton" disabled={busy || !bootstrap} onClick={enroll}>Enroll Blender workstation</button>
        {device ? (
          <div className="deviceSecret">
            <strong>Save this token once</strong>
            <code>{device.token}</code>
            <p>Set it as <code>NEXORA_DEVICE_TOKEN</code> on the workstation.</p>
          </div>
        ) : null}
      </article>

      <article className="panel pipelineStep pipelineWide">
        <span className="panelLabel">03 · STRUCTURED BLENDER JOB</span>
        <label>Task<input value={task} onChange={(e) => setTask(e.target.value)} /></label>
        <label>
          Execution plan
          <textarea rows={18} value={plan} onChange={(e) => setPlan(e.target.value)} />
        </label>
        <button className="forgeButton" disabled={busy || !bootstrap} onClick={enqueue}>Queue job</button>
      </article>

      <article className="panel pipelineStep pipelineWide">
        <span className="panelLabel">04 · LEASE → BLENDER → PREVIEW → REVIEW</span>
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
