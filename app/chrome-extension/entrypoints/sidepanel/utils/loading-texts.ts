/**
 * Random loading messages
 * Used by TimelineStatusStep component to show fun wait prompts
 */

const loadingTexts = [
  // Classic lines
  'Should have been smooth sailing',
  'Now scrambling at full speed',
  "I know you're in a hurry, but hold on",
  'Dog-paddling through the ocean of knowledge',
  'Let the bullet fly a little longer',
  'Hand-crafting your answer',
  'Assembling the knowledge squad',
  "Don't rush, already writing (New Folder)",
  'Sweating through deep thought',
  'CPU is almost on fire',
  // Everyday vibes
  'Slow-roasting the good stuff',
  'Flipping the knowledge pancake',
  'One more sec, almost there',
  'Putting inspiration in the oven',
  'Letting the answer steep a bit longer',
  'Maximum value loading',
  'Knitting your answer in language',
  // Wild ideas
  'Neurons hitting the dance floor',
  'The night-owl owl is pondering',
  'Coloring in the answer',
  'Frantically searching the knowledge base',
  'Big brain circus opening act',
  'Squishing 0s and 1s together',
  'Charging up a big move',
  'Magnifying glass a bit foggy, wiping it',
  'Attempting to understand this unusual request',
  // Mystical
  'Casting a spell, do not disturb',
  'Awakening silicon friends',
  'Connecting to cyber-space wisdom',
  'Fellow traveler, running the calculations',
  'Crossing the knowledge black hole',
  'Reverse-parsing human intent',
  'Crystal ball a bit blurry, tapping it',
  // Office life
  'Code running faster than a reporter',
  'Lead agent online, please hold',
  'Racing here at full gallop',
  'Light-speed knowledge transfer',
  'Last puzzle piece',
  'Answer almost wrapped up',
  'Launch countdown',
  'Target locked',
];

/**
 * Get a random loading message
 */
export function getRandomLoadingText(): string {
  return loadingTexts[Math.floor(Math.random() * loadingTexts.length)];
}
