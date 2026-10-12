import axios from 'axios';

// The HTTP statuses the app treats as control flow rather than as text: a 401
// ends the session, a 404 means the resource is missing — which is what lets a
// page render the one not-found surface instead of an inline error. They live on
// their own, with no other app imports, so they can be unit tested directly.
export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

export function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}
