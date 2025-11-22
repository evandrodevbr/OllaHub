#!/usr/bin/env python3
"""
Script Python para scraping web com curl_cffi + BeautifulSoup
Pipeline: curl_cffi (Request HTTP) -> BeautifulSoup (Parsing) -> html2text (Formatação)
Comunica via JSON stdin/stdout com o backend Rust
"""

import sys
import json
import time
import logging
import traceback
from typing import List, Dict, Optional
from urllib.parse import urljoin, urlparse, quote
import random
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuração CRÍTICA de Encoding para Windows
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, Exception):
    pass

# Configuração de Logging para STDERR (Não polui o STDOUT)
logging.basicConfig(
    level=logging.INFO,
    format='[PYTHON LOG] %(message)s',
    stream=sys.stderr
)

def print_json(data):
    """Função auxiliar para garantir output limpo em JSON"""
    try:
        print(json.dumps(data, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as e:
        try:
            print(json.dumps({"type": "error", "message": f"Failed to format output: {str(e)}"}))
            sys.stdout.flush()
        except:
            pass

# Tentar importar dependências
CURL_CFFI_AVAILABLE = False
BS4_AVAILABLE = False
HTML2TEXT_AVAILABLE = False

try:
    from curl_cffi import requests
    CURL_CFFI_AVAILABLE = True
except ImportError as e:
    logging.error(f"curl_cffi não disponível: {e}")

try:
    from bs4 import BeautifulSoup
    BS4_AVAILABLE = True
except ImportError as e:
    logging.error(f"BeautifulSoup4 não disponível: {e}")

try:
    import html2text
    HTML2TEXT_AVAILABLE = True
except ImportError as e:
    logging.error(f"html2text não disponível: {e}")

# Pool de User Agents para parecer mais humano
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0",
]

def get_random_user_agent():
    """Retorna um user agent aleatório"""
    return random.choice(USER_AGENTS)

def clean_url(url: str) -> str:
    """Remove fragmentos e parâmetros de rastreamento da URL"""
    try:
        parsed = urlparse(url)
        return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    except:
        return url

def extract_domain(url: str) -> str:
    """Extrai o domínio de uma URL"""
    try:
        parsed = urlparse(url)
        return parsed.netloc
    except:
        return ""

def is_ad_or_tracker_url(url: str) -> bool:
    """Verifica se uma URL é de anúncio ou rastreador"""
    trackers = ['analytics', 'google-analytics', 'doubleclick', 'facebook.com/tr', 'ads.', 'banner', 'tracking']
    return any(tracker in url.lower() for tracker in trackers)

def is_domain_blocked(url: str, excluded_domains: List[str]) -> bool:
    """Verifica se o domínio da URL está na lista de exclusão"""
    domain = extract_domain(url)
    return any(excluded in domain for excluded in excluded_domains)

def scrape_url(url: str, visible: bool = False) -> Dict:
    """Função principal de scraping com curl_cffi + BeautifulSoup"""
    
    # Verificar dependências
    if not CURL_CFFI_AVAILABLE:
        return {
            "type": "error",
            "message": "curl_cffi não está instalado"
        }
    
    if not BS4_AVAILABLE:
        return {
            "type": "error",
            "message": "beautifulsoup4 não está instalado"
        }
    
    if not HTML2TEXT_AVAILABLE:
        return {
            "type": "error",
            "message": "html2text não está instalado"
        }
    
    try:
        logging.info(f"Iniciando requisição para: {url}")
        
        # Criar headers com curl_cffi (impersonate navegador)
        headers = {
            "User-Agent": get_random_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate",
            "DNT": "1",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        
        # Executar requisição com timeout
        try:
            response = requests.get(
                url,
                headers=headers,
                timeout=15,
                impersonate="chrome120",
                allow_redirects=True,
                follow_redirects=True
            )
            response.raise_for_status()
        except Exception as e:
            logging.error(f"Erro na requisição HTTP: {e}")
            return {
                "type": "error",
                "message": f"Failed to fetch URL: {str(e)}"
            }
        
        # Verificar se recebemos conteúdo HTML válido
        if len(response.content) < 100:
            return {
                "type": "error",
                "message": "Resposta muito curta (< 100 bytes)"
            }
        
        logging.info(f"Resposta recebida: {len(response.content)} bytes")
        
        # Parse com BeautifulSoup
        try:
            soup = BeautifulSoup(response.content, 'html.parser')
        except Exception as e:
            logging.error(f"Erro ao fazer parse HTML: {e}")
            return {
                "type": "error",
                "message": f"Failed to parse HTML: {str(e)}"
            }
        
        # Extrair título
        title = "Sem título"
        title_tag = soup.find('meta', property='og:title') or soup.find('meta', {'name': 'title'}) or soup.find('title')
        if title_tag:
            title = title_tag.get('content') or title_tag.string or title
        
        # Remover scripts e styles
        for script in soup(["script", "style", "meta", "link", "noscript"]):
            script.decompose()
        
        # Remover elementos desnecessários
        for elem in soup.find_all(["nav", "header", "footer", "aside", "ads"]):
            elem.decompose()
        
        # Extrair conteúdo principal
        main_content = None
        for selector in ['article', 'main', '[role="main"]', '.content', '.post', '.entry']:
            if selector.startswith('['):
                main_content = soup.select_one(selector)
            else:
                main_content = soup.find(selector)
            if main_content and len(main_content.get_text(strip=True)) > 200:
                break
        
        # Fallback: usar body
        if not main_content or len(main_content.get_text(strip=True)) < 200:
            main_content = soup.find('body') or soup
        
        # Obter HTML do conteúdo principal
        html_content = str(main_content) if main_content else str(soup)
        
        # Converter para Markdown usando html2text
        try:
            h = html2text.HTML2Text()
            h.ignore_links = False
            h.ignore_images = False
            h.body_width = 0
            markdown_content = h.handle(html_content)
        except Exception as e:
            logging.warning(f"Erro ao converter para markdown, usando texto plano: {e}")
            markdown_content = main_content.get_text(separator="\n") if main_content else response.text
        
        # Limpeza final
        lines = [line.strip() for line in markdown_content.split('\n') if line.strip()]
        final_content = '\n'.join(lines)
        
        # Validação de conteúdo
        if len(final_content) < 100:
            return {
                "type": "error",
                "message": f"Conteúdo insuficiente ({len(final_content)} chars)"
            }
        
        logging.info(f"Sucesso! {len(final_content)} chars extraídos")
        
        return {
            "type": "success",
            "url": clean_url(url),
            "title": title[:500],
            "content": final_content[:30000],
            "markdown": final_content[:30000]
        }
    
    except Exception as e:
        logging.error(f"Erro no scraping: {traceback.format_exc()}")
        return {
            "type": "error",
            "message": str(e)
        }

def search_duckduckgo(query: str, limit: int = 5) -> List[str]:
    """Realiza busca no DuckDuckGo e retorna URLs"""
    try:
        if not CURL_CFFI_AVAILABLE or not BS4_AVAILABLE:
            logging.error("Dependências não disponíveis")
            return []
        
        logging.info(f"Buscando no DuckDuckGo: {query}")
        
        headers = {
            "User-Agent": get_random_user_agent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        }
        
        search_url = f"https://duckduckgo.com/html/?q={quote(query)}"
        response = requests.get(
            search_url,
            headers=headers,
            timeout=15,
            impersonate="chrome120",
            allow_redirects=True
        )
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        urls = []
        # DuckDuckGo HTML retorna resultados em links diretos
        for result in soup.find_all('a', {'class': 'result__a'}):
            href = result.get('href')
            if href and not is_ad_or_tracker_url(href):
                urls.append(href)
                if len(urls) >= limit:
                    break
        
        logging.info(f"Encontradas {len(urls)} URLs")
        return urls
    
    except Exception as e:
        logging.error(f"Erro na busca DuckDuckGo: {e}")
        return []

def smart_search_impl(query: str, config: Dict) -> List[str]:
    """Implementa busca inteligente com categorias e filtros"""
    try:
        logging.info(f"Smart search iniciado: {query}")
        
        total_limit = config.get('total_sources_limit', 15)
        categories = config.get('categories', [])
        user_custom_sites = config.get('user_custom_sites', [])
        excluded_domains = config.get('excluded_domains', [])
        
        all_urls = []
        
        # 1. Busca geral no DuckDuckGo
        general_urls = search_duckduckgo(query, total_limit // 2)
        all_urls.extend(general_urls)
        
        # 2. Busca por categorias habilitadas
        for category in categories:
            if not category.get('enabled', False):
                continue
            
            base_sites = category.get('base_sites', [])
            for site in base_sites[:2]:  # Limitar a 2 sites por categoria
                site_query = f"site:{site} {query}"
                site_urls = search_duckduckgo(site_query, 3)
                all_urls.extend(site_urls)
        
        # 3. Busca em sites personalizados
        for custom_site in user_custom_sites[:3]:
            custom_query = f"site:{custom_site} {query}"
            custom_urls = search_duckduckgo(custom_query, 2)
            all_urls.extend(custom_urls)
        
        # 4. Filtrar domínios excluídos e remover duplicatas
        filtered_urls = []
        seen = set()
        for url in all_urls:
            if url not in seen and not is_domain_blocked(url, excluded_domains):
                filtered_urls.append(url)
                seen.add(url)
                if len(filtered_urls) >= total_limit:
                    break
        
        logging.info(f"Smart search concluído: {len(filtered_urls)} URLs")
        return filtered_urls
    
    except Exception as e:
        logging.error(f"Erro no smart search: {e}")
        return []

def scrape_urls_bulk_impl(urls: List[str]) -> List[Dict]:
    """Scraping em paralelo de múltiplas URLs"""
    try:
        logging.info(f"Scraping bulk iniciado: {len(urls)} URLs")
        
        results = []
        
        def scrape_with_logging(url):
            try:
                result = scrape_url(url, visible=False)
                if result.get('type') == 'success':
                    logging.info(f"✓ {url}")
                else:
                    logging.warning(f"✗ {url}: {result.get('message', 'unknown error')}")
                return result
            except Exception as e:
                logging.error(f"✗ {url}: {e}")
                return {"type": "error", "message": str(e), "url": url}
        
        # Scraping paralelo com até 5 workers
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_url = {executor.submit(scrape_with_logging, url): url for url in urls}
            for future in as_completed(future_to_url):
                try:
                    result = future.result()
                    if result.get('type') == 'success':
                        results.append(result)
                except Exception as e:
                    logging.error(f"Erro no future: {e}")
        
        logging.info(f"Scraping bulk concluído: {len(results)} sucessos")
        return results
    
    except Exception as e:
        logging.error(f"Erro no scraping bulk: {e}")
        return []

def main():
    """Entry point do script - lê comandos JSON do stdin"""
    try:
        # Ler JSON do stdin
        input_data = sys.stdin.read().strip()
        
        if not input_data:
            print_json({"type": "error", "message": "No input provided"})
            return
        
        # Parse JSON
        try:
            command_data = json.loads(input_data)
        except json.JSONDecodeError as e:
            logging.error(f"Erro ao fazer parse do JSON: {e}")
            print_json({"type": "error", "message": f"Invalid JSON: {str(e)}"})
            return
        
        command = command_data.get("command")
        logging.info(f"Comando recebido: {command}")
        
        # Dispatch de comandos
        if command == "scrape":
            url = command_data.get("url")
            visible = command_data.get("visible", False)
            
            if not url:
                print_json({"type": "error", "message": "URL missing"})
                return
            
            result = scrape_url(url, visible)
            print_json(result)
        
        elif command == "search_duckduckgo":
            query = command_data.get("query")
            limit = command_data.get("limit", 5)
            
            if not query:
                print_json({"type": "error", "message": "Query missing"})
                return
            
            urls = search_duckduckgo(query, limit)
            print_json({"type": "success", "urls": urls})
        
        elif command == "smart_search":
            query = command_data.get("query")
            config = command_data.get("config", {})
            
            if not query:
                print_json({"type": "error", "message": "Query missing"})
                return
            
            urls = smart_search_impl(query, config)
            print_json({"type": "success", "urls": urls})
        
        elif command == "search_and_scrape":
            query = command_data.get("query")
            config = command_data.get("config", {})
            
            if not query:
                print_json({"type": "error", "message": "Query missing"})
                return
            
            # Primeiro faz smart_search para obter URLs
            urls = smart_search_impl(query, config)
            
            if not urls:
                print_json({"type": "success", "results": []})
                return
            
            # Depois faz scraping das URLs
            results = scrape_urls_bulk_impl(urls)
            print_json({"type": "success", "results": results})
        
        elif command == "scrape_urls_bulk":
            urls = command_data.get("urls", [])
            
            if not urls:
                print_json({"type": "error", "message": "URLs missing"})
                return
            
            results = scrape_urls_bulk_impl(urls)
            print_json({"type": "success", "results": results})
        
        elif command == "check":
            # Verificar dependências
            missing = []
            if not CURL_CFFI_AVAILABLE:
                missing.append("curl_cffi")
            if not BS4_AVAILABLE:
                missing.append("beautifulsoup4")
            if not HTML2TEXT_AVAILABLE:
                missing.append("html2text")
            
            if missing:
                print_json({"type": "error", "message": f"Missing: {', '.join(missing)}"})
            else:
                print_json({"type": "success", "message": "All dependencies available"})
        
        else:
            print_json({"type": "error", "message": f"Unknown command: {command}"})
    
    except Exception as e:
        logging.error(f"Erro no main: {traceback.format_exc()}")
        print_json({"type": "error", "message": f"Critical error: {str(e)}"})

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print_json({"type": "error", "message": "Script interrupted"})
        sys.exit(1)
    except Exception as e:
        try:
            logging.error(f"Unhandled exception: {traceback.format_exc()}")
            print_json({"type": "error", "message": f"Unhandled exception: {str(e)}"})
        except:
            try:
                print(json.dumps({"type": "error", "message": "Critical failure"}))
            except:
                pass
        sys.exit(1)
