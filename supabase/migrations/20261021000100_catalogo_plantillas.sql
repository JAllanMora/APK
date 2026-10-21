-- Catálogo inicial. Agrega una fila por cada carpeta templates/<repo_path> que exista en el repo.
insert into public.templates (id, name, description, repo_path, sort_order)
values ('base', 'Plantilla base', 'Pantalla de presentación con nombre, eslogan, dirección y botón de llamada.', 'base', 0);
