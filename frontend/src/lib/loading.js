// Cosmetic loading times (milliseconds). The data usually arrives in a few milliseconds, so without these the
// screens would pop in with no sense of "the system is getting ready". Change a number to make it faster or
// slower; set it to 0 to switch that effect off.
export const SPLASH_MS = 2400;   // first opening of the app
export const WELCOME_MS = 1900;  // after signing in
export const PAGE_MS = 480;      // when moving between screens

export const SPLASH_STEPS = ['Starting the workshop system', 'Connecting to the garage database', 'Loading job cards and parts stock', 'Preparing your workspace'];
export const WELCOME_STEPS = ['Checking your sign-in', 'Loading your job cards', 'Syncing parts stock and prices', 'Opening your dashboard'];
