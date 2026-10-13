-- CAL-03: allow the existing editor to save provisional results without
-- completing a task. No data rewrite, lifecycle event or authorization change.
begin;

create or replace function public.work_calendar_entries_before_change()
returns trigger
language plpgsql
as $$
begin
    NEW.title = nullif(btrim(NEW.title), '');
    NEW.realization = nullif(btrim(NEW.realization), '');
    NEW.notes = nullif(btrim(NEW.notes), '');
    NEW.location = nullif(btrim(NEW.location), '');
    NEW.blocked_reason = nullif(btrim(NEW.blocked_reason), '');

    if TG_OP = 'INSERT' then
        NEW.created_at = clock_timestamp();
        NEW.updated_at = clock_timestamp();
        NEW.deleted_at = null;

        if NEW.status = 'completed' then
            NEW.completed_at = clock_timestamp();
        else
            NEW.completed_at = null;
        end if;

        if NEW.status <> 'blocked' then
            NEW.blocked_reason = null;
        end if;
    elsif TG_OP = 'UPDATE' then
        if OLD.deleted_at is not null then
            raise exception 'Deleted record cannot be modified or restored';
        end if;

        if NEW.id <> OLD.id or NEW.owner_id <> OLD.owner_id or NEW.created_at <> OLD.created_at then
            raise exception 'Immutable fields cannot be changed';
        end if;

        NEW.updated_at = clock_timestamp();
        if NEW.deleted_at is not null then
            NEW.deleted_at = clock_timestamp();
        end if;

        if NEW.status = 'completed' then
            if OLD.status is distinct from 'completed' then
                NEW.completed_at = clock_timestamp();
            else
                NEW.completed_at = OLD.completed_at;
            end if;
        else
            NEW.completed_at = null;
        end if;

        if NEW.status <> 'blocked' then
            NEW.blocked_reason = null;
        end if;
    end if;

    return NEW;
end;
$$;

commit;
