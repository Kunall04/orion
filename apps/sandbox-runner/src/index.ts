import { buildApp } from './app';

const app = buildApp();
const port = Number(process.env.PORT ?? 5000);

app.listen({ port, host: process.env.HOST ?? '127.0.0.1' }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
