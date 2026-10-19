import { buildApp } from './app';

const app = buildApp({
  workDir: process.env.WORKSPACE_DIR,
});
const port = Number(process.env.PORT ?? 5000);

app.listen({ port, host: process.env.HOST ?? '127.0.0.1' }, (err, address) => {
  if (err) {
    console.error('Failed to start sandbox runner:', err);
    process.exit(1);
  }
  console.log(`📦 Orion Sandbox Runner listening at ${address}`);
});
