# Project Rules & Workflow Instructions

## Local First Testing & Deployment Protocol

1. **NO AUTOMATIC GIT PUSH**:
   - Never push changes (`git push origin main`) automatically to GitHub/production without explicit user testing and approval.
   - Edit files, run local build/type checks (`npm run build`), and make changes available for local user testing first.

2. **LOCAL DEV SERVER PREVIEW**:
   - Always run local dev servers (`npm run dev`) or prompt the user to test locally at `http://localhost:3000` (store) or `http://localhost:3001` (admin) before proposing git push.
