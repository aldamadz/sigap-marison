import type { MarisonPayloadMapping } from '@/services/marison-payload-mapping.service';

export type MarisonPayloadMappingFilter = 'all' | 'override' | 'empty' | 'unavailable' | 'invalid';

export const matchesMarisonPayloadMappingFilter = (
  filter: MarisonPayloadMappingFilter | string,
  sourceExternalId: string | number | null | undefined,
  sourceValid: boolean,
  mapping?: MarisonPayloadMapping | null,
) => {
  const hasSourceId = sourceExternalId !== null
    && sourceExternalId !== undefined
    && String(sourceExternalId).trim() !== '';
  const hasMapping = Boolean(mapping?.target_record_id);
  const mappingValid = hasMapping && mapping?.mapping_valid === true;

  if (filter === 'override') return mappingValid;
  if (filter === 'empty') return !hasSourceId;
  if (filter === 'unavailable') return !sourceValid && !mappingValid;
  if (filter === 'invalid') return hasMapping && !mappingValid;
  return true;
};
