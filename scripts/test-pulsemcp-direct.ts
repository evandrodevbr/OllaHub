#!/usr/bin/env tsx

async function testPulseMCPDirect() {
  console.log("🔍 Testando PulseMCP API diretamente...");

  try {
    const url =
      "https://api.pulsemcp.com/v0beta/servers?count_per_page=5&offset=0";

    console.log(`📡 Fazendo requisição para: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Ollahub-MCP-Client/1.0 (https://ollahub.com)",
        "Content-Type": "application/json",
      },
    });

    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    console.log(`📋 Headers:`, Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Erro ${response.status}:`, errorText);
      return;
    }

    const data = await response.json();
    console.log(`✅ Sucesso! Total de servidores: ${data.total_count}`);
    console.log(`📋 Primeiros 3 servidores:`);

    data.servers.slice(0, 3).forEach((server: any, index: number) => {
      console.log(`   ${index + 1}. ${server.name}`);
      console.log(`      - Package: ${server.package_name || "N/A"}`);
      console.log(`      - Registry: ${server.package_registry || "N/A"}`);
      console.log(`      - Stars: ${server.github_stars || 0}`);
    });
  } catch (error) {
    console.error("❌ Erro na requisição:", error);
  }
}

testPulseMCPDirect()
  .then(() => {
    console.log("🎉 Teste concluído");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Erro fatal:", error);
    process.exit(1);
  });
