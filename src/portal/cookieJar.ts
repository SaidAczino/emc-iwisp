/** Jar de cookies mínimo (el portal sólo usa `PHPSESSID`, con `path=/`). */

interface StoredCookie {
  value: string;
  /** null = cookie de sesión del navegador (sin Expires). */
  expiresAt: number | null;
}

export interface CookieSnapshot {
  name: string;
  value: string;
  expiresAt: number | null;
}

export class CookieJar {
  private readonly cookies = new Map<string, StoredCookie>();

  absorb(setCookies: string[], now = Date.now()): void {
    for (const line of setCookies) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair?.indexOf('=') ?? -1;
      if (!pair || eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      let expiresAt: number | null = null;
      for (const attr of attrs) {
        const idx = attr.indexOf('=');
        const key = (idx === -1 ? attr : attr.slice(0, idx)).trim().toLowerCase();
        const val = idx === -1 ? '' : attr.slice(idx + 1).trim();
        if (key === 'max-age' && val) expiresAt = now + Number(val) * 1000;
        else if (key === 'expires' && val) {
          const t = Date.parse(val);
          if (!Number.isNaN(t)) expiresAt = t;
        }
      }
      if (value === '' || (expiresAt !== null && expiresAt <= now)) this.cookies.delete(name);
      else this.cookies.set(name, { value, expiresAt });
    }
  }

  header(now = Date.now()): string {
    const parts: string[] = [];
    for (const [name, cookie] of this.cookies) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= now) {
        this.cookies.delete(name);
        continue;
      }
      parts.push(`${name}=${cookie.value}`);
    }
    return parts.join('; ');
  }

  isEmpty(): boolean {
    return this.header() === '';
  }

  clear(): void {
    this.cookies.clear();
  }

  snapshot(now = Date.now()): CookieSnapshot[] {
    const out: CookieSnapshot[] = [];
    for (const [name, cookie] of this.cookies) {
      if (cookie.expiresAt !== null && cookie.expiresAt <= now) continue;
      out.push({ name, value: cookie.value, expiresAt: cookie.expiresAt });
    }
    return out;
  }

  restore(snapshots: CookieSnapshot[]): void {
    this.cookies.clear();
    for (const s of snapshots) this.cookies.set(s.name, { value: s.value, expiresAt: s.expiresAt });
  }
}
