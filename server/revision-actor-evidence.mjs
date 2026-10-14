const record = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = value => Array.isArray(value) ? value.map(record) : [];
const eventId = value => value.event_id || value.revision_event_id || value.id;
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const snapshotName = (snapshot, actorId) => {
  const signature = list(record(snapshot).signatures).find(row => row.user_id === actorId);
  if (signature && record(signature.signer_snapshot).full_name) return String(signature.signer_snapshot.full_name);
  const document = record(record(snapshot).document);
  if (document.created_by !== actorId) return undefined;
  return record(record(document.data_snapshot).requester).full_name || record(document.requester_snapshot).full_name;
};

export async function enrichRevisionActors(supabase, source, histories = []) {
  const snapshot = record(source.data_snapshot);
  const revisions = [record(snapshot.revision), record(snapshot.applied_revision)];
  const ids = [...new Set([...revisions.map(eventId), ...histories.map(row => row.revision_event_id)].filter(uuid))];
  if (!ids.length) return histories.length ? { ...source, revision_history: histories } : source;
  const { data: events, error } = await supabase.from("surat_revision_events")
    .select("id,surat_id,actor_id").eq("surat_id", source.id).in("id", ids);
  if (error) throw error;
  const matchingEvents = list(events).filter(event => event.surat_id === source.id && ids.includes(event.id));
  const actorIds = [...new Set([...matchingEvents.map(row => row.actor_id), ...histories.map(row => row.submitted_by)].filter(uuid))];
  const profiles = actorIds.length ? await supabase.from("profiles").select("id,full_name").in("id", actorIds) : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const names = new Map(list(profiles.data).map(profile => [profile.id, profile.full_name]));
  const nameFor = (id, history) => snapshotName(history?.before_snapshot, id)
    || snapshotName(history?.after_snapshot, id) || names.get(id) || undefined;
  const withActor = revision => {
    const event = matchingEvents.find(row => row.id === eventId(revision));
    if (!event) return revision;
    const history = histories.find(row => row.revision_event_id === event.id);
    return { ...revision, actor_name: nameFor(event.actor_id, history) };
  };
  return { ...source, data_snapshot: { ...snapshot,
    ...(snapshot.revision ? { revision: withActor(record(snapshot.revision)) } : {}),
    ...(snapshot.applied_revision ? { applied_revision: withActor(record(snapshot.applied_revision)) } : {}),
  }, revision_history: histories.map(history => {
    const event = matchingEvents.find(row => row.id === history.revision_event_id && row.actor_id === history.requested_by);
    return { ...history, requested_by_name: event ? nameFor(event.actor_id, history) : undefined,
      submitted_by_name: nameFor(history.submitted_by, history) };
  }) };
}
