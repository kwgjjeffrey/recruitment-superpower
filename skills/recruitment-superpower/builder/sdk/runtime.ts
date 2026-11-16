import type { PageView } from './schema';

/** Shared module ABI for the compiled runner and the packaged Builder SDK. */
export const PAGE_PROTOCOL = { name: 'recruitment-page', version: 1 } as const;
export type PageRuntime = { protocol: typeof PAGE_PROTOCOL.name; version: 1; remote: string };
export type PageIdentity = { assetPath: string; buildId: string; version: string; title: string };

export interface PageContext<P extends object = Record<string, unknown>, S extends object = object> {
  readonly protocolVersion: 1;
  readonly page: PageIdentity;
  readonly params: P;
  readonly schema: PageView;
  accept(patch: Partial<P>): P;
  subscribe(listener: (params: P) => void): () => void;
  pending(): void;
  provide(state: S): void;
  fail(message: string): void;
  api<T = unknown>(assetPath: string, params: object): Promise<T>;
}

export interface PageModule {
  mount(element: HTMLElement, context: PageContext): () => void;
}
