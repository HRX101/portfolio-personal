import { BookOpen, Github, GraduationCap, Languages, Linkedin, Mail, Trophy } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { SocialLink } from '../../data/content';

/**
 * Icon registry.
 *
 * `SocialLink.icon` in `content.ts` names one of these keys, so a link in the
 * data picks its glyph without a component knowing the mapping. Anything drawn
 * from a brand's own mark comes from lucide; the generic envelope is used for
 * the Scholar link because there is no Lucide brand icon for it.
 */

export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const REGISTRY = {
  linkedin: Linkedin,
  github: Github,
  mail: Mail,
  scholar: BookOpen,
} as const satisfies Record<SocialLink['icon'], IconComponent>;

export type IconName = keyof typeof REGISTRY;

/** Icon for a social link, falling back to the envelope for unknown keys. */
export function iconFor(name: SocialLink['icon']): IconComponent {
  return REGISTRY[name] ?? Mail;
}

export { GraduationCap, Languages, Trophy };
