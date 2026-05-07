/**
 * zerion apikey — quick shortcut for viewing / setting the Zerion API key.
 *
 * Usage:
 *   zerion apikey                  → show current key (redacted)
 *   zerion apikey set <key>        → save key to config
 *   zerion apikey unset            → remove saved key from config
 */

import { getApiKey, getConfigValue, setConfigValue, unsetConfigValue } from "../lib/config.js";
import { print, printError } from "../lib/util/output.js";

function redact(val) {
  if (!val) return null;
  return val.length > 8 ? val.slice(0, 8) + "..." : "***";
}

export default async function apikeyCmd(args, flags) {
  const [action, ...valueParts] = args;

  // No action → show current key + source
  if (!action) {
    const envKey = process.env.ZERION_API_KEY || null;
    const configKey = getConfigValue("apiKey") || null;
    const active = envKey || configKey;
    print({
      apiKey: redact(active),
      source: envKey ? "ZERION_API_KEY env var" : configKey ? "config file" : null,
      hint: active
        ? null
        : "Set via: zerion apikey set <key>  OR  export ZERION_API_KEY=<key>",
    });
    return;
  }

  if (action === "set") {
    const key = valueParts.join(" ").trim() || flags.key;
    if (!key) {
      printError("missing_value", "Usage: zerion apikey set <api-key>", {
        hint: "Get your key at https://developers.zerion.io",
      });
      process.exit(1);
    }
    setConfigValue("apiKey", key);
    print({ apiKey: redact(key), updated: true });
    return;
  }

  if (action === "unset" || action === "remove" || action === "delete") {
    unsetConfigValue("apiKey");
    print({ apiKey: null, removed: true });
    return;
  }

  // If the first arg looks like a key value, treat it as `apikey set <key>`
  if (action.startsWith("zk_") || action.length > 20) {
    setConfigValue("apiKey", action);
    print({ apiKey: redact(action), updated: true });
    return;
  }

  printError("invalid_action", "Usage: zerion apikey [set <key> | unset]", {
    hint: "Run 'zerion apikey' to see current key",
  });
  process.exit(1);
}
