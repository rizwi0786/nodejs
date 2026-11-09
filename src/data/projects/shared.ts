import type { ComparisonTable } from '../../types';

export { dedent } from '../content/helpers';

/** Standard columns for every entity table in `databaseDesign`. */
export const ENTITY_COLUMNS = ['Column', 'Type', 'Constraints', 'Notes'];

/** One table per entity (or per JSON file shape for CLI/file projects). */
export const entity = (title: string, rows: string[][]): ComparisonTable => ({
  title,
  columns: ENTITY_COLUMNS,
  rows,
});
