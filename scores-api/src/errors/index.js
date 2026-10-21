class AppError extends Error {
  constructor(message, status = 500, code = null, details = null) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.statusCode = status
    this.code = code
    this.details = details
    this.isOperational = true
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Solicitud inválida', code = 'BAD_REQUEST', details = null) {
    super(message, 400, code, details)
  }
}

class ValidationError extends AppError {
  constructor(message = 'Error de validación', code = 'VALIDATION_ERROR', details = null) {
    super(message, 400, code, details)
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado', code = 'UNAUTHORIZED', details = null) {
    super(message, 401, code, details)
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado', code = 'FORBIDDEN', details = null) {
    super(message, 403, code, details)
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado', code = 'NOT_FOUND', details = null) {
    super(message, 404, code, details)
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflicto de recursos', code = 'CONFLICT', details = null) {
    super(message, 409, code, details)
  }
}

class ServiceUnavailableError extends AppError {
  constructor(message = 'Servicio no disponible temporalmente', code = 'SERVICE_UNAVAILABLE', details = null) {
    super(message, 503, code, details)
  }
}

module.exports = {
  AppError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
}
