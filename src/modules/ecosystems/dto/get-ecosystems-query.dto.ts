import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, Min } from 'class-validator';

export class GetEcosystemsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by DID' })
  @IsOptional()
  @IsString()
    did?: string;

  @ApiPropertyOptional({ description: 'Filter by VPR name' })
  @IsOptional()
  @IsString()
    vprName?: string;

  @ApiPropertyOptional({ description: 'Filter by trust registry DID' })
  @IsOptional()
  @IsString()
    trustRegistryDid?: string;

  @ApiPropertyOptional({ type: Number, default: 10, description: 'Number of results' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
    limit?: number;

  @ApiPropertyOptional({ type: Number, default: 0, description: 'Pagination offset' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
    offset?: number;

  @ApiPropertyOptional({ default: 'createdAt', description: 'Field to sort by' })
  @IsOptional()
  @IsString()
    orderBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC', description: 'Sort direction' })
  @IsOptional()
    order?: 'ASC' | 'DESC';
}

