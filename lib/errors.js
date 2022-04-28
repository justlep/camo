
/**
 * Error indicating document didn't pass validation.
 */
export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        Error.captureStackTrace(this, ValidationError);
    }
}
