import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, IsEnum, Min } from 'class-validator';

export class GetServicesQueryDto {
  @ApiPropertyOptional({ description: 'Filter by DID' })
  @IsOptional()
  @IsString()
    did?: string;

  @ApiPropertyOptional({ description: 'Filter by VPR name' })
  @IsOptional()
  @IsString()
    vprName?: string;

  @ApiPropertyOptional({ enum: ['trusted', 'partially_trusted', 'untrusted'], description: 'Filter by trust status' })
  @IsOptional()
  @IsEnum(['trusted', 'partially_trusted', 'untrusted'])
    trustStatus?: string;

  @ApiPropertyOptional({ description: 'Filter by location' })
  @IsOptional()
  @IsString()
    location?: string;

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
  @IsEnum(['ASC', 'DESC'])
    order?: 'ASC' | 'DESC';
}

