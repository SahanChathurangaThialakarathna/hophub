/**
 * Backend base URL.
 *
 * Expo Go runs on a physical device, so 'localhost' would resolve to the
 * phone itself. This must be the laptop's LAN IP on the shared network.
 * When switching networks (dongle -> hotspot), this value changes.
 */
export const API_BASE_URL = "http://10.72.217.51:8000/api/v1";

export const API_TIMEOUT_MS = 10000;