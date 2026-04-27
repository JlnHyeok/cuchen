import { Injectable } from "@nestjs/common";

@Injectable()
export class FolderWatcherService {
  private enabled = true;

  getStatus() {
    return {
      enabled: this.enabled
    };
  }
}
