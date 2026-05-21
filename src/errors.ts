export class CloudmotionError extends Error {
  public readonly statusCode: number;
  public readonly details: unknown;

  public constructor(message: string, statusCode: number, details: unknown) {
    super(message);
    this.name = 'CloudmotionError';
    this.statusCode = statusCode;
    this.details = details;
  }
}
