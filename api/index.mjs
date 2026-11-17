// Vercel serverless function: every /api/* request is rewritten here and
// handled by the bundled Express app (built by artifacts/api-server/build.mjs).
import app from "../artifacts/api-server/dist/vercel.mjs";

export default app;
