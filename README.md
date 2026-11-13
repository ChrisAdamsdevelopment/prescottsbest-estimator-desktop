# Prescott's Best Construction — Field Estimator & AI Bridge

## Mac desktop download — November 13, 2026

**For Andrew's Apple Mac**, download the tested-archive installer package at
[Mac release: Prescott's Best Construction (2026-11-13)](https://github.com/ChrisAdamsdevelopment/prescottsbest-estimator-desktop/releases/tag/mac-v2026.11.13).
On the release page, choose the named **`PrescottsBestConstruction-Mac-20261113.zip`** asset
under Assets (not GitHub's auto-generated source archive).

Extract the ZIP, install Node.js 22 LTS, right-click/open `INSTALL_MAC.command`, then double-click
`OPEN_PBC_MAC.command`. Read `docs/ANDREW_MAC_SETUP.md` *inside the Mac ZIP* for
Google/Gmail/Drive/Search Console consent, Apple Keychain and local ChatGPT/MCP configuration.
This Mac package includes the newer D: drive working app features; the repository's ordinary
main-branch ZIP is an older Windows-oriented edition. No API keys, customer records, OAuth
refresh tokens, or Render admin secrets are included. This is an unsigned
macOS source/launcher bundle, not a notarized .app. Live Google/ChatGPT connections
must be authorized on Andrew's computer.


This is the **public installer/source distribution** for the Windows-local Prescott's Best estimator. It includes estimating, optional AI analysis, an MCP tool server, local project planning, photo review, and optional Google Workspace connections.

**This package contains no customer database, API credentials, Google tokens, supplier quotes, or access to the hosted bid portal.** Each operator starts with an independent local workspace.

## Get started on Windows

1. Install [Node.js 22 LTS](https://nodejs.org/en/download) and optionally [Git](https://git-scm.com/downloads/win).
2. Download this repository with **Code → Download ZIP** on GitHub. Extract it to a folder such as `C:\PrescottsBest\Estimator` (don't run from inside ZIP).
3. Double-click `SETUP_ANDREW.bat`. It installs pinned dependencies, builds the app, and runs synthetic tests. It requires no administrator privileges after Node is installed.
4. Double-click `START_AI.bat` and leave that terminal open. On first launch it generates a **private, local** access token. Keep it private.
5. In a second window, double-click `OPEN_ESTIMATOR.bat`. Open `http://127.0.0.1:5173` if it doesn't open automatically.
6. Use the gear or **ChatGPT bridge** page to paste your local access token. Configure personal provider API keys only if desired.
7. Back up your estimates from the app after every working session. Data remains per Windows computer/browser, not shared with other operators by default.

Full walk-through: [ANDREW_SETUP.md](docs/ANDREW_SETUP.md). ChatGPT options: [CHATGPT_CONNECT.md](docs/CHATGPT_CONNECT.md). Google authorization: [GOOGLE_OAUTH.md](docs/GOOGLE_OAUTH.md).

## What it can do

- Concierge/small-job estimates and remodel/cost-plus planning.
- Structured labor/material/subcontract cost lines, sample add-ons, allowances, supplier quote comparisons, schedule scenarios and saved local browser jobs.
- Customer-visible print/PDF preview; project photo and concept library.
- Optional provider-based AI assistance with human review; no model decides final pricing or permit eligibility.
- Local MCP tools via `node scripts/mcp-launch.mjs` for compatible desktop MCP hosts.
- Google account consent, Gmail search/send, Drive `drive.file` project folders, when individually authorized.

## Important limits

**Demo figures are illustrative**, not Prescott's Best approved prices. Verify rates, taxes, permit scope and contractor approval before presenting any quote as binding. The app isn't a multi-user shared cloud system and does not automatically sync Andrew's projects with anybody else's.

**Installing this repository does not automatically connect it to ChatGPT.** Andrew needs to connect his own computer to ChatGPT using Desktop Commander or a configured Secure MCP Tunnel, subject to his ChatGPT account permissions. The local MCP server is stdio-based and not a public HTTPS endpoint.

**Installing this package does not grant Andrew access to the production Render proposal administrative API.** Do not copy anyone else's `PBC_PORTAL_ADMIN_KEY`; issue scoped access once role-based authorization is implemented.

Repository is publicly downloadable for review and installation; no general-purpose open-source license is granted here. Do not upload private credentials or customer information to issues or pull requests.
