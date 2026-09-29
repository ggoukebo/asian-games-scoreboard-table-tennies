import type { ScheduleMatch } from "../shared/types";
import { getCountryCode, localizeSideName } from "./chineseNames";
import type { FlagMap } from "./flagAssets";
import { mapMatchStatus } from "./normalizer";

type RawRecord = Record<string, unknown>;

const asRecord = (value: unknown): RawRecord =>
  value !== null && typeof value === "object" ? (value as RawRecord) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const normalizeSide = (
  value: unknown,
  flags: FlagMap
): {
  name: string;
  abbreviation: string;
  countryCode: string | null;
  flagUrl: string | null;
} => {
  const side = asRecord(value);
  const abbreviation = text(side.Org);
  const localized = localizeSideName(value);

  return {
    name: localized.name,
    abbreviation,
    countryCode: getCountryCode(side),
    flagUrl: flags[abbreviation.toUpperCase()] ?? null
  };
};

export const normalizeSchedule = (
  rawValue: unknown,
  flags: FlagMap = {}
): ScheduleMatch[] => {
  const events = asArray(rawValue).map(asRecord);
  const matches: ScheduleMatch[] = [];

  for (const event of events) {
    for (const phaseValue of asArray(event.Phases)) {
      const phase = asRecord(phaseValue);
      for (const unitValue of asArray(phase.Units)) {
        const unit = asRecord(unitValue);
        const key = text(unit.Key);
        if (!key) {
          continue;
        }

        matches.push({
          key,
          eventName: text(unit.EventDesc, text(event.Desc, "乒乓球")),
          phase: text(
            unit.PhaseDesc,
            text(phase.Desc, text(unit.Phase, ""))
          ),
          label: text(
            unit.UnitDesc,
            text(unit.UnitDescA, text(unit.UnitDescS, key))
          ),
          home: normalizeSide(unit.Home, flags),
          away: normalizeSide(unit.Away, flags),
          status: mapMatchStatus(unit.Status, Boolean(unit.IsLive)),
          statusDescription: text(unit.StatusDesc, text(unit.Status)),
          startAt: text(unit.DateTimeRaw) || null,
          venue: text(unit.VenueDesc, text(unit.Venue, ""))
        });
      }
    }
  }

  return matches.sort((left, right) => {
    const leftTime = left.startAt ? Date.parse(left.startAt) : Number.MAX_VALUE;
    const rightTime = right.startAt
      ? Date.parse(right.startAt)
      : Number.MAX_VALUE;
    return leftTime - rightTime || left.key.localeCompare(right.key);
  });
};
