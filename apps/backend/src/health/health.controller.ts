import { Controller, Get } from "@nestjs/common";
import { loadAppConfig } from "../common/config/app-config.js";

@Controller()
export class HealthController {
  private readonly config = loadAppConfig();

  @Get("health")
  health() {
    return {
      ok: true,
      storageMode: this.config.storageMode,
      ingestRootDir: this.config.ingestRootDir,
      minioEndpoint: this.config.minioEndpoint,
      bucket: this.config.minioBucket
    };
  }
}
