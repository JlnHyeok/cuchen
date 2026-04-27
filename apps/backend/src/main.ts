import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadAppConfig } from "./common/config/app-config.js";

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();
  // eslint-disable-next-line no-console
  console.log(
    `[backend] boot storageMode=${config.storageMode} mongoDb=${config.mongoDbName} minioBucket=${config.minioBucket}`
  );
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn", "log"] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true }
    })
  );
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true
  });

  await app.listen(config.port, config.host);
  const url = await app.getUrl();
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on ${url}`);
}

void bootstrap();
