import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsOptional, IsString, IsInt, IsBoolean, Min } from 'class-validator';

export class GetCredentialsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by schema ID' })
  @IsOptional()
  @IsString()
    schemaId?: string;

  @ApiPropertyOptional({ description: 'Filter by VPR name' })
  @IsOptional()
  @IsString()
    vprName?: string;

  @ApiPropertyOptional({ description: 'Filter by issuer DID' })
  @IsOptional()
  @IsString()
    issuerDid?: string;

  @ApiPropertyOptional({ description: 'Filter by subject DID' })
  @IsOptional()
  @IsString()
    subjectDid?: string;

  @ApiPropertyOptional({ type: Boolean, description: 'Filter by validity status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
    valid?: boolean;

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

