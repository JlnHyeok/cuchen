import { IsOptional, IsString } from "class-validator";

export class ScanRequestDto {
  @IsOptional()
  @IsString()
  rootDir?: string;
}
