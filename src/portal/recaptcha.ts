/**
 * Token de reCAPTCHA v3 invisible del portal, obtenido por HTTP puro
 * (flujo `anchor` → `reload`), sin navegador. Determinado en el spike.
 */
const SITE_KEY = '6Ld1FjwrAAAAAB-eRtB4N7vT_1LJoIt5r8YsDAOK';
const API_JS = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;

export class RecaptchaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecaptchaError';
  }
}

async function scriptVersion(): Promise<string> {
  const res = await fetch(API_JS);
  if (!res.ok) throw new RecaptchaError(`recaptcha api.js respondió ${res.status}`);
  const js = await res.text();
  const version = js.match(/releases\/([^/]+)\//)?.[1];
  if (!version) throw new RecaptchaError('no se pudo determinar la versión de reCAPTCHA');
  return version;
}

export async function fetchRecaptchaToken(origin: string): Promise<string> {
  const version = await scriptVersion();
  const co = Buffer.from(origin).toString('base64');

  const anchorUrl =
    `https://www.google.com/recaptcha/api2/anchor?ar=1&k=${SITE_KEY}` +
    `&co=${encodeURIComponent(co)}&hl=en&v=${version}&size=invisible&cb=${Date.now()}`;
  const anchorRes = await fetch(anchorUrl);
  const anchorHtml = await anchorRes.text();
  const anchor = anchorHtml.match(/id="recaptcha-token" value="([^"]+)"/)?.[1];
  if (!anchor) throw new RecaptchaError('no se pudo obtener el anchor token');

  const body = new URLSearchParams({ c: anchor, v: version, reason: 'q', k: SITE_KEY, co });
  const reloadRes = await fetch(`https://www.google.com/recaptcha/api2/reload?k=${SITE_KEY}`, {
    method: 'POST',
    body,
  });
  const reloadText = await reloadRes.text();
  const token = reloadText.match(/\["rresp","([^"]+)"/)?.[1];
  if (!token) throw new RecaptchaError('no se pudo obtener el token de reCAPTCHA');
  return token;
}
