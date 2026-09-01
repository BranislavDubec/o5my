# O5MY database schema

Open [`database-schema.html`](database-schema.html) in a browser. It contains a
readable overview and separate detailed diagrams for each part of the app.

The editable Mermaid sources are in [`database-schema/`](database-schema/).

## Updating the diagram

1. Update the relevant `.mmd` file in `docs/database-schema/` after changing
   `shared/schema.ts`.
2. From the repository root, run:

   ```bash
   npm run db:schema:render
   ```

3. Commit the Mermaid sources, generated SVG files, and the HTML viewer.

The generated SVG files are vector images, so they remain sharp at any zoom.
