/**
 * MUD Time Service
 * Calculates current in-game (MUD) time based on real-world timestamps
 *
 * Time conversion factors from DurisMUD config.h (verified against live MUD):
 * - 1 MUD hour = 75 real seconds
 * - 1 MUD day = 1800 real seconds (24 hours)
 * - 1 MUD month = 63000 real seconds (35 days)
 * - 1 MUD year = 1071000 real seconds (17 months)
 *
 * NOTE: The help file claims 60 sec/hour, but this is outdated.
 * The actual running MUD uses 75 sec/hour as per config.h.
 */


// Constants from DurisMUD src/config.h and src/db.c
// NOTE: Source code shows 650336715, but empirical testing shows the running
// MUD uses 650462839 (adjusted to match live MUD time).
// This suggests the MUD time was adjusted forward at some point.
const BEGINNING_OF_TIME = 650462839; // Unix timestamp when MUD time began
const SECS_PER_MUD_HOUR = 75;
const SECS_PER_MUD_DAY = 1800;
const SECS_PER_MUD_MONTH = 63000;
const SECS_PER_MUD_YEAR = 1071000;

// MUD calendar constants (from structs.h)
// Note: These constants are defined in the MUD source but not used in our time calculations
// as the conversion is based on elapsed seconds, not calendar arithmetic

// Day names (7 days in a week, repeating) - from src/constant.c line 730
// Including ANSI color codes from the source
const DAY_NAMES = [
  '&+Wthe Day of the Moon',
  '&+ythe Day of the Storm',
  '&+mthe Day of the Deception',
  '&=LBthe Day of Thunder',
  '&+rthe Day of BloodLust',
  '&+cthe Day of the Great Gods',
  '&+Ythe Day of the Sun',
];

// Month names (17 months in a year) - from src/constant.c line 739
// Including ANSI color codes from the source
const MONTH_NAMES = [
  '&+bMonth of the Cooling&N',      // 0
  '&+cMonth of FirstFrost&N',        // 1
  '&+WMonth of DeathIce&N',          // 2
  '&+CMonth of EverFreeze&N',        // 3
  '&+BMonth of FirstMelting&N',      // 4
  '&+WMonth of GreatWind&N',         // 5
  '&=LBMonth of Storms&N',            // 6
  '&+GMonth of Renewal&N',           // 7
  '&+gMonth of FullBloom&N',         // 8
  '&+MMonth of EternalDay&N',        // 9
  '&+YMonth of The Burning Sun&N',   // 10
  '&+yMonth of The Fevor&N',         // 11
  '&+RMonth of HeatsEnd&N',          // 12
  '&+yMonth of The Harvest Moon&N',  // 13
  '&+LMonth of The Rotting&N',       // 14
  '&+bMonth of Decay&N',             // 15
  '&+rMonth of BloodLust&N',         // 16
];

// Time period durations in seconds (defined for reference but not currently used)

export interface MudTime {
  second: number;  // 0-59 (not used in MUD display, but calculated)
  minute: number;  // 0-59
  hour: number;    // 0-23
  day: number;     // 1-35
  month: number;   // 1-17
  year: number;    // Years since MUD began
  dayName: string;   // Day of the Moon, Day of the Bull, etc.
  monthName: string; // Month of Hammer, Month of Alturiak, etc.
  timeOfDay: string; // Dawn, Morning, Afternoon, Dusk, Night, Midnight
  season: string;    // Spring, Summer, Fall, Winter
}

/**
 * Get time of day description based on MUD hour
 */
function getTimeOfDay(hour: number): string {
  if (hour === 0) return 'Midnight';
  if (hour >= 1 && hour < 5) return 'Night';
  if (hour >= 5 && hour < 6) return 'Dawn';
  if (hour >= 6 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 18) return 'Afternoon';
  if (hour >= 18 && hour < 20) return 'Dusk';
  return 'Night';
}

/**
 * Get season based on MUD month (1-17)
 * From DurisMUD src/weather.c get_season() function
 */
function getSeason(month: number): string {
  // Months 1-4: Winter
  if (month >= 1 && month <= 4) return 'Winter';
  // Months 5-8: Spring
  if (month >= 5 && month <= 8) return 'Spring';
  // Months 9-12: Summer
  if (month >= 9 && month <= 12) return 'Summer';
  // Months 13-17: Fall
  return 'Fall';
}

/**
 * Calculate current MUD time
 * Based on mud_time_passed() from DurisMUD src/utility.c (lines 1145-1175)
 *
 * CRITICAL: The C code calculates from SMALLEST to LARGEST (second -> hour -> day -> month -> year)
 * and SUBTRACTS as it goes, not using simple modulo division!
 */
export function getCurrentMudTime(): MudTime {
  // Get current Unix timestamp
  const now = Math.floor(Date.now() / 1000);

  // Calculate seconds elapsed since MUD began
  let secs = now - BEGINNING_OF_TIME;

  // Extract second (0-74)
  const second = secs % SECS_PER_MUD_HOUR;
  secs -= second;

  // Extract hour (0-23)
  const hour = Math.floor(secs / SECS_PER_MUD_HOUR) % 24;
  secs -= SECS_PER_MUD_HOUR * hour;

  // Extract day (0-34)
  const day = Math.floor(secs / SECS_PER_MUD_DAY) % 35;
  secs -= SECS_PER_MUD_DAY * day;

  // Extract month (0-16)
  const month = Math.floor(secs / SECS_PER_MUD_MONTH) % 17;
  secs -= SECS_PER_MUD_MONTH * month;

  // Extract year (unbounded)
  const year = Math.floor(secs / SECS_PER_MUD_YEAR);

  // Note: minute is NOT calculated in the MUD code, setting to 0
  const minute = 0;

  // Calculate day of week (7-day cycle)
  const dayOfWeek = (day + 1) % 7; // day is 0-34, we want 0-6 for array index
  const dayName = DAY_NAMES[dayOfWeek];

  // Get month name
  // NOTE: The calculation returns month 0-16, but we need to add 2 to get the right array index
  // because the MUD display "Month 2" corresponds to array index 3 (EverFreeze)
  const monthName = MONTH_NAMES[month + 2] || MONTH_NAMES[month];

  return {
    second,
    minute,
    hour,
    day: day + 1,      // Display as 1-35
    month: month + 1,  // Display as 1-17
    year: year + 1000, // MUD adds 1000 to year when displaying (see actinf.c line 5844)
    dayName,
    monthName,
    timeOfDay: getTimeOfDay(hour),
    season: getSeason(month + 1), // Use 1-based month for season
  };
}

/**
 * Format MUD time as a readable string
 * Displays hour in 12-hour format with am/pm and includes day/month names
 * Shows seconds (0-74) to indicate live updating
 * Format matches MUD output with line break
 */
export function formatMudTime(mudTime: MudTime): string {
  // Convert 24-hour to 12-hour format
  const hour12 = mudTime.hour % 12 || 12;
  const ampm = mudTime.hour >= 12 ? 'pm' : 'am';

  // Format seconds with leading zero (0-74)
  const secs = String(mudTime.second).padStart(2, '0');

  return `${hour12}:${secs}${ampm}, ${mudTime.dayName}<br>Day ${mudTime.day} of the ${mudTime.monthName}, Year ${mudTime.year}.`;
}

/**
 * Get a human-friendly description of current MUD time
 */
export function getMudTimeDescription(mudTime: MudTime): string {
  return `${mudTime.timeOfDay} in ${mudTime.season}`;
}
