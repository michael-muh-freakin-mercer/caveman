/**
 * Reads a CAVMAN_<name> setting. Servers configured before the Caveman ->
 * Cavman rename still use CAVEMAN_<name>, which keeps working until their
 * .env is migrated (scripts/migrate-to-cavman.sh); the new name wins.
 */
export function setting(name: string): string | undefined {
  return process.env[`CAVMAN_${name}`] ?? process.env[`CAVEMAN_${name}`];
}
