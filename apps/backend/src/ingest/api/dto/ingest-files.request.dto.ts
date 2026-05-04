import { IsString, MinLength } from "class-validator";

export class IngestFilesRequestDto {
  @IsString()
  @MinLength(1)
  path!: string;

  @IsString()
  @MinLength(1)
  filebase!: string;
}
