/**
 * WI-6 — what the sign-in screen says when something goes wrong.
 *
 * The screen used to show Supabase's raw message. On sign-up that is "User already
 * registered", which tells anyone typing addresses into the form which ones have an
 * account here. Every failure now goes through this one function, which never repeats
 * the server's wording.
 *
 * AN HONEST LIMIT. With email confirmation OFF — as it is on this project, measured
 * 22 Sep 2026 — a new address signs straight in and an existing one must fail, so the
 * two outcomes cannot be made identical by wording alone. This narrows the leak (no
 * "already registered", same copy for a taken address as for any other refusal); only
 * turning confirmation ON closes it, and the create_user_profile trigger (its own
 * migration) is what makes that safe to turn on.
 */

export type AuthMode = 'login' | 'signup' | 'forgot' | 'reset';

/**
 * For NEW passwords only — sign-up and reset. Deliberately not enforced at sign-in:
 * an existing account with an older 6-character password must still be able to log in.
 */
export const MIN_PASSWORD_LENGTH = 10;

export function newPasswordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`;
  }
  return null;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return '';
}

const NETWORK = /failed to fetch|networkerror|load failed|network request failed/i;
const RATE_LIMIT = /rate limit|too many/i;
const PASSWORD = /password/i;

export function describeAuthError(mode: AuthMode, err: unknown): string {
  const msg = messageOf(err);

  if (NETWORK.test(msg)) return 'Could not reach the server. Check your connection and try again.';
  if (RATE_LIMIT.test(msg)) return 'Too many attempts. Wait a minute and try again.';

  switch (mode) {
    case 'login':
      // One answer for every refusal, whether the address exists or not.
      return 'Email or password is incorrect.';
    case 'signup':
      // A server-side password rule (length, or a leaked password once that check is
      // on) is safe to report — it says nothing about who has an account.
      if (PASSWORD.test(msg)) {
        return `That password can't be used. Choose a different one of at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      // "User already registered" lands here, worded exactly like any other refusal.
      return 'We could not create an account with those details. If you already have one, sign in or reset your password.';
    case 'forgot':
      return 'Could not send the reset email. Please try again.';
    case 'reset':
      if (PASSWORD.test(msg)) {
        return `That password can't be used. Choose a different one of at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      return 'Could not update your password. The reset link may have expired — request a new one.';
  }
}
