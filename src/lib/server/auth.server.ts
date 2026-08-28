import {
	getCookie,
	getRequestHeader,
	getRequestHost,
	getRequestProtocol,
	getResponse,
	setResponseStatus,
	useSession,
	type SessionConfig
} from '@tanstack/react-start/server';
import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

export const SESSION_DAYS = 30;
const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
const SESSION_COOKIE = 'tlr_session';

export type AuthSession = { authed: boolean; email?: string };

function envStr(
	name:
		| 'DEFAULT_LAT'
		| 'DEFAULT_LON'
		| 'AUTH_DEV_BYPASS'
		| 'SESSION_SECRET'
		| 'CF_ACCESS_AUD'
		| 'CF_ACCESS_TEAM_DOMAIN'
		| 'CF_ACCESS_EMAIL'
): string {
	const fromWorker = env[name];
	if (typeof fromWorker === 'string' && fromWorker) return fromWorker;
	if (typeof process !== 'undefined' && process.env[name]) return process.env[name]!;
	return '';
}

export function redirectWithSession(url: string): Response {
	const headers = new Headers({ Location: url });
	for (const [key, value] of getResponse().headers) {
		if (key.toLowerCase() === 'set-cookie') headers.append(key, value);
	}
	return new Response(null, { status: 302, headers });
}

export function authDevBypass(): boolean {
	const v = envStr('AUTH_DEV_BYPASS');
	if (v !== '1' && v !== 'true') return false;
	const host = getRequestHost({ xForwardedHost: true }).split(':')[0] ?? '';
	return host === 'localhost' || host === '127.0.0.1';
}

const ACCESS_ISS = /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i;

function teamDomain(): string {
	const raw = envStr('CF_ACCESS_TEAM_DOMAIN').replace(/\/$/, '');
	if (!raw) return '';
	const url = raw.startsWith('http') ? raw : `https://${raw}`;
	return ACCESS_ISS.test(url) ? url : '';
}

function issuerFromToken(token: string): string {
	try {
		const iss = decodeJwt(token).iss?.replace(/\/$/, '') ?? '';
		if (ACCESS_ISS.test(iss)) return iss;
	} catch {
		/* verifyAccessToken reports the real failure */
	}
	return teamDomain();
}

function sessionConfig(): SessionConfig | null {
	const password = envStr('SESSION_SECRET');
	if (password.length < 32) return null;
	return {
		name: SESSION_COOKIE,
		password,
		maxAge: SESSION_MAX_AGE,
		cookie: {
			httpOnly: true,
			secure: getRequestProtocol() === 'https',
			sameSite: 'lax',
			path: '/',
			maxAge: SESSION_MAX_AGE
		}
	};
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer = '';

function accessJwks(issuer: string) {
	const aud = envStr('CF_ACCESS_AUD');
	if (!issuer || !aud) return null;
	if (!jwks || jwksIssuer !== issuer) {
		jwksIssuer = issuer;
		jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
	}
	return { jwks, issuer, aud };
}

function accessToken(): string {
	return getRequestHeader('cf-access-jwt-assertion') || getCookie('CF_Authorization') || '';
}

async function verifyAccessToken(token: string): Promise<{ email: string }> {
	const keys = accessJwks(issuerFromToken(token));
	if (!keys) throw new Error('Cloudflare Access is not configured.');
	const { payload } = await jwtVerify(token, keys.jwks, {
		issuer: keys.issuer,
		audience: keys.aud
	});
	const email = typeof payload.email === 'string' ? payload.email.trim() : '';
	if (!email) throw new Error('Access token has no email.');
	const allowed = envStr('CF_ACCESS_EMAIL');
	if (allowed && email.toLowerCase() !== allowed.toLowerCase()) {
		throw new Error('That account cannot edit this site.');
	}
	return { email };
}

export async function readAuthSession(): Promise<AuthSession> {
	if (authDevBypass()) return { authed: true, email: 'dev@localhost' };
	const cfg = sessionConfig();
	if (!cfg) return { authed: false };
	const session = await useSession<{ email?: string }>(cfg);
	const email = session.data.email?.trim();
	if (!email) return { authed: false };
	return { authed: true, email };
}

export async function completeAccessLogin(): Promise<{ ok: true } | { ok: false; error: string }> {
	if (authDevBypass()) return { ok: true };
	const cfg = sessionConfig();
	if (!cfg || !envStr('CF_ACCESS_AUD')) {
		return {
			ok: false,
			error: 'Sign-in is not configured yet. Add Cloudflare Access secrets, then protect /login.'
		};
	}
	const token = accessToken();
	if (!token) {
		return {
			ok: false,
			error: 'Cloudflare Access did not sign this request. Put Access only on /login, then try Sign in again.'
		};
	}
	try {
		const { email } = await verifyAccessToken(token);
		const session = await useSession<{ email?: string }>(cfg);
		await session.update({ email });
		return { ok: true };
	} catch (err) {
		console.error('Access login verify failed', err);
		return { ok: false, error: err instanceof Error ? err.message : 'Could not verify sign-in.' };
	}
}

export async function clearAuthSession(): Promise<void> {
	const cfg = sessionConfig();
	if (!cfg) return;
	const session = await useSession(cfg);
	await session.clear();
}

export async function assertSignedIn(): Promise<AuthSession> {
	const session = await readAuthSession();
	if (!session.authed) {
		setResponseStatus(401);
		throw new Error('Sign in to make changes.');
	}
	return session;
}

export function safeNextPath(raw: string | null | undefined): string {
	if (!raw) return '/';
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
	if (raw.startsWith('/login') || raw.startsWith('/logout')) return '/';
	return raw;
}
