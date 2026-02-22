#!/usr/bin/env python3
"""
Micro-serviço Python para scraping e busca
Pipeline:
1. Scraping: curl_cffi / Playwright Stealth
2. Busca: duckduckgo-search
"""

import sys
import json
import logging
import traceback
import random
import time
import os
import asyncio
from itertools import cycle
from typing import Dict, Optional, Union, List
from urllib.parse import urljoin

# Bibliotecas de Scraping e Parsing
from bs4 import BeautifulSoup
from curl_cffi import requests
import html2text

# DuckDuckGo Search
try:
    from duckduckgo_search import DDGS
    HAS_DDG = True
except ImportError:
    HAS_DDG = False

# Fallback libs
try:
    import requests as pyrequests
    HAS_PYREQUESTS = True
except ImportError:
    HAS_PYREQUESTS = False

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False

# Playwright & Anti-Detect
try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
    HAS_PLAYWRIGHT = True
except ImportError:
    HAS_PLAYWRIGHT = False

try:
    from fake_useragent import UserAgent
    ua_generator = UserAgent()
    HAS_FAKE_UA = True
except ImportError:
    HAS_FAKE_UA = False
    ua_generator = None

# --- CONFIGURAÇÃO DO AMBIENTE ---

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, Exception):
    pass

logging.basicConfig(
    level=logging.INFO,
    format='[PYTHON SCRAPER] %(levelname)s: %(message)s',
    stream=sys.stderr
)

# --- CONSTANTES E POOLS ---

UA_POOL_FALLBACK = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
]
ua_cycle = cycle(UA_POOL_FALLBACK)

REQUEST_TIMEOUT = 20
MAX_RETRIES = 2

PROXY_POOL = None
env_proxies = os.environ.get('SCRAPER_PROXIES') or os.environ.get('SCRAPER_HTTP_PROXIES')
if env_proxies:
    parts = [p.strip() for p in env_proxies.split(',') if p.strip()]
    if parts:
        PROXY_POOL = cycle(parts)

# --- FUNÇÕES AUXILIARES ---

def get_random_ua() -> str:
    if HAS_FAKE_UA:
        try:
            return ua_generator.random
        except Exception:
            pass
    return next(ua_cycle)

def generate_consistent_headers(user_agent: str) -> Dict[str, str]:
    base_headers = {
        'User-Agent': user_agent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    }
    if 'Chrome' in user_agent:
        try:
            version = user_agent.split('Chrome/')[1].split('.')[0]
        except IndexError:
            version = "120"
        base_headers.update({
            'sec-ch-ua': f'"Chromium";v="{version}", "Google Chrome";v="{version}", "Not-A.Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"' if 'Windows' in user_agent else ('"macOS"' if 'Macintosh' in user_agent else '"Linux"')
        })
    return base_headers

def get_proxy_dict() -> Optional[Dict[str, str]]:
    if PROXY_POOL:
        proxy = next(PROXY_POOL)
        return {"http": proxy, "https": proxy}
    return None

def random_jitter(min_sec=0.5, max_sec=2.0):
    time.sleep(random.uniform(min_sec, max_sec))

# --- LIMPEZA E EXTRAÇÃO ---

def clean_html(soup: BeautifulSoup) -> BeautifulSoup:
    for tag in soup(["script", "style", "meta", "link", "noscript", "iframe", "object", "embed", "applet", "canvas", "svg"]):
        tag.decompose()
    for tag in soup.find_all(["nav", "header", "footer", "aside", "menu", "dialog"]):
        tag.decompose()
    ad_keywords = ["ads", "advertisement", "banner", "ad-", "popup", "modal", "cookie", "subscription", "newsletter", "share", "social", "sidebar", "promo", "sponsor"]
    selectors_to_remove = ['.ad', '.advertisement', '[class*="ad-"]', '[id*="ad-"]', '[id*="cookie"]', '[class*="cookie"]', '.share-buttons', '.social-media', '.comments-section', '#comments']
    for selector in selectors_to_remove:
        for tag in soup.select(selector):
            tag.decompose()
    def is_ad(tag):
        if not tag.name: return False
        attrs = str(tag.attrs).lower()
        return any(k in attrs for k in ad_keywords)
    for tag in soup.find_all(is_ad):
        tag.decompose()
    return soup

def extract_main_content(soup: BeautifulSoup) -> BeautifulSoup:
    selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '#content', '.content', '.entry-content', '.page-content']
    for selector in selectors:
        found = soup.select_one(selector)
        if found and len(found.get_text(strip=True)) > 200:
            return found
    body = soup.find('body')
    return body if body else soup

def html_to_markdown(html_content: str) -> str:
    try:
        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = False
        h.images_to_alt = True
        h.body_width = 0
        h.protect_links = True
        return h.handle(html_content)
    except Exception as e:
        logging.warning(f"Erro na conversão Markdown: {e}")
        return html_content

# --- ESTRATÉGIAS DE SCRAPING ---

async def scrape_with_playwright(url: str) -> Dict:
    if not HAS_PLAYWRIGHT:
        return {"error": "Playwright not installed"}
    logging.info(f"[PLAYWRIGHT] Iniciando scraping stealth para: {url}")
    async with async_playwright() as p:
        args = ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox', '--disable-setuid-sandbox', '--disable-infobars', '--window-size=1920,1080', '--start-maximized']
        try:
            browser = await p.chromium.launch(headless=True, args=args)
            ua = get_random_ua()
            context = await browser.new_context(user_agent=ua, viewport={'width': 1920, 'height': 1080}, locale='pt-BR', timezone_id='America/Sao_Paulo', java_script_enabled=True, ignore_https_errors=True)
            await context.add_init_script("""
                Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                window.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
            """)
            page = await context.new_page()
            try:
                await page.goto(url, wait_until='domcontentloaded', timeout=25000)
                await page.wait_for_timeout(2000) 
            except PlaywrightTimeoutError:
                logging.warning(f"[PLAYWRIGHT] Timeout carregando {url}")
            content = await page.content()
            title = await page.title()
            await browser.close()
            return {"content": content, "title": title, "method": "playwright"}
        except Exception as e:
            logging.error(f"[PLAYWRIGHT] Erro fatal: {e}")
            return {"error": str(e)}

def scrape_with_curl_cffi(url: str) -> Dict:
    ua = get_random_ua()
    headers = generate_consistent_headers(ua)
    proxies = get_proxy_dict()
    try:
        response = requests.get(url, headers=headers, proxies=proxies, timeout=15, impersonate="chrome120", allow_redirects=True)
        response.raise_for_status()
        if response.status_code in [403, 429, 503]:
            raise requests.RequestsError(f"Blocked with status {response.status_code}")
        return {"content": response.text, "title": "", "method": "curl_cffi", "headers": response.headers}
    except Exception as e:
        return {"error": str(e)}

async def scrape_url_smart(url: str) -> Dict:
    random_jitter()
    logging.info(f"Tentativa 1: curl_cffi -> {url}")
    result = scrape_with_curl_cffi(url)
    html_content = None
    title = ""
    if "error" not in result:
        html_content = result["content"]
        if "challenge-platform" in html_content or "Cloudflare" in html_content and len(html_content) < 5000:
            logging.warning("Detectado desafio Cloudflare/WAF no curl_cffi. Acionando fallback.")
            html_content = None
    if not html_content:
        if HAS_PLAYWRIGHT:
            logging.info(f"Tentativa 2: Playwright Stealth -> {url}")
            pw_result = await scrape_with_playwright(url)
            if "error" not in pw_result:
                html_content = pw_result["content"]
                title = pw_result.get("title", "")
            else:
                logging.error(f"Playwright falhou: {pw_result['error']}")
        else:
            logging.warning("Playwright não disponível para fallback.")
    if html_content:
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            if not title:
                title = soup.title.string.strip() if soup.title else url
            soup = clean_html(soup)
            main_content = extract_main_content(soup)
            cleaned_html = str(main_content)
            markdown_text = html_to_markdown(cleaned_html)
            final_markdown = '\n'.join([line.strip() for line in markdown_text.split('\n') if line.strip()])
            if len(final_markdown) < 50:
                return {"response_type": "error", "message": "Conteúdo insuficiente após processamento."}
            return {"response_type": "success", "url": url, "title": title, "markdown": final_markdown, "content": final_markdown}
        except Exception as e:
            logging.error(f"Erro no processamento HTML: {traceback.format_exc()}")
            return {"response_type": "error", "message": f"Processing error: {str(e)}"}
    return {"response_type": "error", "message": f"Falha em todos os métodos de scraping. Erro inicial: {result.get('error', 'Unknown')}"}

# --- DUCKDUCKGO SEARCH LOGIC ---

async def search_duckduckgo(keywords: str, region: str = "wt-wt", safesearch: str = "moderate", max_results: int = 10) -> Dict:
    if not HAS_DDG:
        return {"response_type": "error", "message": "duckduckgo-search module not installed"}
    
    logging.info(f"Searching DuckDuckGo: {keywords} (region={region}, safe={safesearch})")
    
    try:
        results_list = []
        # DDGS is synchronous, run in thread executor to avoid blocking async loop if needed
        # But since this script main loop is simple, direct call is fine, or wrap in to_thread
        
        with DDGS() as ddgs:
            # ddgs.text() is a generator
            ddg_gen = ddgs.text(
                keywords=keywords,
                region=region,
                safesearch=safesearch,
                max_results=max_results
            )
            
            for r in ddg_gen:
                results_list.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "content": r.get("body", ""),
                    "engine": "duckduckgo",
                    "score": 1.0
                })
                
        return {
            "response_type": "success",
            "query": keywords,
            "results": results_list,
            "number_of_results": len(results_list)
        }
        
    except Exception as e:
        logging.error(f"DuckDuckGo Search Error: {e}")
        return {"response_type": "error", "message": str(e)}

# --- MAIN ---

def write_json_response(data: Dict):
    try:
        json_line = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
        print(json_line)
        sys.stdout.flush()
    except Exception as e:
        logging.error(f"Erro enviando resposta JSON: {e}")

def main():
    logging.info("Scraper/Search Service v4.0 (DuckDuckGo Edition) Initialized")
    while True:
        try:
            line = sys.stdin.readline()
            if not line: break
            if not line.strip(): continue
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                write_json_response({"response_type": "error", "message": "Invalid JSON"})
                continue
            
            command = request.get("command")
            
            if command == "scrape":
                url = request.get("url")
                if url:
                    result = asyncio.run(scrape_url_smart(url))
                    write_json_response(result)
                else:
                    write_json_response({"response_type": "error", "message": "No URL provided"})
            
            elif command == "search":
                # Generic search command, implemented via DuckDuckGo
                keywords = request.get("keywords") or request.get("query")
                region = request.get("region", "wt-wt")
                safesearch = request.get("safesearch", "moderate")
                max_results = request.get("max_results", 10)
                
                if keywords:
                    result = asyncio.run(search_duckduckgo(keywords, region, safesearch, max_results))
                    write_json_response(result)
                else:
                    write_json_response({"response_type": "error", "message": "Missing keywords"})
                    
            elif command == "ping":
                write_json_response({"response_type": "pong"})
            else:
                write_json_response({"response_type": "error", "message": "Unknown command"})
        except KeyboardInterrupt:
            break
        except Exception as e:
            logging.critical(f"Fatal error in main loop: {e}")
            write_json_response({"response_type": "error", "message": str(e)})

if __name__ == "__main__":
    main()
