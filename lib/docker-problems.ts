export interface ProblemSolution {
  id: string;
  problem: string; // Texto exato ou padrão para matching
  os: 'windows' | 'linux' | 'macos' | 'all';
  links: Array<{
    title: string;
    url: string;
  }>;
  commands?: {
    title: string;
    code: string;
    description?: string;
  }[];
  description?: string;
}

export const PROBLEM_SOLUTIONS: ProblemSolution[] = [
  // ========== WINDOWS ==========
  {
    id: 'windows-build-old',
    problem: 'Windows build',
    os: 'windows',
    description: 'Versão do Windows muito antiga. É necessário Windows 10 20H1 (build 19041) ou superior, ou Windows 11.',
    links: [
      {
        title: 'Instalar Atualizações do Windows',
        url: 'https://support.microsoft.com/windows/install-windows-updates-3c5ae7fc-9fb6-9af1-1984-b5e0412c556a'
      },
      {
        title: 'Baixar Windows 10',
        url: 'https://www.microsoft.com/software-download/windows10'
      },
      {
        title: 'Baixar Windows 11',
        url: 'https://www.microsoft.com/software-download/windows11'
      }
    ],
    commands: [
      {
        title: 'Verificar build atual',
        code: '[System.Environment]::OSVersion.Version',
        description: 'Execute no PowerShell para verificar a versão atual do Windows'
      }
    ]
  },
  {
    id: 'windows-vm-platform',
    problem: 'VirtualMachinePlatform não habilitado',
    os: 'windows',
    description: 'A plataforma de máquina virtual precisa estar habilitada para suportar WSL 2.',
    links: [
      {
        title: 'Microsoft Learn - WSL Manual Install',
        url: 'https://learn.microsoft.com/windows/wsl/install-manual'
      }
    ],
    commands: [
      {
        title: 'Habilitar VirtualMachinePlatform (PowerShell como Administrador)',
        code: 'dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart',
        description: 'Execute no PowerShell como Administrador. Reinicie o sistema após a execução.'
      }
    ]
  },
  {
    id: 'windows-wsl-not-enabled',
    problem: 'WSL não habilitado',
    os: 'windows',
    description: 'Windows Subsystem for Linux precisa estar habilitado para executar Docker no Windows.',
    links: [
      {
        title: 'Microsoft Learn - Instalar WSL',
        url: 'https://learn.microsoft.com/windows/wsl/install'
      },
      {
        title: 'Microsoft Learn - WSL Manual',
        url: 'https://learn.microsoft.com/windows/wsl/install-manual'
      }
    ],
    commands: [
      {
        title: 'Habilitar WSL (PowerShell como Administrador)',
        code: 'dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart',
        description: 'Execute no PowerShell como Administrador. Reinicie o sistema após a execução.'
      }
    ]
  },
  {
    id: 'windows-wsl2-not-configured',
    problem: 'WSL 2 não configurado',
    os: 'windows',
    description: 'WSL 2 precisa ser configurado como versão padrão do WSL.',
    links: [
      {
        title: 'Microsoft Learn - Instalar WSL',
        url: 'https://learn.microsoft.com/windows/wsl/install'
      },
      {
        title: 'Microsoft Learn - WSL Manual',
        url: 'https://learn.microsoft.com/windows/wsl/install-manual'
      }
    ],
    commands: [
      {
        title: 'Configurar WSL 2 como padrão',
        code: 'wsl --set-default-version 2',
        description: 'Execute após habilitar WSL e VirtualMachinePlatform e reiniciar o sistema.'
      },
      {
        title: 'Comandos completos (PowerShell como Administrador)',
        code: `# Habilitar WSL
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

# Habilitar Virtual Machine Platform
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# Reiniciar e depois definir WSL 2 como padrão
wsl --set-default-version 2`,
        description: 'Execute todos os comandos em sequência. Reinicie após os dois primeiros comandos.'
      }
    ]
  },
  {
    id: 'windows-ram-insufficient',
    problem: 'RAM insuficiente',
    os: 'windows',
    description: 'Sistema requer no mínimo 4GB de RAM para executar Docker no Windows.',
    links: [
      {
        title: 'Adicionar mais memória ao computador',
        url: 'https://support.microsoft.com/windows/add-more-memory-to-your-computer-0f7e2d8a-d2c9-c858-5dca-8d3b3759a0ff'
      }
    ],
    commands: [
      {
        title: 'Verificar processos consumindo mais memória',
        code: 'Get-Process | Sort-Object -Property WS -Descending | Select-Object -First 10',
        description: 'Lista os 10 processos que mais consomem memória. Feche aplicativos desnecessários.'
      }
    ]
  },
  {
    id: 'windows-disk-insufficient',
    problem: 'Espaço em disco insuficiente',
    os: 'windows',
    description: 'É necessário pelo menos 10GB de espaço livre em disco para instalar e executar Docker.',
    links: [
      {
        title: 'Liberar espaço em disco no Windows',
        url: 'https://support.microsoft.com/windows/free-up-drive-space-in-windows-85529ccb-c365-490d-b548-831022bc9b32'
      }
    ],
    commands: [
      {
        title: 'Abrir Limpeza de Disco',
        code: 'cleanmgr.exe',
        description: 'Abre a ferramenta de limpeza de disco do Windows.'
      }
    ]
  },
  {
    id: 'windows-cpu-cores',
    problem: 'CPU cores insuficientes',
    os: 'windows',
    description: 'Recomenda-se pelo menos 2 cores de CPU para melhor desempenho.',
    commands: [
      {
        title: 'Verificar número de cores lógicos',
        code: '(Get-WmiObject Win32_Processor).NumberOfLogicalProcessors',
        description: 'Mostra o número de processadores lógicos disponíveis.'
      }
    ]
  },

  // ========== LINUX ==========
  {
    id: 'linux-kernel-old',
    problem: 'Kernel',
    os: 'linux',
    description: 'Kernel Linux muito antigo. É necessário kernel 3.10 ou superior para executar Docker.',
    links: [
      {
        title: 'Ubuntu/Debian - Gerenciamento de Pacotes',
        url: 'https://ubuntu.com/server/docs/package-management'
      },
      {
        title: 'Arch/Manjaro - Kernel',
        url: 'https://wiki.archlinux.org/title/Kernel'
      },
      {
        title: 'Fedora/RHEL - Kernel',
        url: 'https://docs.fedoraproject.org/en-US/quick-docs/kernel/'
      }
    ],
    commands: [
      {
        title: 'Ubuntu/Debian - Atualizar sistema e kernel',
        code: `sudo apt update && sudo apt upgrade -y
sudo apt install linux-generic`,
        description: 'Atualiza todos os pacotes e instala o kernel genérico mais recente.'
      },
      {
        title: 'Arch/Manjaro - Atualizar kernel',
        code: 'sudo pacman -Syu linux',
        description: 'Atualiza o sistema e o kernel.'
      },
      {
        title: 'Fedora - Atualizar kernel',
        code: 'sudo dnf upgrade kernel',
        description: 'Atualiza o kernel para a versão mais recente.'
      }
    ]
  },
  {
    id: 'linux-curl-missing',
    problem: 'Pacote curl não instalado',
    os: 'linux',
    description: 'O pacote curl é necessário para baixar arquivos e chaves GPG durante a instalação do Docker.',
    links: [
      {
        title: 'curl.se - Download oficial',
        url: 'https://curl.se/download.html'
      },
      {
        title: 'Ubuntu packages - curl',
        url: 'https://packages.ubuntu.com/search?keywords=curl'
      }
    ],
    commands: [
      {
        title: 'Ubuntu/Debian',
        code: 'sudo apt update && sudo apt install curl',
        description: 'Instala curl no Ubuntu ou Debian.'
      },
      {
        title: 'Arch/Manjaro',
        code: 'sudo pacman -S curl',
        description: 'Instala curl no Arch Linux ou Manjaro.'
      },
      {
        title: 'Fedora/RHEL',
        code: 'sudo dnf install curl',
        description: 'Instala curl no Fedora ou RHEL.'
      },
      {
        title: 'openSUSE',
        code: 'sudo zypper install curl',
        description: 'Instala curl no openSUSE.'
      }
    ]
  },
  {
    id: 'linux-ca-certificates-missing',
    problem: 'Pacote ca-certificates não instalado',
    os: 'linux',
    description: 'Certificados CA são necessários para verificar conexões HTTPS seguras.',
    links: [
      {
        title: 'Ubuntu packages - ca-certificates',
        url: 'https://packages.ubuntu.com/search?keywords=ca-certificates'
      },
      {
        title: 'Debian wiki - ca-certificates',
        url: 'https://wiki.debian.org/ca-certificates'
      }
    ],
    commands: [
      {
        title: 'Ubuntu/Debian',
        code: 'sudo apt update && sudo apt install ca-certificates',
        description: 'Instala certificados CA no Ubuntu ou Debian.'
      },
      {
        title: 'Arch/Manjaro',
        code: 'sudo pacman -S ca-certificates',
        description: 'Instala certificados CA no Arch Linux ou Manjaro.'
      },
      {
        title: 'Fedora/RHEL',
        code: 'sudo dnf install ca-certificates',
        description: 'Instala certificados CA no Fedora ou RHEL.'
      },
      {
        title: 'openSUSE',
        code: 'sudo zypper install ca-certificates',
        description: 'Instala certificados CA no openSUSE.'
      }
    ]
  },
  {
    id: 'linux-gnupg-missing',
    problem: 'Pacote gnupg não instalado',
    os: 'linux',
    description: 'GnuPG é necessário para verificar chaves GPG durante a instalação do Docker.',
    links: [
      {
        title: 'GnuPG oficial - Download',
        url: 'https://gnupg.org/download/'
      },
      {
        title: 'Ubuntu packages - gnupg',
        url: 'https://packages.ubuntu.com/search?keywords=gnupg'
      }
    ],
    commands: [
      {
        title: 'Ubuntu/Debian',
        code: 'sudo apt update && sudo apt install gnupg',
        description: 'Instala GnuPG no Ubuntu ou Debian.'
      },
      {
        title: 'Arch/Manjaro',
        code: 'sudo pacman -S gnupg',
        description: 'Instala GnuPG no Arch Linux ou Manjaro.'
      },
      {
        title: 'Fedora/RHEL',
        code: 'sudo dnf install gnupg',
        description: 'Instala GnuPG no Fedora ou RHEL.'
      },
      {
        title: 'openSUSE',
        code: 'sudo zypper install gpg2',
        description: 'Instala GnuPG no openSUSE.'
      }
    ]
  },
  {
    id: 'linux-sudo-missing',
    problem: 'Privilégios sudo necessários',
    os: 'linux',
    description: 'Privilégios de administrador são necessários para instalar pacotes e configurar o sistema.',
    links: [
      {
        title: 'Ubuntu - RootSudo',
        url: 'https://help.ubuntu.com/community/RootSudo'
      },
      {
        title: 'Arch Linux - Sudo',
        url: 'https://wiki.archlinux.org/title/Sudo'
      }
    ],
    commands: [
      {
        title: 'Adicionar usuário ao grupo sudo (Ubuntu/Debian)',
        code: 'sudo usermod -aG sudo $USER',
        description: 'Adiciona o usuário atual ao grupo sudo. Faça logout e login novamente para aplicar.'
      },
      {
        title: 'Adicionar ao grupo wheel (Arch/Fedora)',
        code: 'sudo usermod -aG wheel $USER',
        description: 'Adiciona o usuário atual ao grupo wheel. Faça logout e login novamente para aplicar.'
      }
    ]
  },
  {
    id: 'linux-ram-insufficient',
    problem: 'RAM insuficiente',
    os: 'linux',
    description: 'Sistema requer no mínimo 2GB de RAM para executar Docker.',
    commands: [
      {
        title: 'Verificar processos consumindo mais memória',
        code: 'top',
        description: 'Mostra processos em tempo real. Pressione "q" para sair.'
      },
      {
        title: 'Verificar processos (htop - se instalado)',
        code: 'htop',
        description: 'Interface mais amigável. Instale com: sudo apt install htop (Ubuntu/Debian)'
      },
      {
        title: 'Verificar uso de memória',
        code: 'free -h',
        description: 'Mostra uso de memória em formato legível.'
      }
    ]
  },
  {
    id: 'linux-disk-insufficient',
    problem: 'Espaço em disco insuficiente',
    os: 'linux',
    description: 'É necessário pelo menos 10GB de espaço livre em disco.',
    commands: [
      {
        title: 'Verificar espaço em disco',
        code: 'df -h',
        description: 'Mostra espaço usado e disponível em todos os sistemas de arquivos.'
      },
      {
        title: 'Verificar diretórios ocupando mais espaço',
        code: 'du -h --max-depth=1 / | sort -hr | head -10',
        description: 'Lista os 10 diretórios que mais ocupam espaço (execute com sudo para resultados completos).'
      },
      {
        title: 'Limpar cache de pacotes (Ubuntu/Debian)',
        code: 'sudo apt clean && sudo apt autoremove',
        description: 'Remove pacotes antigos e cache para liberar espaço.'
      }
    ]
  },
  {
    id: 'linux-cpu-cores',
    problem: 'CPU cores insuficientes',
    os: 'linux',
    description: 'Recomenda-se pelo menos 2 cores de CPU para melhor desempenho.',
    commands: [
      {
        title: 'Verificar número de cores',
        code: 'nproc',
        description: 'Mostra o número de processadores disponíveis.'
      },
      {
        title: 'Informações detalhadas da CPU',
        code: 'lscpu | grep "^CPU(s):"',
        description: 'Mostra informações detalhadas sobre a CPU.'
      }
    ]
  },

  // ========== macOS ==========
  {
    id: 'macos-version-old',
    problem: 'macOS',
    os: 'macos',
    description: 'Versão do macOS muito antiga. Recomenda-se macOS 11 (Big Sur) ou superior.',
    links: [
      {
        title: 'Apple - Atualizar macOS',
        url: 'https://support.apple.com/HT201541'
      },
      {
        title: 'Apple - Como atualizar',
        url: 'https://support.apple.com/guide/mac-help/update-macos-mchlpx1065'
      }
    ]
  },
  {
    id: 'macos-homebrew-missing',
    problem: 'Homebrew não instalado',
    os: 'macos',
    description: 'Homebrew é recomendado para facilitar a instalação do Docker no macOS.',
    links: [
      {
        title: 'Homebrew oficial',
        url: 'https://brew.sh/'
      }
    ],
    commands: [
      {
        title: 'Instalar Homebrew (Intel e Apple Silicon)',
        code: '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        description: 'Instala Homebrew. Siga as instruções na tela.'
      },
      {
        title: 'Configurar PATH para Apple Silicon (após instalação)',
        code: `echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"`,
        description: 'Adiciona Homebrew ao PATH em Macs com Apple Silicon (M1/M2/M3).'
      }
    ]
  },
  {
    id: 'macos-rosetta-missing',
    problem: 'Rosetta 2 não instalado',
    os: 'macos',
    description: 'Rosetta 2 é necessário para executar aplicativos x86_64 em Macs com Apple Silicon.',
    links: [
      {
        title: 'Apple - Rosetta 2',
        url: 'https://support.apple.com/HT211861'
      },
      {
        title: 'Apple Developer - Rosetta',
        url: 'https://developer.apple.com/documentation/apple-silicon/about-the-rosetta-translation-environment'
      }
    ],
    commands: [
      {
        title: 'Instalar Rosetta 2',
        code: 'softwareupdate --install-rosetta --agree-to-license',
        description: 'Instala Rosetta 2. Pode solicitar confirmação.'
      },
      {
        title: 'Verificar se Rosetta está instalado',
        code: 'ls /Library/Apple/usr/share/rosetta',
        description: 'Verifica se Rosetta 2 está instalado. Se o diretório existir, está instalado.'
      },
      {
        title: 'Testar execução x86_64',
        code: 'arch -x86_64 uname -m',
        description: 'Deve retornar "x86_64" se Rosetta estiver funcionando.'
      }
    ]
  },
  {
    id: 'macos-ram-insufficient',
    problem: 'RAM insuficiente',
    os: 'macos',
    description: 'Sistema requer no mínimo 4GB de RAM para executar Docker no macOS.',
    links: [
      {
        title: 'Apple - Memória Mac',
        url: 'https://support.apple.com/mac/memory'
      }
    ],
    commands: [
      {
        title: 'Verificar processos consumindo mais memória',
        code: 'top -o MEM',
        description: 'Mostra processos ordenados por uso de memória. Pressione "q" para sair.'
      },
      {
        title: 'Abrir Monitor de Atividade',
        code: 'open -a "Activity Monitor"',
        description: 'Abre o Monitor de Atividade do macOS.'
      }
    ]
  },
  {
    id: 'macos-disk-insufficient',
    problem: 'Espaço em disco insuficiente',
    os: 'macos',
    description: 'É necessário pelo menos 4GB de espaço livre em disco.',
    links: [
      {
        title: 'Apple - Liberar espaço de armazenamento',
        url: 'https://support.apple.com/guide/mac-help/free-up-storage-space-mh31934'
      }
    ],
    commands: [
      {
        title: 'Abrir Gerenciamento de Armazenamento',
        code: 'open "x-apple.systempreferences:com.apple.preference.storage"',
        description: 'Abre as preferências de armazenamento do macOS.'
      }
    ]
  },
  {
    id: 'macos-cpu-cores',
    problem: 'CPU cores insuficientes',
    os: 'macos',
    description: 'Recomenda-se pelo menos 2 cores de CPU para melhor desempenho.',
    commands: [
      {
        title: 'Verificar número de cores',
        code: 'sysctl -n hw.ncpu',
        description: 'Mostra o número de cores de CPU disponíveis.'
      }
    ]
  },

  // ========== GERAL ==========
  {
    id: 'os-not-supported',
    problem: 'Sistema operacional não suportado',
    os: 'all',
    description: 'Este sistema operacional não é suportado. Docker requer Windows, Linux ou macOS.',
    links: [
      {
        title: 'Docker - Requisitos do Sistema',
        url: 'https://docs.docker.com/desktop/supported-platforms/'
      }
    ]
  }
];

/**
 * Encontra a solução correspondente para um problema
 * @param problemText Texto do problema retornado pela verificação
 * @param os Sistema operacional atual
 * @returns Solução correspondente ou null se não encontrada
 */
export function findProblemSolution(problemText: string, os: string): ProblemSolution | null {
  const normalizedProblem = problemText.toLowerCase();
  const normalizedOs = os.toLowerCase();

  // Buscar por matching exato primeiro
  let solution = PROBLEM_SOLUTIONS.find(s => {
    const matchesOs = s.os === 'all' || s.os === normalizedOs || 
                      (normalizedOs === 'mac' && s.os === 'macos') ||
                      (normalizedOs === 'windows' && s.os === 'windows') ||
                      (normalizedOs === 'linux' && s.os === 'linux');
    
    if (!matchesOs) return false;
    
    const problemLower = s.problem.toLowerCase();
    return normalizedProblem.includes(problemLower) || problemLower.includes(normalizedProblem);
  });

  // Se não encontrou, tentar matching parcial por palavras-chave
  if (!solution) {
    const keywords: { [key: string]: string } = {
      'windows build': 'windows-build-old',
      'virtualmachineplatform': 'windows-vm-platform',
      'wsl não habilitado': 'windows-wsl-not-enabled',
      'wsl 2 não configurado': 'windows-wsl2-not-configured',
      'ram insuficiente': normalizedOs === 'windows' ? 'windows-ram-insufficient' : 
                         normalizedOs === 'mac' || normalizedOs === 'macos' ? 'macos-ram-insufficient' : 
                         'linux-ram-insufficient',
      'espaço em disco': normalizedOs === 'windows' ? 'windows-disk-insufficient' : 
                        normalizedOs === 'mac' || normalizedOs === 'macos' ? 'macos-disk-insufficient' : 
                        'linux-disk-insufficient',
      'cpu cores': normalizedOs === 'windows' ? 'windows-cpu-cores' : 
                   normalizedOs === 'mac' || normalizedOs === 'macos' ? 'macos-cpu-cores' : 
                   'linux-cpu-cores',
      'kernel': 'linux-kernel-old',
      'pacote curl': 'linux-curl-missing',
      'pacote ca-certificates': 'linux-ca-certificates-missing',
      'pacote gnupg': 'linux-gnupg-missing',
      'privilégios sudo': 'linux-sudo-missing',
      'homebrew': 'macos-homebrew-missing',
      'rosetta': 'macos-rosetta-missing',
      'sistema operacional não suportado': 'os-not-supported'
    };

    for (const [keyword, id] of Object.entries(keywords)) {
      if (normalizedProblem.includes(keyword)) {
        solution = PROBLEM_SOLUTIONS.find(s => s.id === id);
        if (solution) break;
      }
    }
  }

  return solution || null;
}
