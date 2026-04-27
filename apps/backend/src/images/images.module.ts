import { Module } from "@nestjs/common";
import { StorageModule } from "../storage/storage.module.js";
import { ImagesController } from "./api/images.controller.js";
import { ImagesService } from "./application/images.service.js";

@Module({
  imports: [StorageModule],
  controllers: [ImagesController],
  providers: [ImagesService]
})
export class ImagesModule {}
