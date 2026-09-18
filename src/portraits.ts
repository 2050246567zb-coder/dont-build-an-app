import {emotions} from './story.ts';

/** Only generated, bundled PNG artwork. Never interpolate a caller's path. */
export const artFiles = new Set([
  'jobs-studio-surface.png', 'chapter-progress-atlas.png',
  'spirit-summoning-circle.png',
  'ending-meadow-clap-open.png', 'ending-meadow-clap-close.png',
  'jobs-thumbsup.png', 'ending-meadow.png', 'design-document-item.png',
  'background.png', 'dialogue-frame.png', 'button.png', 'dialogue-icons.png',
  'dialogue-icons-system.png', 'dialogue-icons-xiaohei.png',
  'jobs-background.png', 'jobs-panel.png', 'xiaohei-background.png', 'xiaohei-panel.png',
  ...['jobs', 'xiaohei'].flatMap(role => emotions.map(emotion => `${role}-${emotion}.png`)),
  'system-neutral.png', 'system-thinking.png', 'system-approval.png', 'system-surprised.png',
]);

export function portrait(role:string, emotion:string):string {
  if (!['system','jobs','xiaohei'].includes(role)) throw Error('Unknown character');
  if (!emotions.includes(emotion as any)) emotion = 'neutral';
  if (role === 'system' && !['thinking','approval','surprised'].includes(emotion)) emotion = 'neutral';
  return `${role}-${emotion}.png`;
}
