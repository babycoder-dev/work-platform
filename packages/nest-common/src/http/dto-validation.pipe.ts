import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';

export interface DtoType<T extends object> {
  new (): T;
}

export function dtoValidationPipe<T extends object>(dtoType: DtoType<T>): PipeTransform<unknown, T> {
  return new ExplicitDtoValidationPipe(dtoType);
}

class ExplicitDtoValidationPipe<T extends object> implements PipeTransform<unknown, T> {
  constructor(private readonly dtoType: DtoType<T>) {}

  transform(value: unknown): T {
    const plainValue = value && typeof value === 'object' ? value : {};
    const instance = plainToInstance(this.dtoType, plainValue);
    const errors = validateSync(instance, {
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
      whitelist: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException(flattenValidationErrors(errors));
    }

    return instance;
  }
}

function flattenValidationErrors(errors: ValidationError[], parentPath = ''): string[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const messages = error.constraints ? Object.values(error.constraints) : [];
    const childMessages = error.children?.length ? flattenValidationErrors(error.children, path) : [];

    return [...messages, ...childMessages];
  });
}
