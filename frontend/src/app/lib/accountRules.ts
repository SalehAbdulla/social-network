// The account form rules, shared by the register form and the edit-profile
// dialog so both answer the same way: the same sentences the API returns, checked
// before the request is sent, and one styling for the fields they are typed into.
//
// Every control states its own surface and text colour. Without that a control
// keeps the browser's default background while inheriting the dark theme's light
// text — which is what made a select's value invisible in dark mode.
export const FIELD_CLASS = 'mt-1 w-full rounded-lg border border-border bg-card p-2.5 text-text placeholder:text-muted';
export const LABEL_CLASS = 'block text-sm font-medium text-text';
export const OPTION_CLASS = 'bg-card text-text';

export const PASSWORD_RULE = 'Password must be 12-64 characters long and include at least one letter, one number, and one symbol.';
export const PASSWORD_HINT = 'Use 12-64 characters with at least one letter, one number, and one symbol.';
export const EMAIL_RULE = 'Enter a complete email address, such as you@example.com.';
export const NAME_RULE = 'Names can only contain letters, apostrophes, hyphens and dots — no spaces.';
export const NICKNAME_RULE = 'Use 2-33 letters, numbers, or underscores.';

const EMAIL_PATTERN = /^[a-z0-9._%+'-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/;
const NAME_PATTERN = /^[a-z]+(?:['\-.][a-z]+)*$/i;
const NICKNAME_PATTERN = /^[a-z0-9_]{2,33}$/;

// An empty answer is allowed here; the caller decides whether the field is
// required, so an untouched optional field never reports a problem.
export function emailProblem(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email) return EMAIL_RULE;
  const shaped = EMAIL_PATTERN.test(email) && !email.includes('..') && !email.startsWith('.') && !email.includes('.@');
  return shaped && email.length <= 254 ? '' : EMAIL_RULE;
}

export function nameProblem(value: string): string {
  const name = value.trim().toLowerCase();
  return name.length >= 1 && name.length <= 50 && NAME_PATTERN.test(name) ? '' : NAME_RULE;
}

export function nicknameProblem(value: string): string {
  return NICKNAME_PATTERN.test(value.trim().toLowerCase()) ? '' : NICKNAME_RULE;
}

export function passwordProblem(value: string): string {
  const longEnough = value.length >= 12 && value.length <= 64;
  const hasLetter = /[a-z]/i.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSymbol = /[^a-z0-9]/i.test(value);
  return longEnough && hasLetter && hasNumber && hasSymbol ? '' : PASSWORD_RULE;
}

// The date-of-birth input's own limits, so the register form and the edit dialog
// offer the same range the API enforces: 13 to 100 years old.
export function dateYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().slice(0, 10);
}
