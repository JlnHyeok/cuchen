import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString } from "class-validator";

export class SearchRequestDto {
  @IsOptional()
  @IsString()
  bucket?: string;

  @IsOptional()
  @IsString()
  productNo?: string;

  @IsOptional()
  @IsString()
  processCode?: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  aiResult?: string;

  @IsOptional()
  @IsString()
  lotNo?: string;

  @IsOptional()
  @IsString()
  processId?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  productPage?: string;

  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsString()
  capturedAtFrom?: string;

  @IsOptional()
  @IsString()
  capturedAtTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  thresholdMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  thresholdMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  pageSize?: number;
}
