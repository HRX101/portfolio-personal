import { IDENTITY, SEO } from '../data/content';

/**
 * ============================================================================
 * SITE METADATA — SINGLE SOURCE OF TRUTH
 * ============================================================================
 *
 * Everything a crawler, a link preview, or a browser chrome needs to know about
 * this site lives here — not scattered across `index.html`, the manifest, the
 * sitemap and the JSON-LD block. Copy lives in `content.ts` (and is imported,
 * never retyped); deployment facts live here.
 *
 * The URL comes from `VITE_SITE_URL` with the apex domain as fallback, so
 * preview deployments can set their own canonical without touching code. The
 * value is normalised once (https scheme, no trailing slash) because three
 * different consumers concatenate paths onto it and exactly one of them
 * getting it right is not good enough.
 */

function readSiteUrl(): string {
  const raw =
    (typeof import.meta !== 'undefined' &&
      (import.meta.env?.VITE_SITE_URL as string | undefined)) ||
    'https://hrithikpaul.dev';
  const trimmed = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const SITE_URL = readSiteUrl();

export const SITE = {
  url: SITE_URL,
  name: IDENTITY.name,
  title: SEO.title,
  description: SEO.description,
  locale: 'en_IN',
  language: 'en',
  author: IDENTITY.name,
  email: IDENTITY.email,
  themeColor: '#04050d',
  backgroundColor: '#04050d',
  socialImage: `${SITE_URL}/og-image.png`,
  socialImageWidth: 1200,
  socialImageHeight: 630,
  socialImageAlt: `${IDENTITY.name} — ${IDENTITY.title}`,
  links: IDENTITY.links,
  /** Current employer, for the JSON-LD `worksFor` relation. */
  employer: 'Telaverge Communication',
  /** Degree-granting institution, for the JSON-LD `alumniOf` relation. */
  almaMater: 'JIS University',
} as const;

/**
 * JSON-LD graph: a Person (who this site is about) plus the WebSite (what the
 * Person publishes). Serialised into `index.html` at build time by
 * `scripts/seo.mjs`, which also validates that it parses — a hand-written
 * JSON blob in HTML is exactly the kind of thing that rots silently, so the
 * generation and the validation are the same script.
 */
export function buildJsonLd(): Record<string, unknown>[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: SITE.name,
      jobTitle: IDENTITY.title,
      email: `mailto:${SITE.email}`,
      url: `${SITE.url}/`,
      address: {
        '@type': 'PostalAddress',
        addressRegion: IDENTITY.location,
        addressCountry: 'IN',
      },
      sameAs: SITE.links.map((link) => link.href),
      worksFor: {
        '@type': 'Organization',
        name: SITE.employer,
      },
      alumniOf: {
        '@type': 'EducationalOrganization',
        name: SITE.almaMater,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.title,
      url: `${SITE.url}/`,
      description: SITE.description,
      inLanguage: SITE.language,
      author: {
        '@type': 'Person',
        name: SITE.name,
        url: `${SITE.url}/`,
      },
    },
  ];
}
