import type { CSSProperties } from 'react';

/**
 * `style` accepts custom properties, but `CSSProperties` does not name them.
 * This widens the type so components can pass `--i` style indices without a
 * cast at every call site.
 */
export type CssVars = CSSProperties & Record<`--${string}`, string | number>;
