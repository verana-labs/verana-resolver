import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class GetTrustEvaluationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by VPR name' })
  @IsOptional()
  @IsString()
    vprName?: string;
}

