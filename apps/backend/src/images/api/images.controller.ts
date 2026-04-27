import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { pipeline } from "node:stream/promises";
import { ImagesService } from "../application/images.service.js";

@Controller("images")
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get("buckets")
  async buckets() {
    return { buckets: await this.imagesService.listBuckets() };
  }

  @Get(":imageId/metadata")
  async metadata(@Param("imageId") imageId: string) {
    return this.imagesService.getMetadata(imageId);
  }

  @Get(":imageId")
  async detail(@Param("imageId") imageId: string) {
    return this.imagesService.getDetail(imageId);
  }

  @Get(":imageId/blob")
  async blob(@Param("imageId") imageId: string, @Res() response: Response): Promise<void> {
    const blob = await this.imagesService.getBlob(imageId);
    response.setHeader("Content-Type", blob.contentType);
    await pipeline(blob.stream, response);
  }

  @Get(":imageId/thumbnail")
  async thumbnail(@Param("imageId") imageId: string, @Res() response: Response): Promise<void> {
    const thumbnail = await this.imagesService.getThumbnail(imageId);
    response.setHeader("Content-Type", thumbnail.contentType);
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    await pipeline(thumbnail.stream, response);
  }

  @Get(":imageId/download")
  async download(@Param("imageId") imageId: string, @Res() response: Response): Promise<void> {
    const blob = await this.imagesService.getBlob(imageId);
    response.setHeader("Content-Type", blob.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${imageId}"`);
    await pipeline(blob.stream, response);
  }
}
