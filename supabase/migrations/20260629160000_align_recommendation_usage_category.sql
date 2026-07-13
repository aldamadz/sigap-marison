update public.form_usages
set request_category = 'asset'
where id = '3b6cb533-a199-4d37-9e72-89e95adaba5d'
  and request_category is distinct from 'asset';

