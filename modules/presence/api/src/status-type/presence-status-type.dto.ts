import { IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreatePresenceStatusTypeDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{1,63}$/)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdatePresenceStatusTypeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
