import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SearchQueryDto {
  @ApiProperty({ description: 'Search query string' })
  @IsString()
  @IsNotEmpty()
    text: string;
}

