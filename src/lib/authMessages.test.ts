import { describe, it, expect } from 'vitest';
import { describeAuthError, newPasswordProblem, MIN_PASSWORD_LENGTH } from './authMessages';

const err = (message: string) => Object.assign(new Error(message), { name: 'AuthApiError' });

describe('describeAuthError — WI-6', () => {
  it('never repeats "already registered" on sign-up', () => {
    const shown = describeAuthError('signup', err('User already registered'));
    expect(shown).not.toMatch(/already registered|exists/i);
  });

  it('words a taken address exactly like any other sign-up refusal', () => {
    expect(describeAuthError('signup', err('User already registered'))).toBe(
      describeAuthError('signup', err('Signups not allowed for this instance'))
    );
  });

  it('gives one answer at sign-in whatever the server said', () => {
    const a = describeAuthError('login', err('Invalid login credentials'));
    const b = describeAuthError('login', err('Email not confirmed'));
    const c = describeAuthError('login', err('User not found'));
    expect(new Set([a, b, c]).size).toBe(1);
    expect(a).toBe('Email or password is incorrect.');
  });

  it('reports a server password rule, which reveals nothing about accounts', () => {
    expect(describeAuthError('signup', err('Password should be at least 6 characters.'))).toMatch(/password can't be used/);
    expect(describeAuthError('reset', err('Password is known to be weak and easy to guess'))).toMatch(/password can't be used/);
  });

  it('separates a dead connection from a refusal, in every mode', () => {
    for (const mode of ['login', 'signup', 'forgot', 'reset'] as const) {
      expect(describeAuthError(mode, new TypeError('Failed to fetch'))).toMatch(/Could not reach the server/);
    }
  });

  it('says to wait when rate-limited', () => {
    expect(describeAuthError('login', err('Request rate limit reached'))).toMatch(/Too many attempts/);
  });

  it('handles a non-Error rejection (a PostgREST error object, or nothing)', () => {
    expect(describeAuthError('signup', { message: 'duplicate key value', code: '23505' })).toMatch(/could not create an account/);
    expect(describeAuthError('reset', undefined)).toMatch(/reset link may have expired/);
  });
});

describe('newPasswordProblem', () => {
  it(`refuses fewer than ${MIN_PASSWORD_LENGTH} characters`, () => {
    expect(newPasswordProblem('abc12345!')).toMatch(/at least 10/);
    expect(newPasswordProblem('')).not.toBeNull();
  });

  it(`accepts exactly ${MIN_PASSWORD_LENGTH}`, () => {
    expect(newPasswordProblem('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });
});
