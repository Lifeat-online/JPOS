# Script to remove Firebase/Firestore references from DevDashboard.tsx
$filePath = "src/views/DevDashboard.tsx"
$content = Get-Content $filePath -Raw

# Remove ScrollText from imports
$content = $content -replace "Terminal, Database, Shield, Activity, ScrollText, Zap,", "Terminal, Database, Shield, Activity, Zap,"

# Remove Firebase project constants
$content = $content -replace "const FB_PROJECT_ID = 'curious-clone-471818-s2';\s*const FB_DATABASE_ID = 'ai-studio-0ac21e09-3745-4e89-b194-009ff74c301f';\s*const FB_AUTH_DOMAIN = 'curious-clone-471818-s2\.firebaseapp\.com';\s*", "const APP_VERSION = String('0.0.1');`n"

# Remove FIRESTORE_RULES constant (multiline)
$firestoreRulesPattern = "const FIRESTORE_RULES = `rules_version = '2';.*?`\};"
$content = $content -replace $firestoreRulesPattern, ""

# Remove the rules tab content (lines around 1118-1148)
$rulesTabPattern = "\{/\* ═══════════════════════════════════════════════════════════════╗\s*TAB 3 — FIRESTORE RULES\s*════════════════════════════════════════════════════════════════ \*/\s*\{activeTab === 'rules' && \(.*?\)\s*\},"
$content = $content -replace $rulesTabPattern, ""

# Remove 'rules' from activeTab state
$content = $content -replace "const \[activeTab, setActiveTab\] = useState<'overview' \| 'data' \| 'rules' \| 'health' \| 'console' \| 'actions' \| 'tests'>", "const [activeTab, setActiveTab] = useState<'overview' | 'data' | 'health' | 'console' | 'actions' | 'tests'>"

# Remove 'rules' from tabs array
$content = $content -replace "\{ id: 'rules', label: 'Firestore Rules', icon: ScrollText \},", ""

# Update the Firebase project info section in overview to show Nginx/MariaDB info
$content = $content -replace "Firebase Project", "Server Info"
$content = $content -replace "FB_PROJECT_ID", "nginx"
$content = $content -replace "FB_DATABASE_ID", "mariadb"
$content = $content -replace "FB_AUTH_DOMAIN", "localhost"

# Save the file
Set-Content -Path $filePath -Value $content -NoNewline
Write-Host "File updated successfully"
