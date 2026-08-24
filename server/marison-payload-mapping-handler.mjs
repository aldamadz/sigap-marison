import { parseMarisonPayloadMappingCommand } from './marison-payload-mapping-request.mjs';

export const executeMarisonPayloadMappingCommand = async ({
  actorId,
  environment,
  payload,
  rpc,
}) => {
  if (environment !== 'staging') {
    const error = new Error('Mapping payload hanya tersedia di staging.');
    error.status = 404;
    throw error;
  }

  const { entityType, recordId, targetRecordId, reason, expectedUpdatedAt } =
    parseMarisonPayloadMappingCommand(payload);
  const { data, error } = await rpc('configure_marison_payload_mapping', {
    p_actor_id: actorId,
    p_entity_type: entityType,
    p_record_id: recordId,
    p_target_record_id: targetRecordId,
    p_reason: reason,
    p_expected_updated_at: expectedUpdatedAt,
    p_environment: environment,
  });

  if (error) {
    if (error.code === '40001') error.status = 409;
    throw error;
  }

  if (data?.conflict === true) {
    const messages = {
      EXPECTED_VERSION_REQUIRED: 'Mapping sudah ada. Muat ulang data sebelum mengganti atau mereset mapping.',
      MAPPING_MISSING: 'Mapping sudah dihapus. Muat ulang data sebelum menyimpan kembali.',
      STALE_VERSION: 'Mapping sudah berubah. Muat ulang data sebelum menyimpan.',
    };
    const conflict = new Error(messages[data.code] || 'Mapping berubah. Muat ulang data sebelum menyimpan.');
    conflict.status = 409;
    conflict.code = data.code || 'MAPPING_CONFLICT';
    throw conflict;
  }

  return { success: true, mapping: data, actorId };
};
