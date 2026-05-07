declare module "papaparse" {
  export type ParseResult<T> = { data: T[]; errors: { message: string }[] };
  export function parse<T>(file: File, config: { header?: boolean; skipEmptyLines?: boolean; complete: (result: ParseResult<T>) => void }): void;
  export function unparse(data: unknown[]): string;
}
