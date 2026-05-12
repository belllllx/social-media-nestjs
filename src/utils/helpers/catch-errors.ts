import { HttpException, Logger } from "@nestjs/common";

export function catchErrors(error: unknown, logger: Logger) {
  if (error instanceof HttpException) {
    const status = error.getStatus();

    if (status >= 500) {
      logger.error(error.message, error.stack);
    } else {
      logger.warn(error.message);
    }

    throw error;
  }

  if (error instanceof Error) {
    logger.error(error.message, error.stack);
  } else {
    logger.error('Unknown error', JSON.stringify(error));
  }
}