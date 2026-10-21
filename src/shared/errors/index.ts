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
  constructor(message = "Recurso no encontrado", code = "NOT_FOUND") {
    super(message, 404, code);
  }
}

export class RouteNotFoundError extends NotFoundError {
  constructor(message = "Ruta no encontrada") {
    super(message, "ROUTE_NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message = "Datos inválidos") {
    super(message, 400, "INVALID_DATA");
  }
}

export class InvalidResetCodeError extends AppError {
  constructor() {
    super("El código de recuperación es inválido", 400, "INVALID_RESET_CODE");
    this.name = "InvalidResetCodeError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "No autorizado") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class AvatarStorageUnavailableError extends AppError {
  constructor() {
    super("El almacenamiento de avatares no está disponible", 503, "AVATAR_STORAGE_UNAVAILABLE");
    this.name = "AvatarStorageUnavailableError";
  }
}

// --> Maneja el caso donde un usuario autenticado intenta ingresar a un grupo que no pertenece
export class ForbiddenError extends AppError {
  constructor(message = "Acceso denegado") {
    super(message, 403, "FORBIDDEN");
  }
}

export class InvitationNotFoundError extends NotFoundError {
  constructor() {
    super("Invitación no encontrada", "INVITATION_NOT_FOUND");
    this.name = "InvitationNotFoundError";
  }
}

export class InvitationUnavailableError extends NotFoundError {
  constructor() {
    super("Invitación no disponible", "INVITATION_UNAVAILABLE");
    this.name = "InvitationUnavailableError";
  }
}

export class EventUnavailableError extends AppError {
  constructor(message = "El evento no está disponible") {
    super(message, 409, "EVENT_UNAVAILABLE");
    this.name = "EventUnavailableError";
  }
}

export class RegistrationConflictError extends AppError {
  constructor() {
    super("No se pudo crear la cuenta con esos datos", 409, "REGISTRATION_CONFLICT");
    this.name = "RegistrationConflictError";
  }
}

export class FriendshipAlreadyExistsError extends AppError {
  constructor() {
    super(
      "Ya existe una relación de amistad entre estas personas",
      409,
      "FRIENDSHIP_ALREADY_EXISTS",
    );
    this.name = "FriendshipAlreadyExistsError";
  }
}

export class FriendRequestNotFoundError extends NotFoundError {
  constructor() {
    super("Solicitud de amistad no encontrada", "FRIEND_REQUEST_NOT_FOUND");
    this.name = "FriendRequestNotFoundError";
  }
}

export class PendingDebtsError extends AppError {
  constructor() {
    super("No se puede cancelar un evento con deudas pendientes", 409, "PENDING_DEBTS");
    this.name = "PendingDebtsError";
  }
}

export class DebtAlreadySettledError extends AppError {
  constructor() {
    super("La deuda ya fue saldada", 409, "DEBT_ALREADY_SETTLED");
    this.name = "DebtAlreadySettledError";
  }
}

export class ExpensesClosedError extends AppError {
  constructor() {
    super("Los gastos del evento están cerrados", 409, "EXPENSES_CLOSED");
    this.name = "ExpensesClosedError";
  }
}
