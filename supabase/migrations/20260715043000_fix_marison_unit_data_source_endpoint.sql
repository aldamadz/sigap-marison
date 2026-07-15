update public.external_data_sources
set endpoint_template = '/unit?project_id={project_id}&per_page=100'
where source_key = 'marison_units_by_project';
