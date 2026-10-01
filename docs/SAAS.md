# SaaS product path

The repository includes a production-oriented public web shell under apps/web. It is separated from the local control gateway so the public site never needs the Blender bridge secret.

Current foundation:

- SEO metadata, OpenGraph/Twitter metadata and JSON-LD.
- landing page and control-center route.
- local-first architecture messaging.
- Next.js standalone production build.
- no Blender secrets stored in the browser.

A hosted multi-tenant edition can add account authentication, organizations, per-device enrollment keys, OAuth 2.1/OIDC, encrypted device registry, billing entitlements, usage metering, audit retention, signed approval policy, device revocation and optional preview storage.

Those cloud features are not faked in the local edition. The Blender workstation remains the execution worker.
