const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Ler versão do package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const currentVersion = packageJson.version;

// Verificar se estamos em um repositório Git
let isGitRepo = false;
try {
  execSync('git rev-parse --git-dir', { stdio: 'ignore', cwd: path.join(__dirname, '..') });
  isGitRepo = true;
} catch (error) {
  console.warn('⚠️  Não é um repositório Git. Gerando changelog vazio.');
}

// Função para sanitizar mensagens de commit
function sanitizeMessage(message) {
  return message
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/"/g, '\\"')
    .trim();
}

// Função para extrair tipo e mensagem do commit
function parseCommitMessage(fullMessage) {
  const featMatch = fullMessage.match(/^feat(\(.+?\))?:\s*(.+)$/i);
  const fixMatch = fullMessage.match(/^fix(\(.+?\))?:\s*(.+)$/i);
  
  if (featMatch) {
    return { type: 'feat', message: featMatch[2] || featMatch[0] };
  }
  if (fixMatch) {
    return { type: 'fix', message: fixMatch[2] || fixMatch[0] };
  }
  return null;
}

// Função para obter tags de versão
function getVersionTags() {
  try {
    const tags = execSync('git tag --sort=-version:refname', {
      encoding: 'utf-8',
      cwd: path.join(__dirname, '..'),
    })
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(tag => /^v?\d+\.\d+\.\d+/.test(tag));
    return tags;
  } catch (error) {
    return [];
  }
}

// Função para obter commits entre duas tags ou desde o início
function getCommitsBetweenTags(fromTag, toTag) {
  try {
    let range = '';
    if (fromTag && toTag) {
      range = `${fromTag}..${toTag}`;
    } else if (toTag) {
      range = toTag;
    } else {
      range = 'HEAD';
    }

    const logFormat = '%H|%an|%ad|%s';
    const dateFormat = '--date=iso-strict';
    
    const output = execSync(
      `git log ${range} --pretty=format:"${logFormat}" --date=${dateFormat}`,
      {
        encoding: 'utf-8',
        cwd: path.join(__dirname, '..'),
      }
    );

    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, author, date, message] = line.split('|');
        const parsed = parseCommitMessage(message);
        if (!parsed) return null;
        
        return {
          hash: hash.substring(0, 7),
          type: parsed.type,
          message: sanitizeMessage(parsed.message),
          author: author.trim(),
          date: date.trim(),
        };
      })
      .filter(Boolean);
  } catch (error) {
    return [];
  }
}

// Função principal para gerar changelog
function generateChangelog() {
  const changelogPath = path.join(__dirname, '..', 'data', 'changelog.json');
  const dataDir = path.dirname(changelogPath);

  // Criar diretório data se não existir
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!isGitRepo) {
    // Gerar changelog vazio se não for repositório Git
    const emptyChangelog = {
      version: currentVersion,
      generatedAt: new Date().toISOString(),
      releases: [],
    };
    fs.writeFileSync(changelogPath, JSON.stringify(emptyChangelog, null, 2), 'utf-8');
    console.log('✅ Changelog vazio gerado (não é repositório Git)');
    return;
  }

  const releases = [];
  const versionTags = getVersionTags();

  if (versionTags.length > 0) {
    // Agrupar por tags de versão
    for (let i = 0; i < versionTags.length; i++) {
      const currentTag = versionTags[i];
      const nextTag = i < versionTags.length - 1 ? versionTags[i + 1] : null;
      
      const commits = getCommitsBetweenTags(nextTag, currentTag);
      
      if (commits.length > 0) {
        // Extrair versão da tag (remover 'v' prefix se existir)
        const version = currentTag.replace(/^v/, '');
        const releaseDate = commits[0]?.date || new Date().toISOString();
        
        releases.push({
          version,
          date: releaseDate.split('T')[0],
          commits,
        });
      }
    }

    // Adicionar commits não versionados (após a última tag)
    const unreleasedCommits = getCommitsBetweenTags(versionTags[0], 'HEAD');
    if (unreleasedCommits.length > 0) {
      releases.unshift({
        version: 'unreleased',
        date: unreleasedCommits[0]?.date.split('T')[0] || new Date().toISOString().split('T')[0],
        commits: unreleasedCommits,
      });
    }
  } else {
    // Sem tags, agrupar por data (últimos 30 dias ou todos se menos)
    const allCommits = getCommitsBetweenTags(null, 'HEAD');
    
    if (allCommits.length > 0) {
      // Agrupar por data
      const commitsByDate = {};
      allCommits.forEach(commit => {
        const date = commit.date.split('T')[0];
        if (!commitsByDate[date]) {
          commitsByDate[date] = [];
        }
        commitsByDate[date].push(commit);
      });

      // Criar releases por data (ordenado por data decrescente)
      Object.keys(commitsByDate)
        .sort((a, b) => b.localeCompare(a))
        .forEach(date => {
          releases.push({
            version: 'unreleased',
            date,
            commits: commitsByDate[date],
          });
        });
    }
  }

  const changelog = {
    version: currentVersion,
    generatedAt: new Date().toISOString(),
    releases,
  };

  fs.writeFileSync(changelogPath, JSON.stringify(changelog, null, 2), 'utf-8');
  console.log(`✅ Changelog gerado: ${releases.length} release(s) encontrada(s)`);
  console.log(`   Total de commits: ${releases.reduce((sum, r) => sum + r.commits.length, 0)}`);
}

// Executar
try {
  generateChangelog();
} catch (error) {
  console.error('❌ Erro ao gerar changelog:', error.message);
  process.exit(1);
}
