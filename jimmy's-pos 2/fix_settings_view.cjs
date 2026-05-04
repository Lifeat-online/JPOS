const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsView.tsx', 'utf8');

content = content.replace(
  "export function SettingsView({ config, setConfig }: { config: AppConfig, setConfig: (c: AppConfig) => void }) {",
  "export function SettingsView({ config, setConfig }: { config: AppConfig, setConfig: (c: AppConfig) => void }) {\n  const tenantId = usePosStore(state => state.tenantId);"
);

fs.writeFileSync('src/components/SettingsView.tsx', content);
