declare module "sql.js" {
  interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }

  interface InitOptions {
    locateFile?: (file: string) => string;
  }

  export type { Database };
  export default function initSqlJs(options?: InitOptions): Promise<SqlJsStatic>;
}
