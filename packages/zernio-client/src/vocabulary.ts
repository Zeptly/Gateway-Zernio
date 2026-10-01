/**
 * Provider vocabulary ↔ canonical Zeptly channels. Zernio calls X "twitter"; the shared Social
 * Publishing contract says "x". The mapping lives here so no other package ever sees "twitter".
 */
const TO_PLATFORM: Record<string, string> = { x: "twitter" };
const TO_CHANNEL: Record<string, string> = { twitter: "x" };

export const platformFor = (channel: string): string => TO_PLATFORM[channel] ?? channel;
export const channelFor = (platform: string): string => TO_CHANNEL[platform] ?? platform;
