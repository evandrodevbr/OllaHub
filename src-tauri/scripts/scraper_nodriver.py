#!/usr/bin/env python3
"""
Micro-serviço Python para scraping com Nodriver (anti-detecção)
Pipeline:
1. Scraping: Nodriver (sem CDP, indetectável)
2. Fallback: curl_cffi se Nodriver falhar
"""

import sys
import json
import logging
import traceback
import random
import time
import os
import asyncio
from typing import Dict, Optional, Union, List
from urllib.parse import urljoin

# Bibliotecas de Scraping e Parsing
from bs4 import BeautifulSoup
import html2text

# Nodriver (anti-detecção)
try:
    import nodriver as uc
    HAS_NODRIVER = True
except ImportError:
    HAS_NODRIVER = False
    logging.warning("nodriver not installed, falling back to curl_cffi")

# curl_cffi como fallback
try:
    from curl_cffi import requests
    HAS_CURL_CFFI = True
except ImportError:
    HAS_CURL_CFFI = False

# Fallback libs
try:
    import requests as pyrequests
    HAS_PYREQUESTS = True
except ImportError:
    HAS_PYREQUESTS = False

# --- CONFIGURAÇÃO DO AMBIENTE ---

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except (AttributeError, Exception):
    pass

logging.basicConfig(
    level=logging.INFO,
    format='[PYTHON SCRAPER NODRIVER] %(levelname)s: %(message)s',
    stream=sys.stderr
)

# --- CONSTANTES E POOLS ---

UA_POOL_FALLBACK = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
]

REQUEST_TIMEOUT = 12  # Reduzido de 20 para 12s para maior velocidade
MAX_RETRIES = 2
NODRIVER_TIMEOUT = 10  # Timeout específico para nodriver (10s)

# --- FUNÇÕES AUXILIARES ---

def get_random_ua() -> str:
    return random.choice(UA_POOL_FALLBACK)

def random_jitter():
    """Adiciona jitter aleatório para evitar padrões"""
    time.sleep(random.uniform(0.1, 0.5))

def clean_html(soup: BeautifulSoup) -> BeautifulSoup:
    """Remove scripts, styles e outros elementos desnecessários"""
    for script in soup(["script", "style", "nav", "header", "footer", "aside", "noscript"]):
        script.decompose()
    return soup

def extract_main_content(soup: BeautifulSoup) -> BeautifulSoup:
    """Extrai conteúdo principal usando heurísticas"""
    # Tentar encontrar main, article, ou div com classe comum
    selectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.main-content',
        '#content',
        '#main',
    ]
    
    for selector in selectors:
        main = soup.select_one(selector)
        if main:
            return main
    
    # Fallback: retornar body
    return soup.find('body') or soup

def html_to_markdown(html: str) -> str:
    """Converte HTML para Markdown"""
    h = html2text.HTML2Text()
    h.ignore_links = False
    h.ignore_images = False
    h.body_width = 0
    return h.handle(html)

# --- SCRAPING COM NODRIVER ---

async def scrape_with_nodriver(url: str) -> Dict:
    """Scraping usando Nodriver (anti-detecção) - OTIMIZADO"""
    if not HAS_NODRIVER:
        return {"error": "nodriver not installed"}
    
    try:
        logging.info(f"[NODRIVER] Starting scrape for {url}")
        start_time = time.time()
        
        # Iniciar browser com Nodriver (sem CDP, indetectável)
        browser = await uc.start(headless=True)
        
        try:
            # Navegar para URL com timeout
            page = await asyncio.wait_for(
                browser.get(url),
                timeout=NODRIVER_TIMEOUT
            )
            
            # Aguardar conteúdo carregar com wait condicional otimizado
            # Tentar múltiplas estratégias de wait para reduzir tempo total
            try:
                # Estratégia 1: Aguardar DOMContentLoaded (mais rápido)
                await asyncio.wait_for(
                    page.wait_for_load_state('domcontentloaded'),
                    timeout=2.0
                )
            except asyncio.TimeoutError:
                # Se DOMContentLoaded demorar, usar sleep reduzido
                await asyncio.sleep(0.5)
            
            # Aguardar um pouco mais para JS executar (reduzido de 2s para 0.3s)
            await asyncio.sleep(0.3)
            
            # Extrair HTML
            html = await page.get_content()
            title = await page.evaluate('document.title')
            
            duration = time.time() - start_time
            logging.info(f"[NODRIVER] Successfully scraped {url} ({len(html)} chars, {duration:.2f}s)")
            
            return {
                "content": html,
                "title": title or "",
                "method": "nodriver"
            }
        finally:
            await browser.stop()
            
    except asyncio.TimeoutError:
        logging.warning(f"[NODRIVER] Timeout after {NODRIVER_TIMEOUT}s for {url}")
        return {"error": f"Timeout after {NODRIVER_TIMEOUT}s"}
    except Exception as e:
        logging.error(f"[NODRIVER] Error scraping {url}: {e}")
        return {"error": str(e)}

# --- SCRAPING COM CURL_CFFI (FALLBACK) ---

def scrape_with_curl_cffi(url: str) -> Dict:
    """Scraping usando curl_cffi como fallback - OTIMIZADO"""
    if not HAS_CURL_CFFI:
        return {"error": "curl_cffi not installed"}
    
    ua = get_random_ua()
    headers = {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
    
    try:
        # Timeout reduzido para fallback rápido
        response = requests.get(
            url,
            headers=headers,
            timeout=8,  # Reduzido de 15 para 8s
            impersonate="chrome120",
            allow_redirects=True
        )
        response.raise_for_status()
        
        if response.status_code in [403, 429, 503]:
            raise requests.RequestsError(f"Blocked with status {response.status_code}")
        
        return {
            "content": response.text,
            "title": "",
            "method": "curl_cffi",
            "headers": dict(response.headers)
        }
    except Exception as e:
        return {"error": str(e)}

# --- SCRAPING INTELIGENTE ---

async def scrape_url_smart(url: str) -> Dict:
    """Scraping inteligente: Nodriver (PRIMÁRIO) → curl_cffi (fallback) - OTIMIZADO"""
    # Jitter reduzido para maior velocidade
    await asyncio.sleep(random.uniform(0.05, 0.15))
    
    # Tentativa 1: Nodriver (PRIMÁRIO, anti-detecção)
    if HAS_NODRIVER:
        logging.info(f"[PRIMARY] Nodriver -> {url}")
        result = await scrape_with_nodriver(url)
        
        if "error" not in result:
            html_content = result["content"]
            # Verificar se não é página de bloqueio (mais permissivo para velocidade)
            if len(html_content) > 1000:  # Reduzido de 5000 para 1000 para aceitar mais resultados
                if "challenge-platform" not in html_content.lower() and "cloudflare" not in html_content.lower():
                    return result
                else:
                    logging.warning("[NODRIVER] Detectado desafio Cloudflare/WAF. Tentando fallback.")
            elif len(html_content) > 200:  # Aceitar conteúdo mínimo
                logging.info(f"[NODRIVER] Conteúdo mínimo mas aceitável ({len(html_content)} chars)")
                return result
    
    # Tentativa 2: curl_cffi (fallback rápido)
    if HAS_CURL_CFFI:
        logging.info(f"[FALLBACK] curl_cffi -> {url}")
        result = scrape_with_curl_cffi(url)
        
        if "error" not in result:
            html_content = result["content"]
            if len(html_content) > 1000:
                if "challenge-platform" not in html_content.lower() and "cloudflare" not in html_content.lower():
                    return result
    
    # Se ambos falharam, retornar erro
    return {"error": "All scraping methods failed"}

# --- PROCESSAMENTO HTML ---

async def process_scraped_content(url: str, result: Dict) -> Dict:
    """Processa conteúdo scraped e converte para markdown"""
    if "error" in result:
        return {"response_type": "error", "message": result["error"]}
    
    html_content = result.get("content", "")
    title = result.get("title", "")
    
    if not html_content:
        return {"response_type": "error", "message": "No content extracted"}
    
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
        
        return {
            "response_type": "success",
            "url": url,
            "title": title,
            "markdown": final_markdown,
            "content": final_markdown
        }
    except Exception as e:
        logging.error(f"Erro no processamento HTML: {traceback.format_exc()}")
        return {"response_type": "error", "message": f"Processing error: {str(e)}"}

# --- MAIN LOOP ---

def write_json_response(data: Dict):
    try:
        json_line = json.dumps(data, separators=(',', ':'), ensure_ascii=False)
        print(json_line)
        sys.stdout.flush()
    except Exception as e:
        logging.error(f"Erro enviando resposta JSON: {e}")

async def main():
    logging.info("Scraper/Search Service v5.0 (Nodriver Edition) Initialized")
    
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break
            if not line.strip():
                continue
            
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                write_json_response({"response_type": "error", "message": "Invalid JSON"})
                continue
            
            command = request.get("command")
            
            if command == "scrape":
                url = request.get("url")
                if url:
                    result = await scrape_url_smart(url)
                    processed = await process_scraped_content(url, result)
                    write_json_response(processed)
                else:
                    write_json_response({"response_type": "error", "message": "No URL provided"})
            else:
                write_json_response({"response_type": "error", "message": f"Unknown command: {command}"})
                
        except Exception as e:
            logging.error(f"Error in main loop: {traceback.format_exc()}")
            write_json_response({"response_type": "error", "message": str(e)})

if __name__ == "__main__":
    asyncio.run(main())
