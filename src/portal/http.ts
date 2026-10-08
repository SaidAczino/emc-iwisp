/**
 * Cliente HTTP explícito (tarea 2.5) sobre undici, con `redirect: 'manual'`
 * para poder observar las redirecciones a `/login` que señalan sesión caducada.
 */
import { fetch } from 'undici';

export interface HttpRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  readonly status: number;
  getHeader(name: string): string | null;
  getSetCookies(): string[];
  text(): Promise<string>;
  bytes(): Promise<Uint8Array>;
}

export interface HttpClient {
  request(url: string, init?: HttpRequestInit): Promise<HttpResponse>;
}

class UndiciHttpResponse implements HttpResponse {
  constructor(private readonly res: Awaited<ReturnType<typeof fetch>>) {}

  get status(): number {
    return this.res.status;
  }

  getHeader(name: string): string | null {
    return this.res.headers.get(name);
  }

  getSetCookies(): string[] {
    return this.res.headers.getSetCookie();
  }

  async text(): Promise<string> {
    return this.res.text();
  }

  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(await this.res.arrayBuffer());
  }
}

export class UndiciHttpClient implements HttpClient {
  async request(url: string, init: HttpRequestInit = {}): Promise<HttpResponse> {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
      redirect: 'manual',
    });
    return new UndiciHttpResponse(res);
  }
}
