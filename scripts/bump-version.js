const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionType = process.argv[2] || 'patch'; // patch, minor, major
const shouldCommit = process.argv.includes('--commit');

// Validar tipo de versão
if (!['patch', 'minor', 'major'].includes(versionType)) {
  console.error('❌ Tipo de versão inválido. Use: patch, minor ou major');
  process.exit(1);
}

// Ler package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

// Bump version
const [major, minor, patch] = packageJson.version.split('.').map(Number);
let newVersion;

switch (versionType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`📦 Atualizando versão de ${packageJson.version} para ${newVersion}...`);

// Atualizar package.json
packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✅ package.json atualizado');

// Atualizar tauri.conf.json
const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log('✅ tauri.conf.json atualizado');

// Atualizar Cargo.toml
const cargoTomlPath = path.join(__dirname, '..', 'src-tauri', 'Cargo.toml');
let cargoToml = fs.readFileSync(cargoTomlPath, 'utf-8');
cargoToml = cargoToml.replace(/^version = ".*"$/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoTomlPath, cargoToml);
console.log('✅ Cargo.toml atualizado');

// Criar commit e tag (opcional)
if (shouldCommit) {
  try {
    execSync(`git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml`, { stdio: 'inherit' });
    execSync(`git commit -m "chore: bump version to ${newVersion}"`, { stdio: 'inherit' });
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
    console.log(`✅ Commit e tag v${newVersion} criados`);
    console.log(`\n📝 Próximo passo: git push && git push --tags`);
  } catch (error) {
    console.error('❌ Erro ao criar commit/tag:', error.message);
    process.exit(1);
  }
}

console.log(`\n✅ Versão atualizada para ${newVersion}`);

