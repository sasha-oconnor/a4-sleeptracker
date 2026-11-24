/**
 * The optional context people can attach to a log. Chips are faster than typing, and give
 * Trends something consistent to group by. Tuned for college students (classes, caffeine, exams).
 */
export interface TagDef {
  id: string;
  label: string;
  icon: string;
}

/** Things that commonly affect a night's sleep. */
export const SLEEP_TAGS: TagDef[] = [
  { id: 'caffeine', label: 'Late caffeine', icon: 'cafe-outline' },
  { id: 'screens', label: 'Screens in bed', icon: 'phone-portrait-outline' },
  { id: 'stress', label: 'Exam stress', icon: 'school-outline' },
  { id: 'alcohol', label: 'Alcohol', icon: 'wine-outline' },
  { id: 'exercise', label: 'Exercised', icon: 'barbell-outline' },
  { id: 'noise', label: 'Noisy room', icon: 'volume-high-outline' },
  { id: 'nap', label: 'Napped', icon: 'bed-outline' },
];

/** What was going on when someone rated their sleepiness. */
export const CHECKIN_TAGS: TagDef[] = [
  { id: 'pre-coffee', label: 'Before coffee', icon: 'cafe-outline' },
  { id: 'post-coffee', label: 'After coffee', icon: 'cafe' },
  { id: 'class', label: 'In class', icon: 'school-outline' },
  { id: 'studying', label: 'Studying', icon: 'book-outline' },
  { id: 'meal', label: 'After a meal', icon: 'restaurant-outline' },
  { id: 'nap', label: 'After a nap', icon: 'bed-outline' },
  { id: 'exercise', label: 'After exercise', icon: 'walk-outline' },
  { id: 'commute', label: 'Commuting', icon: 'bus-outline' },
];

/** Labels for the 1–5 "how rested do you feel?" rating. */
export const QUALITY_LABELS = [undefined, 'Poor', 'Fair', 'Okay', 'Good', 'Great'];

const ALL_TAGS = new Map<string, TagDef>([...SLEEP_TAGS, ...CHECKIN_TAGS].map(t => [t.id, t]));

export function tagLabel(id: string): string {
  return ALL_TAGS.get(id)?.label ?? id;
}
