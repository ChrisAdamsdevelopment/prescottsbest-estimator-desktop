# Andrew's Windows Installation Guide

Use a dedicated work Windows account and keep the PC updated. This distribution contains source code and batch starters, not an installer signed by Microsoft.

## Steps
1. Download ZIP from the public GitHub repository, extract to `C:\PrescottsBest\Estimator`, and run `SETUP_ANDREW.bat`. Requires Node 20+ (22 recommended).
2. Launch `START_AI.bat`, leaving its terminal window open. On first launch it generates a **new local token**; treat it like a password.
3. Launch `OPEN_ESTIMATOR.bat` in a second window. Open `http://127.0.0.1:5173` in Chrome or Edge.
4. In the app's ChatGPT bridge/AI settings, enter **your own local token**. Configure your own model providers only if needed; some API requests incur charges.
5. Create a synthetic estimate, test the cost-plus settings and run the app's JSON backup export. Each PC/browser has its own data.
6. Connect ChatGPT using Desktop Commander or private MCP Tunnel as documented in `CHATGPT_CONNECT.md`.
7. Connect your Google account only after the proper OAuth test-user approval and client configuration in `GOOGLE_OAUTH.md`.

## Important
You do **not** automatically inherit the other computer's estimates, Gmail/Drive permissions, data or API keys. Do not copy another user's `.env`, Google token files or master Render admin key. A shared role-based backend and secure cross-device sync are separate projects.

Test pricing examples are **not** approved Prescott's Best bids. Verify scope, labor rates, fees, sales tax, permit requirements and the final contractor-approved proposal before issuing to customers.
