export class AppError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 422,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, 'bad_request', msg, details)
export const unauthorized = (msg = 'Sign in to continue.') => new AppError(401, 'unauthorized', msg)
export const forbidden = (msg = 'You do not have access to that.') => new AppError(403, 'forbidden', msg)
export const notFound = (what = 'Record') => new AppError(404, 'not_found', `${what} not found.`)
export const conflict = (msg: string) => new AppError(409, 'conflict', msg)
export const unprocessable = (msg: string, details?: unknown) => new AppError(422, 'invalid', msg, details)
