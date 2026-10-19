import { buildApp } from './app';

const app = buildApp();
const port = Number(process.env.PORT ?? 4000);

app.listen({ port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('Failed to start backend server:', err);
    process.exit(1);
  }
  console.log(`🚀 Orion Backend server listening at ${address}`);
});
