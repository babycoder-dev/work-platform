export interface FilesClock {
  now(): Date;
}

export const FILES_CLOCK = Symbol.for('FILES_CLOCK');

export class SystemFilesClock implements FilesClock {
  now(): Date {
    return new Date();
  }
}
