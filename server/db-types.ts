import type { ColumnType, Generated } from "kysely";

export type AppSettingsTable = {
  tenant_id: string;
  payfast_merchant_id: string | null;
  payfast_merchant_key: string | null;
  payfast_passphrase: string | null;
  payfast_sandbox: ColumnType<number, number | string | undefined, number | string>;
  business: string | null;
  setup_completed: ColumnType<number, number | string | undefined, number | string>;
  categories: string | null;
  retention_policy: string | null;
  slug: string | null;
  created_at: ColumnType<Date, string | Date | undefined, string | Date>;
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>;
};

export type SlugsTable = {
  slug: string;
  tenant_id: string;
  created_at: ColumnType<Date, string | Date | undefined, string | Date>;
};

export type UsersTable = {
  uid: string;
  tenant_id: string | null;
  email: string;
  name: string;
  created_at: ColumnType<Date, string | Date | undefined, string | Date>;
  updated_at: ColumnType<Date, string | Date | undefined, string | Date>;
};

export type DB = {
  app_settings: AppSettingsTable;
  slugs: SlugsTable;
  users: UsersTable;
};
