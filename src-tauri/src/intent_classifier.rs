use regex::Regex;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum QueryIntent {
    Factual,        // Requer busca web (fatos, notícias, dados atualizados)
    Conversational, // Não requer busca (saudações, conversa)
    Technical,      // Pode requerer busca (documentação, tutoriais)
    Opinion,        // Não requer busca (opiniões, subjetivo)
    Calculation,    // Não requer busca (cálculos, matemática)
    Unknown,        // Fallback
}

pub struct IntentClassifier;

impl IntentClassifier {
    /// Classifica a intenção de uma query usando heurísticas baseadas em palavras-chave
    pub fn classify(query: &str) -> QueryIntent {
        if query.is_empty() {
            return QueryIntent::Unknown;
        }

        let query_lower = query.to_lowercase();
        let query_normalized = Self::normalize_query(&query_lower);

        // Scoring para cada intent
        let mut scores: std::collections::HashMap<QueryIntent, i32> = std::collections::HashMap::new();
        scores.insert(QueryIntent::Factual, 0);
        scores.insert(QueryIntent::Conversational, 0);
        scores.insert(QueryIntent::Technical, 0);
        scores.insert(QueryIntent::Opinion, 0);
        scores.insert(QueryIntent::Calculation, 0);

        // Padrões para Factual
        let factual_patterns = vec![
            r"\b(o que|que|qual|quais|quem|onde|quando)\b",
            r"\b(what|which|who|where|when)\b",
            r"\b(como funciona|how does|how works)\b",
            r"\b(preço|price|preco|custo|cost)\b",
            r"\b(notícia|noticia|news|notícias|noticias)\b",
            r"\b(hoje|today|agora|now|atual|current)\b",
            r"\b(último|ultimo|última|ultima|latest|recent)\b",
            r"\b(história|historia|history|origem|origin)\b",
            r"\b(é|e|is|are|was|were)\b.*\?",
        ];

        // Padrões para Conversational
        let conversational_patterns = vec![
            r"^(oi|olá|ola|hello|hi|hey)\s*$",
            r"\b(como você está|how are you|como vai|how is it going)\b",
            r"\b(obrigado|obrigada|thanks|thank you|thank)\b",
            r"\b(por favor|please|por favor)\b",
            r"\b(tchau|bye|goodbye|até logo|see you)\b",
            r"\b(bom dia|good morning|boa tarde|good afternoon|boa noite|good night)\b",
        ];

        // Padrões para Technical
        let technical_patterns = vec![
            r"\b(como fazer|how to|how do|tutorial|tutoriais)\b",
            r"\b(documentação|documentacao|documentation|docs)\b",
            r"\b(exemplo|example|exemplos|examples)\b",
            r"\b(código|codigo|code|implementação|implementacao|implementation)\b",
            r"\b(api|sdk|framework|library|biblioteca)\b",
            r"\b(erro|error|bug|problema|problem|issue)\b",
            r"\b(guia|guide|manual|instalação|instalacao|installation)\b",
        ];

        // Padrões para Opinion
        let opinion_patterns = vec![
            r"\b(você acha|you think|você pensa|you believe)\b",
            r"\b(opinião|opiniao|opinion|pensar sobre|think about)\b",
            r"\b(gostar|like|preferir|prefer|gosto|taste)\b",
            r"\b(melhor|best|pior|worst|recomendar|recommend)\b",
            r"\b(concordar|agree|discordar|disagree)\b",
        ];

        // Padrões para Calculation
        let calculation_patterns = vec![
            r"\b(calcular|calculate|calcule|calculo)\b",
            r"\b(quanto é|how much|quanto|how many)\b",
            r"\b(\d+\s*[+\-*/]\s*\d+)", // Expressões matemáticas básicas
            r"\b(soma|sum|subtração|subtraction|multiplicação|multiplication|divisão|division)\b",
            r"\b(porcentagem|percentage|percent|por cento)\b",
        ];

        // Calcular scores
        Self::score_patterns(&query_normalized, &factual_patterns, &mut scores, QueryIntent::Factual);
        Self::score_patterns(&query_normalized, &conversational_patterns, &mut scores, QueryIntent::Conversational);
        Self::score_patterns(&query_normalized, &technical_patterns, &mut scores, QueryIntent::Technical);
        Self::score_patterns(&query_normalized, &opinion_patterns, &mut scores, QueryIntent::Opinion);
        Self::score_patterns(&query_normalized, &calculation_patterns, &mut scores, QueryIntent::Calculation);

        // Encontrar intent com maior score
        let mut max_score = 0;
        let mut best_intent = QueryIntent::Unknown;

        for (intent, score) in scores.iter() {
            if *score > max_score {
                max_score = *score;
                best_intent = intent.clone();
            }
        }

        // Se não houver score significativo, retornar Unknown
        if max_score == 0 {
            QueryIntent::Unknown
        } else {
            best_intent
        }
    }

    /// Normaliza a query removendo acentos e caracteres especiais (simplificado)
    fn normalize_query(query: &str) -> String {
        query
            .chars()
            .map(|c| {
                match c {
                    'á' | 'à' | 'ã' | 'â' | 'ä' => 'a',
                    'é' | 'è' | 'ê' | 'ë' => 'e',
                    'í' | 'ì' | 'î' | 'ï' => 'i',
                    'ó' | 'ò' | 'õ' | 'ô' | 'ö' => 'o',
                    'ú' | 'ù' | 'û' | 'ü' => 'u',
                    'ç' => 'c',
                    'ñ' => 'n',
                    'Á' | 'À' | 'Ã' | 'Â' | 'Ä' => 'a',
                    'É' | 'È' | 'Ê' | 'Ë' => 'e',
                    'Í' | 'Ì' | 'Î' | 'Ï' => 'i',
                    'Ó' | 'Ò' | 'Õ' | 'Ô' | 'Ö' => 'o',
                    'Ú' | 'Ù' | 'Û' | 'Ü' => 'u',
                    'Ç' => 'c',
                    'Ñ' => 'n',
                    _ => c,
                }
            })
            .collect::<String>()
            .to_lowercase()
    }

    /// Calcula score para um conjunto de padrões
    fn score_patterns(
        query: &str,
        patterns: &[&str],
        scores: &mut std::collections::HashMap<QueryIntent, i32>,
        intent: QueryIntent,
    ) {
        for pattern in patterns {
            if let Ok(re) = Regex::new(pattern) {
                if re.is_match(query) {
                    *scores.entry(intent.clone()).or_insert(0) += 1;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_factual_intent() {
        assert_eq!(
            IntentClassifier::classify("O que é Python?"),
            QueryIntent::Factual
        );
        assert_eq!(
            IntentClassifier::classify("Qual o preço do Bitcoin?"),
            QueryIntent::Factual
        );
    }

    #[test]
    fn test_conversational_intent() {
        assert_eq!(
            IntentClassifier::classify("Oi, como você está?"),
            QueryIntent::Conversational
        );
        assert_eq!(
            IntentClassifier::classify("Obrigado!"),
            QueryIntent::Conversational
        );
    }

    #[test]
    fn test_technical_intent() {
        assert_eq!(
            IntentClassifier::classify("Como fazer um loop em Python?"),
            QueryIntent::Technical
        );
        assert_eq!(
            IntentClassifier::classify("Documentação da API"),
            QueryIntent::Technical
        );
    }

    #[test]
    fn test_calculation_intent() {
        assert_eq!(
            IntentClassifier::classify("Quanto é 2 + 2?"),
            QueryIntent::Calculation
        );
        assert_eq!(
            IntentClassifier::classify("Calcular porcentagem"),
            QueryIntent::Calculation
        );
    }
}

