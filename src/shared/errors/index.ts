// Manejo centralziado de errores que specifica el tipo de error para que el middleware sepa que retornar

export class AppError extends Error {
  public readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code = "INTERNAL_SERVER_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, 404, "ROUTE_NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message = "Datos inválidos") {
    super(message, 400, "INVALID_DATA");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "No autorizado") {
    super(message, 401, "UNAUTHORIZED");
  }
}
